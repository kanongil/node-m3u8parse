/*jslint indent: 2, maxlen: 80, continue: false, unparam: false, node: true */
/* -*- tab-width: 2 -*- */
'use strict';

var fs = require('fs'), collect = require('collect-stream'),
  inspect = require('util').inspect,
  readers = {},
  emptyBuffer = Buffer.from('');

function getCachedBuffer(fn) {
  var buf = getCachedBuffer.bufs[fn];
  if (!buf) { throw new Error('File not in Buffer cache: ' + fn); }
  return buf;
}
getCachedBuffer.bufs = {};


function makeMultiDescriber(origDescr) {

  return function multiDescribe(testGroup, registerTests) {
    var hadInputType = {};

    function addTestsForInputType(inputTypeName) {
      if (hadInputType[inputTypeName]) { return; }
      hadInputType[inputTypeName] = true;
      var inputTypeFunc = readers[inputTypeName];
      inputTypeFunc.inputTypeName = inputTypeName;
      origDescr(testGroup + ' [input=' + inputTypeName + ']',
        function () { registerTests(inputTypeFunc); });
    }

    // Stream must go first to establish cache
    addTestsForInputType('stream');
    // … then we're ready for all others:
    Object.keys(readers).sort().forEach(addTestsForInputType);
  }
}


readers.stream = function (fn) {
  var stream = fs.createReadStream(fn);
  collect(stream, function (err, data) {
    if (err) { throw err; }
    if ((data || false).length === 0) { data = emptyBuffer; }
    if (!Buffer.isBuffer(data)) {
      throw new TypeError('Buffer expected for file ' + JSON.stringify(fn)
        + ', not ' + inspect(data));
    }
    getCachedBuffer.bufs[fn] = data;
  });
  return stream;
};

readers.buffer = getCachedBuffer;

readers.string = function (fn) {
  return getCachedBuffer(fn).toString('UTF-8');
};






module.exports = makeMultiDescriber;
