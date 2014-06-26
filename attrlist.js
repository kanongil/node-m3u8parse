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

// no validation is performed on these helpers and they never fail on invalid input
Object.defineProperties(AttrList.prototype, {
  decimalInteger: { value: function(attrName, value) {
    var name = attrName.toLowerCase();
    if (arguments.length > 1) {
      this[name] = '' + Math.floor(value);
    }
    return parseInt(this[name], 10);
  }},

  hexadecimalInteger: { value: function(attrName, value) {
    var name = attrName.toLowerCase();
    if (arguments.length > 1) {
      this[name] = '0x' + Math.floor(value).toString(16);
    }
    return parseInt(this[name], 16);
  }},

  decimalFloatingPoint: { value: function(attrName, value) {
    var name = attrName.toLowerCase();
    if (arguments.length > 1) {
      this[name] = '' + value;
    }
    return parseFloat(this[name]);
  }},

  quotedString: { value: function(attrName, value) {
    var name = attrName.toLowerCase();
    if (arguments.length > 1) {
      this[name] = '"' + value + '"';
    }
    return this[name].slice(1, -1);
  }},

  enumeratedString: { value: function(attrName, value) {
    var name = attrName.toLowerCase();
    if (arguments.length > 1) {
      this[name] = value;
    }
    return this[name];
  }},

  decimalResolution: { value: function(attrName, value) {
    var name = attrName.toLowerCase();
    if (arguments.length > 1) {
      value = value || {};
      this[name] = '' + Math.floor(value.width) + 'x' + Math.floor(value.height);
    }
    var res = /(\d+)x(\d+)/.exec(this[name]);
    return {
      width: res ? res[1] : null,
      height: res ? res[2] : null,
    };
  }},
});

Object.defineProperty(AttrList.prototype, 'toString', {
  value: function() {
    return StringifyAttrList(this);
  }
});
