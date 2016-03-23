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

###*
# @module imageWrite
###

EventEmitter = require('events').EventEmitter
fs = require('fs')
_ = require('lodash')
Promise = require('bluebird')
progressStream = require('progress-stream')
StreamChunker = require('stream-chunker')
utils = require('./utils')
win32 = require('./win32')
checksum = require('./checksum')
denymount = require('./denymount')

###*
# @summary Write a readable stream to a device
# @function
# @public
#
# @description
#
# **NOTICE:** You might need to run this function as sudo/administrator to avoid permission issues.
#
# The returned EventEmitter instance emits the following events:
#
# - `progress`: A progress event that passes a state object of the form:
#
#		{
#			percentage: 9.05,
#			transferred: 949624,
#			length: 10485760,
#			remaining: 9536136,
#			eta: 10,
#			runtime: 0,
#			delta: 295396,
#			speed: 949624
#		}
#
# - `error`: An error event.
# - `done`: An event emitted when the readable stream was written completely.
#
# If you're passing a readable stream from a custom location, you can configure the length by adding a `.length` number property to the stream.
#
# @param {String} device - device
# @param {ReadStream} stream - readable stream
# @returns {EventEmitter} emitter
#
# @example
# myStream = fs.createReadStream('my/image')
# myStream.length = fs.statSync('my/image').size
#
# emitter = imageWrite.write('/dev/disk2', myStream)
#
# emitter.on 'progress', (state) ->
# 	console.log(state)
#
# emitter.on 'error', (error) ->
# 	console.error(error)
#
# emitter.on 'done', ->
# 	console.log('Finished writing to device')
###
exports.write = (device, stream) ->
	emitter = new EventEmitter()

	if not stream.length?
		throw new Error('Stream size missing')

	device = utils.getRawDevice(device)

	progress = progressStream
		length: _.parseInt(stream.length)
		time: 500

	progress.on 'progress', (state) ->
		emitter.emit('progress', state)

	chunkSize = 65536 * 16 # 64K * 16 = 1024K = 1M

	utils.eraseMBR(device).then(win32.prepare).then ->
		Promise.fromNode (callback) ->
			stream
				.pipe(progress)
				.pipe(StreamChunker(chunkSize, flush: true))
				.pipe(fs.createWriteStream(device, flags: 'rs+'))
				.on('close', callback)
				.on('error', callback)
	.then(win32.prepare).then ->
		emitter.emit('done')

	.catch (error) ->

		# TODO: Test this by crafting an unaligned image
		if error.code is 'EINVAL'
			error = new Error '''
				Yikes, your image appears to be invalid.
				Please try again, or get in touch with support@resin.io
			'''

		emitter.emit('error', error)

	return emitter

###*
# @summary Write a readable stream to a device
# @function
# @public
#
# @description
# This function can be used after `write()` to ensure
# the image was successfully written to the device.
#
# This is checked by calculating and comparing checksums
# of both the original image and the data written to a device.
#
# Notice that if you just used `write()`, you usually have
# to create another readable stream from the image since
# the one used previously has all its data consumed already,
# so it will emit no `data` event, leading to false results.
#
# The returned EventEmitter instance emits the following events:
#
# - `progress`: A progress event that passes a state object of the form:
#
# 	{
# 		percentage: 9.05,
# 		transferred: 949624,
# 		length: 10485760,
# 		remaining: 9536136,
# 		eta: 10,
# 		runtime: 0,
# 		delta: 295396,
# 		speed: 949624
# 	}
#
# - `error`: An error event.
# - `done`: An event emitted with a boolean value determining the result of the check.
#
# @param {String} device - device
# @param {ReadStream} stream - image readable stream
# @returns {EventEmitter} - emitter
#
# @example
# myStream = fs.createReadStream('my/image')
# myStream.length = fs.statSync('my/image').size
#
# checker = imageWrite.check('/dev/disk2', myStream)
#
# checker.on 'error', (error) ->
# 	console.error(error)
#
# checker.on 'done', (success) ->
# 	if success
# 		console.log('The write was successful')
###
exports.check = (device, stream) ->
	emitter = new EventEmitter()

	Promise.try ->
		if not stream.length?
			throw new Error('Stream size missing')

		# We prevent disk from auto-mounting since this
		# disrupts the checksum in operating systems that
		# "touch" certain files in mountable partitions,
		# like OS X and Windows.
		denymount.deny(device).then (cancel) ->

			device = fs.createReadStream(utils.getRawDevice(device))

			# Since both the image and device checksum calculation
			# rely on the same input stream, we can safely send
			# both progress states reports to the client at the same.
			emitProgress = (state) ->
				emitter.emit('progress', state)

			return Promise.props
				stream: checksum.calculate stream,
					bytes: stream.length
					progress: emitProgress

				device: checksum.calculate device,
					progress: emitProgress

					# Only calculate the checksum from the bytes that correspond
					# to the original image size and not the whole drive since
					# the drive might contain empty space that changes the
					# resulting checksum.
					# See https://help.ubuntu.com/community/HowToMD5SUM#Check_the_CD
					bytes: stream.length

			.finally(cancel)

	.then (checksums) ->
		emitter.emit('done', checksums.stream is checksums.device)
	.catch (error) ->
		emitter.emit('error', error)

	return emitter
