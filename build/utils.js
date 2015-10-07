
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
var Promise, fs;

Promise = require('bluebird');

fs = Promise.promisifyAll(require('fs'));


/**
 * @summary Erase MBR from a device
 * @function
 * @protected
 *
 * @description
 * Write 512 null bytes at the beginning of a device
 *
 * @param {String} device - device
 * @returns {Promise}
 *
 * @example
 * utils.eraseMBR('/dev/disk2')
 */

exports.eraseMBR = function(device) {
  var buffer, bufferSize;
  bufferSize = 512;
  buffer = new Buffer(bufferSize);
  buffer.fill(0);
  return fs.openAsync(device, 'rs+').then(function(fd) {
    return fs.writeAsync(fd, buffer, 0, bufferSize, 0).spread(function(bytesWritten) {
      if (bytesWritten !== bufferSize) {
        throw new Error("Bytes written: " + bytesWritten + ", expected " + bufferSize);
      }
      return fs.closeAsync(fd);
    });
  });
};


/**
 * @summary Get raw device file
 * @function
 * @protected
 *
 * @description
 * This function only performs manipulations for OS X disks.
 * See http://superuser.com/questions/631592/why-is-dev-rdisk-about-20-times-faster-than-dev-disk-in-mac-os-x
 *
 * @param {String} device - device
 * @returns {String} raw device
 *
 * @example
 * rawDevice = utils.getRawDevice('/dev/disk2')
 */

exports.getRawDevice = function(device) {
  var match;
  match = device.match(/\/dev\/disk(\d+)/);
  if (match == null) {
    return device;
  }
  return "/dev/rdisk" + match[1];
};


/**
 * @summary Get file size
 * @function
 * @protected
 *
 * @param {String} file - file path
 * @fulfil {Number} file size in bytes
 * @returns {Promise}
 *
 * @example
 * utils.getFileSize('foo/bar').then (size) ->
 * 	console.log("Size is #{size} bytes")
 */

exports.getFileSize = function(file) {
  return fs.statAsync(file).get('size');
};


/**
 * @summary Replicate data between two file descriptors
 * @function
 * @protected
 *
 * @param {FileDescriptor} origin - origin fd
 * @param {FileDescriptor} destination - destination fd
 * @param {Number} length - chunk length
 *
 * @fulfil {[ Number, Number ]} bytes read and bytes written
 * @returns {Promise}
 *
 * @example
 * fs = require('fs')
 *
 * input = fs.openSync('foo', 'rs+')
 * output = fs.openSync('bar', 'rs+')
 *
 * utils.replicateData(input, output, 1024).spread (bytesRead, bytesWritten) ->
 * 	console.log("Read #{bytesRead}")
 * 	console.log("Write #{bytesWritten}")
 */

exports.replicateData = function(origin, destination, length) {
  var buffer;
  buffer = new Buffer(length);
  return fs.readAsync(origin, buffer, 0, length, null).spread(function(bytesRead) {
    return fs.writeAsync(destination, buffer, 0, length, null).spread(function(bytesWritten) {
      return [bytesRead, bytesWritten];
    });
  });
};
