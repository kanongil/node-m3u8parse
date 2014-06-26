"use strict";

var clone = require('clone');

var debug = function () {};
try {
  debug = require('debug')('m3u8parse');
} catch (err) {}

var exports = module.exports = AttrList;

// AttrList's are currently handled without any implicit knowledge of key/type mapping
function ParseAttrList(input) {
  // TODO: handle newline escapes in quoted-string's
  var re = /(.+?)=((?:\".*?\")|.*?)(?:,|$)/g;
//  var re = /(.+?)=(?:(?:\"(.*?)\")|(.*?))(?:,|$)/g;
  var match, attrs = {};
  while ((match = re.exec(input)) !== null)
    attrs[match[1].toLowerCase()] = match[2];

  debug('parsed attributes', attrs);
  return attrs;
}

function StringifyAttrList(attrs) {
  var res = '';
  for (var key in attrs) {
    var value = attrs[key];
    if (value !== undefined && value !== null) {
      if (res.length !== 0) res += ',';
      // TODO: sanitize attr values?
      res += key.toUpperCase() + '=' + value;
    }
  }
  return res;
}

function AttrList(attrs) {
  if (!(this instanceof AttrList))
    return new AttrList(attrs);

  if (typeof attrs === 'string')
    attrs = ParseAttrList(attrs);

  for (var attr in attrs) {
    var value =  attrs[attr] || '';
    this[attr] = value.toString();
  }
}

Object.defineProperty(AttrList.prototype, 'toString', {
  value: function() {
    return StringifyAttrList(this);
  }
});
