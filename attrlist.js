"use strict";

var clone = require('clone'),
    BigNumber = require('bignumber.js');

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
      if (Buffer.isBuffer(value)) {
        this[name] = new BigNumber(value.toString('hex'), 16).toString(10);
      } else {
        this[name] = '' + Math.floor(value);
      }
    }
    try {
      var stringValue = new BigNumber(this[name] || '0').toString(16);
      stringValue = ((stringValue.length & 1) ? '0' : '') + stringValue;
      return new Buffer(stringValue, 'hex');
    } catch (e) {
      return new Buffer();
    }
  }},

  hexadecimalInteger: { value: function(attrName, value) {
    var name = attrName.toLowerCase();
    if (arguments.length > 1) {
      if (Buffer.isBuffer(value))
        this[name] = '0x' + value.toString('hex');
      else
        this[name] = '0x' + Math.floor(value).toString(16);
    }
    var stringValue = (this[name] || '0x').slice(2);
    stringValue = ((stringValue.length & 1) ? '0' : '') + stringValue;
    return new Buffer(stringValue, 'hex');
  }},

  decimalIntegerAsNumber: { value: function(attrName, value) {
    var name = attrName.toLowerCase();
    if (arguments.length > 1)
      this.decimalInteger(name, value);

    var intValue = parseInt(this[name], 10);
    if (intValue >= Number.MAX_VALUE)
      throw new RangeError('Value is to large to represent without loss of precision');
    return intValue;
  }},

  hexadecimalIntegerAsNumber: { value: function(attrName, value) {
    var name = attrName.toLowerCase();
    if (arguments.length > 1)
      this.hexadecimalInteger(name, value);

    var intValue = parseInt(this[name], 16);
    if (intValue >= Number.MAX_VALUE)
      throw new RangeError('Value is to large to represent without loss of precision');
    return intValue;
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
