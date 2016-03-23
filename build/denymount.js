
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
var Promise, denymount, os, path, _;

Promise = require('bluebird');

path = require('path');

_ = require('lodash');

os = require('os');

denymount = require('denymount');


/**
 * @summary Prevent auto-mounting of a drive
 * @function
 * @protected
 *
 * @param {String} device - device
 * @fulfil {Function} - cancel function
 * @returns {Promise}
 *
 * @todo This code should be moved to `resin-io/denymount`.
 *
 * @example
 * denymount.deny('/dev/disk2').then (cancel) ->
 * 	cancel()
 */

exports.deny = function(device) {
  return new Promise(function(resolve, reject) {
    var cancel;
    if (os.platform() !== 'darwin') {
      return resolve(_.noop);
    }
    cancel = denymount(path.basename(device), function(error) {
      if (error != null) {
        return reject(error);
      }
    });
    return resolve(cancel);
  });
};
