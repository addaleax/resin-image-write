
/*
Copyright 2016 Resin.io

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 */

/**
 * @module imageWrite
 */
var EventEmitter, Promise, StreamChunker, checksum, denymount, fs, progressStream, utils, win32, _;

EventEmitter = require('events').EventEmitter;

fs = require('fs');

_ = require('lodash');

Promise = require('bluebird');

progressStream = require('progress-stream');

StreamChunker = require('stream-chunker');

utils = require('./utils');

win32 = require('./win32');

checksum = require('./checksum');

denymount = require('./denymount');


/**
 * @summary Write a readable stream to a device
 * @function
 * @public
 *
 * @description
 *
 * **NOTICE:** You might need to run this function as sudo/administrator to avoid permission issues.
 *
 * The returned EventEmitter instance emits the following events:
 *
 * - `progress`: A progress event that passes a state object of the form:
 *
 *		{
 *			percentage: 9.05,
 *			transferred: 949624,
 *			length: 10485760,
 *			remaining: 9536136,
 *			eta: 10,
 *			runtime: 0,
 *			delta: 295396,
 *			speed: 949624
 *		}
 *
 * - `error`: An error event.
 * - `done`: An event emitted when the readable stream was written completely.
 *
 * If you're passing a readable stream from a custom location, you can configure the length by adding a `.length` number property to the stream.
 *
 * @param {String} device - device
 * @param {ReadStream} stream - readable stream
 * @returns {EventEmitter} emitter
 *
 * @example
 * myStream = fs.createReadStream('my/image')
 * myStream.length = fs.statSync('my/image').size
 *
 * emitter = imageWrite.write('/dev/disk2', myStream)
 *
 * emitter.on 'progress', (state) ->
 * 	console.log(state)
 *
 * emitter.on 'error', (error) ->
 * 	console.error(error)
 *
 * emitter.on 'done', ->
 * 	console.log('Finished writing to device')
 */

exports.write = function(device, stream) {
  var chunkSize, emitter, progress;
  emitter = new EventEmitter();
  if (stream.length == null) {
    throw new Error('Stream size missing');
  }
  device = utils.getRawDevice(device);
  progress = progressStream({
    length: _.parseInt(stream.length),
    time: 500
  });
  progress.on('progress', function(state) {
    return emitter.emit('progress', state);
  });
  chunkSize = 65536 * 16;
  utils.eraseMBR(device).then(win32.prepare).then(function() {
    return Promise.fromNode(function(callback) {
      return stream.pipe(progress).pipe(StreamChunker(chunkSize, {
        flush: true
      })).pipe(fs.createWriteStream(device, {
        flags: 'rs+'
      })).on('close', callback).on('error', callback);
    });
  }).then(win32.prepare).then(function() {
    return emitter.emit('done');
  })["catch"](function(error) {
    if (error.code === 'EINVAL') {
      error = new Error('Yikes, your image appears to be invalid.\nPlease try again, or get in touch with support@resin.io');
    }
    return emitter.emit('error', error);
  });
  return emitter;
};


/**
 * @summary Write a readable stream to a device
 * @function
 * @public
 *
 * @description
 * This function can be used after `write()` to ensure
 * the image was successfully written to the device.
 *
 * This is checked by calculating and comparing checksums
 * of both the original image and the data written to a device.
 *
 * Notice that if you just used `write()`, you usually have
 * to create another readable stream from the image since
 * the one used previously has all its data consumed already,
 * so it will emit no `data` event, leading to false results.
 *
 * The returned EventEmitter instance emits the following events:
 *
 * - `progress`: A progress event that passes a state object of the form:
 *
 * 	{
 * 		percentage: 9.05,
 * 		transferred: 949624,
 * 		length: 10485760,
 * 		remaining: 9536136,
 * 		eta: 10,
 * 		runtime: 0,
 * 		delta: 295396,
 * 		speed: 949624
 * 	}
 *
 * - `error`: An error event.
 * - `done`: An event emitted with a boolean value determining the result of the check.
 *
 * @param {String} device - device
 * @param {ReadStream} stream - image readable stream
 * @returns {EventEmitter} - emitter
 *
 * @example
 * myStream = fs.createReadStream('my/image')
 * myStream.length = fs.statSync('my/image').size
 *
 * checker = imageWrite.check('/dev/disk2', myStream)
 *
 * checker.on 'error', (error) ->
 * 	console.error(error)
 *
 * checker.on 'done', (success) ->
 * 	if success
 * 		console.log('The write was successful')
 */

exports.check = function(device, stream) {
  var emitter;
  emitter = new EventEmitter();
  Promise["try"](function() {
    if (stream.length == null) {
      throw new Error('Stream size missing');
    }
    return denymount.deny(device).then(function(cancel) {
      var emitProgress;
      device = fs.createReadStream(utils.getRawDevice(device));
      emitProgress = function(state) {
        return emitter.emit('progress', state);
      };
      return Promise.props({
        stream: checksum.calculate(stream, {
          bytes: stream.length,
          progress: emitProgress
        }),
        device: checksum.calculate(device, {
          progress: emitProgress,
          bytes: stream.length
        })
      })["finally"](cancel);
    });
  }).then(function(checksums) {
    return emitter.emit('done', checksums.stream === checksums.device);
  })["catch"](function(error) {
    return emitter.emit('error', error);
  });
  return emitter;
};
