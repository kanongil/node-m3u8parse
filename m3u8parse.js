"use strict";

var path = require('path'),
    util = require('util'),
    carrier = require('carrier'),
    clone = require('clone');

var AttrList = require('./attrlist');

var debug = function () {};
try {
  debug = require('debug')('m3u8parse');
} catch (err) {}

var exports = module.exports = M3U8Parse;

exports.M3U8Playlist = M3U8Playlist;
exports.M3U8Segment = M3U8Segment;
exports.AttrList = AttrList;
exports.ParserError = ParserError;

function M3U8Playlist(obj) {
  if (!(this instanceof M3U8Playlist))
    return new M3U8Playlist(obj);

  obj = obj || {};

  this.variant = obj.variant || false;

  // initialize to default values
  this.version = obj.version || 1; // V1
  this.allow_cache = obj.allow_cache || true;
  this.i_frames_only = obj.i_frames_only || false; // V4
  this.target_duration = obj.target_duration || undefined;
  this.first_seq_no = obj.first_seq_no || 0;
  this.type = obj.type; // V3+
  this.ended = obj.ended || false;
  this.discontinuity_sequence = obj.discontinuity_sequence || 0; // V6
  this.start = new AttrList(obj.start); // V6
  this.independent_segments = obj.independent_segments; // V6

  this.segments = [];
  if (obj.segments) {
    this.segments = obj.segments.map(function (segment) {
      return new M3U8Segment(segment);
    });
  }

  // for variant streams
  this.programs = clone(obj.programs) || {};
  Object.keys(this.programs).forEach(function(id) {
    var list = this.programs[id];
    list.forEach(function(program) {
      if (program.info) program.info = new AttrList(program.info);
    });
  }, this);

  this.groups = clone(obj.groups) || {};
  Object.keys(this.groups).forEach(function(id) {
    var list = this.groups[id];
    for (var idx = 0; idx < list.length; idx++)
      list[idx] = new AttrList(list[idx]);
  }, this);

  this.iframes = clone(obj.iframes) || {}; // V4
  Object.keys(this.iframes).forEach(function(id) {
    var list = this.iframes[id];
    for (var idx = 0; idx < list.length; idx++)
      list[idx] = new AttrList(list[idx]);
  }, this);

  // custom vendor extensions
  if (obj.vendor)
    this.vendor = clone(obj.vendor);
}

M3U8Playlist.prototype.PlaylistType = {
  EVENT: 'EVENT',
  VOD: 'VOD'
};

M3U8Playlist.prototype.totalDuration = function() {
  return this.segments.reduce(function(sum, segment) {
    return sum + segment.duration;
  }, 0);
};

M3U8Playlist.prototype.isLive = function() {
  return !(this.ended || this.type === this.PlaylistType.VOD);
};

M3U8Playlist.prototype.startSeqNo = function(full) {
  if (!this.isLive() || full) return this.first_seq_no;

  var duration = this.target_duration * 3;
  for (var i = ~~this.segments.length - 1; i > 0; i--) {
    duration -= this.segments[i].duration;
    if (duration < 0) break;
  }
  // TODO: validate that correct seqNo is returned
  return this.first_seq_no + i;
};

M3U8Playlist.prototype.lastSeqNo = function() {
  return this.first_seq_no + this.segments.length - 1;
};

// return whether the seqNo is in the index
M3U8Playlist.prototype.isValidSeqNo = function(seqNo) {
  return (seqNo >= this.first_seq_no) && (seqNo <= this.lastSeqNo());
};

function lastSegmentProperty(index, key, seqNo, incrFn) {
  var segment;
  while ((segment = index.getSegment(seqNo--)) !== null) {
    if (incrFn && incrFn(segment))
      return null;
    var val = segment[key];
    if (val) return val;
  }
  return null;
}

M3U8Playlist.prototype.dateForSeqNo = function(seqNo) {
  var elapsed = 0;
  var program_time = lastSegmentProperty(this, 'program_time', seqNo, function(segment) {
    elapsed += segment.duration;
    return segment.discontinuity; // abort on discontinuity
  });

  return program_time ? new Date(program_time.getTime() + (elapsed - this.getSegment(seqNo).duration) * 1000) : null;
};

M3U8Playlist.prototype.seqNoForDate = function(date, findNearestAfter) {
  if (typeof date === 'boolean') {
    findNearestAfter = date;
    date = null;
  }

  var startTime = date;
  if (typeof date !== 'number')
    startTime = date ? +new Date(date) : Date.now();

  // if findNearestAfter is true, the first sequence number after the date is returned
  findNearestAfter = !!findNearestAfter;

  // no assumptions are made about monotonic time
  var firstValid = { seqNo: -1, delta: null, duration: 0 };
  var segmentEndTime = -1;

  var segments = this.segments, count = ~~segments.length;
  for (var idx = 0; idx < count; idx++) {
    var segment = segments[idx];

    if (segment.program_time) {
      segmentEndTime = segment.program_time.getTime();
    } if (segment.discontinuity) {
      segmentEndTime = -1;
    }

    var segmentDuration = 1000 * segment.duration;
    if (segmentEndTime !== -1 && segmentDuration > 0) {
      segmentEndTime += segmentDuration;

      // update firstValid
      var delta = segmentEndTime - startTime - 1;
      if (delta >= 0 && (firstValid.delta === null || delta < firstValid.delta || delta < segmentDuration)) {
        firstValid.seqNo = this.first_seq_no + idx;
        firstValid.delta = delta;
        firstValid.duration = segmentDuration;
      }
    }
  }

  if (!findNearestAfter && firstValid.delta >= firstValid.duration)
    return -1;

  return firstValid.seqNo;
};

// TODO: support multiple key entries for a single segment - probably requires a version bump
M3U8Playlist.prototype.keyForSeqNo = function(seqNo) {
  var key = new AttrList(lastSegmentProperty(this, 'key', seqNo)),
      keymethod = key.enumeratedString('method');

  if (!keymethod || keymethod === 'NONE')
    return null;

  var keyformat = (this.version >= 5 && key.keyformat) ? key.enumeratedString('keyformat') : 'identity';
  if (keyformat === 'identity' && !key.iv)
    key.hexadecimalInteger('iv', seqNo);

  return key;
};

M3U8Playlist.prototype.byterangeForSeqNo = function(seqNo) {
  var seqIndex = seqNo - this.first_seq_no;
  var seqSegment = this.segments[seqIndex] || null;
  if (!seqSegment || !seqSegment.byterange) return null;

  var length = parseInt(seqSegment.byterange.length, 10);
  if (isNaN(length)) return null;

  var offset = parseInt(seqSegment.byterange.offset, 10);
  if (isNaN(offset)) {
    // compute actual value from history
    offset = 0;

    for (var idx = seqIndex-1; idx >= 0; idx--) {
      var segment = this.segments[idx];
      if (segment.uri !== seqSegment.uri) continue;
      if (!segment.byterange) break; // consistency error

      var segmentLength = parseInt(segment.byterange.length, 10);
      var segmentOffset = parseInt(segment.byterange.offset, 10);
      if (isNaN(segmentLength)) break; // consistency error

      offset += segmentLength;
      if (!isNaN(segmentOffset)) {
        offset += segmentOffset;
        break;
      }
    }
  }

  return {
    length: length,
    offset: offset
  };
};

M3U8Playlist.prototype.mapForSeqNo = function(seqNo) {
  return lastSegmentProperty(this, 'map', seqNo, function(segment) {
    return segment.discontinuity; // abort on discontinuity
  });
};

M3U8Playlist.prototype.getSegment = function(seqNo, independent) {
  // TODO: should we check for number type and throw if not?
  var index = seqNo - this.first_seq_no;
  var segment = this.segments[index] || null;
  if (independent && segment) {
    segment = new M3U8Segment(segment);
    // EXT-X-KEY, EXT-X-MAP, EXT-X-PROGRAM-DATE-TIME, EXT-X-BYTERANGE needs to be individualized
    segment.program_time = this.dateForSeqNo(seqNo);
    segment.key = this.keyForSeqNo(seqNo);
    if (this.version >= 4)
      segment.byterange = this.byterangeForSeqNo(seqNo);
    if (this.version >= 5)
      segment.map = this.mapForSeqNo(seqNo);
    // note: 'uri' is not resolved to an absolute url, since it principally opaque
  }
  return segment;
};

M3U8Playlist.prototype.toString = function() {
  var m3u8 = '#EXTM3U\n';

  if (this.version > 1)
    m3u8 += '#EXT-X-VERSION:' + this.version + '\n';

  // add non-standard marlin entry
  if (this.key) {
    var keys = util.isArray(this.key) ? this.key : [this.key];
    keys.forEach(function(key) {
      m3u8 += '#EXT-X-KEY:' + AttrList(key) + '\n';
    });
  }

  if (this.variant) {
    var groupId, programId;

    for (groupId in this.groups) {
      this.groups[groupId].forEach(function (group) {
        m3u8 += '#EXT-X-MEDIA:' + AttrList(group) + '\n';
      });
    }

    var iframes = util.isArray(this.iframes) ? { null: this.iframes } : this.iframes;
    for (programId in iframes) {
      iframes[programId].forEach(function (iframe) {
        m3u8 += '#EXT-X-I-FRAME-STREAM-INF:' + AttrList(iframe) + '\n';
      });
    }

    var programs = util.isArray(this.programs) ? { null: this.programs } : this.programs;
    for (programId in programs) {
      programs[programId].forEach(function (program) {
        m3u8 += '#EXT-X-STREAM-INF:' + AttrList(program.info) + '\n';
        m3u8 += program.uri + '\n';
      });
    }
  } else {
    m3u8 += '#EXT-X-TARGETDURATION:' + this.target_duration + '\n';

    if (this.type)
      m3u8 += '#EXT-X-PLAYLIST-TYPE:' + this.type + '\n';

    if (!this.allow_cache)
      m3u8 += '#EXT-X-ALLOW-CACHE:NO\n';

    var firstSeqNo = parseInt(this.first_seq_no, 10) || 0;
    if (firstSeqNo !== 0)
      m3u8 += '#EXT-X-MEDIA-SEQUENCE:' + firstSeqNo + '\n';

    if (this.type !== this.PlaylistType.VOD && this.type !== this.PlaylistType.EVENT) {
      var discontinuitySequence = parseInt(this.discontinuity_sequence, 10) || 0;
      if (discontinuitySequence !== 0)
        m3u8 += '#EXT-X-DISCONTINUITY-SEQUENCE:' + discontinuitySequence + '\n'; // soft V6
    }

    if (this.start && Object.keys(this.start).length)
      m3u8 += '#EXT-X-START:' + AttrList(this.start) + '\n'; // soft V6

    if (this.independent_segments)
      m3u8 += '#EXT-X-INDEPENDENT-SEGMENTS\n'; // soft V6

    if (this.version >= 4 && this.i_frames_only)
      m3u8 += '#EXT-X-I-FRAMES-ONLY:YES\n';
  }

  // add vendor extensions
  for (var ext in (this.vendor || {})) {
    var value = this.vendor[ext];
    m3u8 += ext;
    if (value !== null && typeof value !== 'undefined')
      m3u8 += ':' + value;
    m3u8 += '\n';
  }

  this.segments.forEach(function (segment) {
    m3u8 += segment.toString();
  });

  if (this.ended && !this.variant)
    m3u8 += '#EXT-X-ENDLIST\n';

  return m3u8;
};

function M3U8Segment(uri, meta, version) {
  if (uri.uri) {
    meta = uri;
    uri = meta.uri;
    version = 10000;
  }

  this.duration = meta.duration;
  this.title = meta.title;
  this.uri = uri;
  this.discontinuity = meta.discontinuity || false;

  // optional
  if (meta.program_time)
    this.program_time = new Date(meta.program_time);
  if (meta.key)
    this.key = new AttrList(meta.key);

  if (version >= 4 && meta.byterange)
    this.byterange = clone(meta.byterange);
  if (version >= 5 && meta.map)
    this.map = new AttrList(meta.map);

  // custom vendor extensions
  if (meta.vendor)
    this.vendor = clone(meta.vendor);
}

M3U8Segment.prototype.toString = function() {
  var res = '';
  if (this.discontinuity) res += '#EXT-X-DISCONTINUITY\n';
  if (this.program_time) {
    var program_time = this.program_time.toISOString ? this.program_time.toISOString() : this.program_time;
    res += '#EXT-X-PROGRAM-DATE-TIME:' + program_time + '\n';
  }
  if (this.key) res += '#EXT-X-KEY:' + AttrList(this.key) + '\n';
  if (this.map) res += '#EXT-X-MAP:' + AttrList(this.map) + '\n';
  if (this.byterange && (this.byterange.length || this.byterange.length === 0)) {
    var range = '' + this.byterange.length;
    if (this.byterange.offset || this.byterange.offset === 0)
      range += '@' + this.byterange.offset;
    res += '#EXT-X-BYTERANGE:' + range + '\n';
  }

  // add vendor extensions
  for (var ext in (this.vendor || {})) {
    var value = this.vendor[ext];
    res += ext;
    if (value !== null && typeof value !== 'undefined')
      res += ':' + value;
    res += '\n';
  }

  return res + '#EXTINF:' + parseFloat(this.duration.toFixed(3)) + ',' + this.title + '\n' + this.uri + '\n';
};

function M3U8Parse(stream, options, cb) {
  var m3u8 = new M3U8Playlist(),
      line_no = 0,
      meta = {};

  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  var extensions = clone(options.extensions || {});

  var cr = carrier.carry(stream);
  cr.on('line', ParseLine);
  cr.on('end', Complete);

  stream.on('error', ReportError);

  function cleanup() {
    stream.removeListener('error', ReportError);
    cr.removeListener('line', ParseLine);
    cr.removeListener('end', Complete);
  }

  function ReportError(err) {
    cleanup();
    cb(err);
  }

  function Complete() {
    if (line_no === 0)
      return ReportError(new ParserError('No line data', '', -1));
    cleanup();
//    m3u8.segments = m3u8.segments.slice(0,3); // temp hack
    cb(null, m3u8);
  }

  function ParseExt(cmd, arg) {
    // parse vendor extensions
    if (cmd in extensions) {
      var extObj = options.extensions[cmd] ? meta : m3u8;
      if (!extObj.vendor) extObj.vendor = {};

      extObj.vendor[cmd] = arg;
      return true;
    }

    if (!(cmd in extParser))
      return false;

    debug('parsing ext', cmd, arg);
    extParser[cmd](arg);
    return true;
  }

  function ParseLine(line) {
    line_no += 1;

    if (line_no === 1) {
      if (line !== '#EXTM3U')
        return ReportError(new ParserError('Missing required #EXTM3U header', line, line_no));
      return true;
    }

    if (!line.length) return true; // blank lines are ignored (3.1)

    if (line[0] === '#') {
      var matches = /^(#EXT[^:]*)(:?.*)$/.exec(line);
      if (!matches)
        return debug('ignoring comment', line);

      var cmd = matches[1],
          arg = matches[2].length > 1 ? matches[2].slice(1) : null;

      if (!ParseExt(cmd, arg))
        return debug('ignoring unknown #EXT:' + cmd, line_no);
    } else if (m3u8.variant) {
      var id = meta.info.decimalIntegerAsNumber('program-id');
      if (isNaN(id)) id = null;

      if (!(id in m3u8.programs))
        m3u8.programs[id] = [];

      meta.uri = line;
      m3u8.programs[id].push(meta);
      meta = {};
    } else {
      if (!('duration' in meta))
        return ReportError(new ParserError('Missing #EXTINF before media file URI', line, line_no));

      m3u8.segments.push(new M3U8Segment(line, meta, m3u8.version));
      meta = {};
    }
    return true;
  }

  // TODO: add more validation logic
  var extParser = {
    '#EXT-X-VERSION': function(arg) {
      m3u8.version = parseInt(arg, 10);

      var attrname;
      if (m3u8.version >= 4)
        for (attrname in extParserV4) { extParser[attrname] = extParserV4[attrname]; }
      if (m3u8.version >= 5)
        for (attrname in extParserV5) { extParser[attrname] = extParserV5[attrname]; }
    },
    '#EXT-X-TARGETDURATION': function(arg) {
      m3u8.target_duration = parseInt(arg, 10);
    },
    '#EXT-X-ALLOW-CACHE': function(arg) {
      m3u8.allow_cache = (arg !== 'NO');
    },
    '#EXT-X-MEDIA-SEQUENCE': function(arg) {
      m3u8.first_seq_no = parseInt(arg, 10);
    },
    '#EXT-X-DISCONTINUITY-SEQUENCE':function(arg) {
      m3u8.discontinuity_sequence = parseInt(arg, 10);
    },
    '#EXT-X-PLAYLIST-TYPE': function(arg) {
      m3u8.type = arg;
    },
    '#EXT-X-START': function(arg) {
      m3u8.start = new AttrList(arg);
    },
    '#EXT-X-INDEPENDENT-SEGMENTS': function() {
      m3u8.independent_segments = true;
    },
    '#EXT-X-ENDLIST': function() {
      m3u8.ended = true;
    },

    '#EXTINF': function(arg) {
      var n = arg.split(',');
      meta.duration = parseFloat(n.shift());
      meta.title = n.join(',');

      if (meta.duration <= 0)
        return ReportError(new ParserError('Invalid duration', '#EXTINF:' + arg, line_no));
    },
    '#EXT-X-KEY': function(arg) {
      meta.key = new AttrList(arg);
    },
    '#EXT-X-PROGRAM-DATE-TIME': function(arg) {
      meta.program_time = new Date(arg);
    },
    '#EXT-X-DISCONTINUITY': function() {
      meta.discontinuity = true;
    },

    // variant
    '#EXT-X-STREAM-INF': function(arg) {
      m3u8.variant = true;
      meta.info = new AttrList(arg);
    },
    // variant v4 since variant streams are not required to specify version
    '#EXT-X-MEDIA': function(arg) {
      var attrs = new AttrList(arg),
          id = attrs.quotedString('group-id') || '#';

      if (!(id in m3u8.groups)) {
        m3u8.groups[id] = [];
        if (id !== '#')
          m3u8.groups[id].type = attrs.type;
      }
      m3u8.groups[id].push(attrs);
    },
    '#EXT-X-I-FRAME-STREAM-INF': function(arg) {
      var attrs = new AttrList(arg),
          id = attrs.decimalIntegerAsNumber('program-id');
      if (isNaN(id)) id = null;

      m3u8.variant = true;

      if (!(id in m3u8.iframes))
        m3u8.iframes[id] = [];

      m3u8.iframes[id].push(attrs);
    }
  };

  var extParserV4 = {
    '#EXT-X-I-FRAMES-ONLY': function() {
      m3u8.i_frames_only = true;
    },
    '#EXT-X-BYTERANGE': function(arg) {
      var n = arg.split('@');
      meta.byterange = {length:parseInt(n[0], 10)};
      if (n.length > 1)
        meta.byterange.offset = parseInt(n[1], 10);
    }
  };

  var extParserV5 = {
    '#EXT-X-MAP': function(arg) {
      meta.map = new AttrList(arg);
    }
  };
}

function ParserError(msg, line, line_no, constr) {
  Error.captureStackTrace(this, constr || this);
  this.message = msg || 'Error';
  this.line = line;
  this.lineNumber = line_no;
}
util.inherits(ParserError, Error);
ParserError.prototype.name = 'Parser Error';
