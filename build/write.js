
/*
The MIT License

Copyright (c) 2015 Resin.io, Inc. https://resin.io.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
 */

/**
 * @module imageWrite
 */
var Eta, EventEmitter, Promise, fs, utils, win32, _;

EventEmitter = require('events').EventEmitter;

Promise = require('bluebird');

fs = Promise.promisifyAll(require('fs'));

Eta = require('node-eta');

_ = require('lodash');

utils = require('./utils');

win32 = require('./win32');


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
 *			delta: 295396,
 *			speed: 949624
 *		}
 *
 * - `error`: An error event.
 * - `done`: An event emitted when the readable stream was written completely.
 *
 * @param {String} image - image path
 * @param {String} device - device
 * @returns {EventEmitter} emitter
 *
 * @example
 * emitter = imageWrite.write('my/image', '/dev/disk2')
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

exports.write = function(image, device) {
  var chunkSize, emitter, openFile;
  emitter = new EventEmitter();
  device = utils.getRawDevice(device);
  openFile = function(file) {
    return fs.openAsync(file, 'rs+').disposer(function(fd) {
      return fs.closeAsync(fd);
    });
  };
  chunkSize = 1024 * 1024;
  utils.eraseMBR(device).then(win32.prepare).then(_.partial(utils.getFileSize, image)).then(function(imageSize) {
    return Promise.using(openFile(image), openFile(device), function(imageFd, deviceFd) {
      var copyFrom, eta;
      eta = new Eta(imageSize / chunkSize);
      eta.start();
      copyFrom = function(written, size) {
        return utils.replicateData(imageFd, deviceFd, size).spread(function(bytesRead, bytesWritten) {
          written += size;
          eta.iterate();
          emitter.emit('progress', {
            percentage: written * 100 / imageSize,
            transferred: written,
            length: imageSize,
            delta: size,
            remaining: imageSize - written,
            eta: Math.floor(eta.getEtaInSeconds()),
            speed: eta.getIterationsPerSecond() * chunkSize
          });
          if (written < imageSize) {
            return copyFrom(written, size);
          }
        });
      };
      return copyFrom(0, chunkSize);
    });
  }).then(win32.prepare).then(function() {
    return emitter.emit('done');
  })["catch"](function(error) {
    return emitter.emit('error', error);
  });
  return emitter;
};
