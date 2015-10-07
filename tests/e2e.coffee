m = require('mochainon')
path = require('path')
wary = require('wary')
Promise = require('bluebird')
fs = Promise.promisifyAll(require('fs'))
imageWrite = require('../lib/write')

RANDOM1 = path.join(__dirname, 'images', '1.random')
RANDOM2 = path.join(__dirname, 'images', '2.random')

wary.it 'should be able to burn data to a file',
	random1: RANDOM1
	random2: RANDOM2
, (images) ->
	Promise.fromNode (callback) ->
		writer = imageWrite.write(images.random1, images.random2)
		writer.on('error', callback)
		writer.on('done', callback)
	.then ->
		Promise.props
			random1: fs.readFileAsync(images.random1)
			random2: fs.readFileAsync(images.random2)
		.then (results) ->
			m.chai.expect(results.random1.length).to.equal(results.random2.length)
			m.chai.expect(results.random1).to.deep.equal(results.random2)

wary.run().catch (error) ->
	console.error(error.message)
	process.exit(1)
