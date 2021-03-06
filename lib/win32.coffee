###
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
###

Promise = require('bluebird')
os = require('os')
isWindows = os.platform() is 'win32'

if isWindows
	diskpart = Promise.promisifyAll(require('diskpart'))

###*
# @summary Prepare Windows drives
# @function
# @protected
#
# @description
# This function runs
#
# - diskpart `rescan` command.
#
# It will do nothing if not being run in Windows.
#
# @returns {Promise}
#
# @example
# win32.prepare()
###
exports.prepare = ->
	Promise.try ->
		diskpart.evaluateAsync([ 'rescan' ]) if isWindows
