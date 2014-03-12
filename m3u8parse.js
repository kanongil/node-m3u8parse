"use strict";

var path = require('path'),
    util = require('util'),
    carrier = require('carrier'),
    clone = require('clone');

var debug = function () {};
try {
  debug = require('debug')('m3u8parse');
} catch (err) {}

var exports = module.exports = M3U8Parse;

exports.M3U8Playlist = M3U8Playlist;
exports.M3U8Segment = M3U8Segment;
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
  this.start = clone(obj.start); // V6

  this.segments = [];
  if (obj.segments) {
    this.segments = obj.segments.map(function (segment) {
      return new M3U8Segment(segment);
    });
  }

  // for variant streams
  this.programs = clone(obj.programs) || {};
  this.groups = clone(obj.groups) || {};
  this.iframes = clone(obj.iframes) || {}; // V4
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
  for (var i=this.segments.length-1; i>0; i--) {
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

M3U8Playlist.prototype.dateForSeqNo = function(seqNo) {
  var segment, targetSegment = this.getSegment(seqNo);
  var elapsed = 0;

  // walk backwards until we find a segment with program_time
  while (segment = this.getSegment(seqNo--)) {
    elapsed += segment.duration;
    if (segment.program_time)
      return new Date(segment.program_time.getTime() + (elapsed - targetSegment.duration) * 1000);
  }

  // nothing found
  return null;
};

M3U8Playlist.prototype.getSegment = function(seqNo) {
  // TODO: should we check for number type and throw if not?
  var index = seqNo-this.first_seq_no;
  if (index < 0 || index > this.segments.length)
    return null;
  return this.segments[index];
};

M3U8Playlist.prototype.toString = function() {
  var m3u8 = '#EXTM3U\n';

  if (this.version > 1)
    m3u8 += '#EXT-X-VERSION:' + this.version + '\n';

  // add non-standard marlin entry
  if (this.key) {
    var keys = util.isArray(this.key) ? this.key : [this.key];
    keys.forEach(function(key) {
      m3u8 += '#EXT-X-KEY:' + StringifyAttrList(key) + '\n';
    });
  }

  if (this.variant) {
    for (var group_id in this.groups) {
      this.groups[group_id].forEach(function (group) {
        m3u8 += '#EXT-X-MEDIA:' + StringifyAttrList(group) + '\n';
      });
    }

    for (var program_id in this.iframes) {
      this.iframes[program_id].forEach(function (iframe) {
        m3u8 += '#EXT-X-I-FRAME-STREAM-INF:' + StringifyAttrList(iframe) + '\n';
      });
    }

    for (var program_id in this.programs) {
      this.programs[program_id].forEach(function (program) {
        m3u8 += '#EXT-X-STREAM-INF:' + StringifyAttrList(program.info) + '\n';
        m3u8 += program.uri + '\n';
      });
    }
  } else {
    m3u8 += '#EXT-X-TARGETDURATION:' + this.target_duration + '\n';

    if (this.type)
      m3u8 += '#EXT-X-PLAYLIST-TYPE:' + this.type + '\n';

    if (!this.allow_cache)
      m3u8 += '#EXT-X-ALLOW-CACHE:NO\n';

    if (this.first_seq_no != 0)
      m3u8 += '#EXT-X-MEDIA-SEQUENCE:' + this.first_seq_no + '\n';

    if (this.discontinuity_sequence != 0)
      m3u8 += '#EXT-X-DISCONTINUITY-SEQUENCE:' + this.discontinuity_sequence + '\n'; // soft V6

    if (this.start && Object.keys(this.start).length)
      m3u8 += '#EXT-X-START:' + StringifyAttrList(this.start) + '\n'; // soft V6

    if (this.version >= 4 && this.i_frames_only)
      m3u8 += '#EXT-X-I-FRAMES-ONLY:YES\n';
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
    this.program_time = meta.program_time;
  if (meta.key)
    this.key = meta.key;

  if (version >= 5 && meta.map)
    this.map = meta.map;
}

M3U8Segment.prototype.toString = function() {
  var res = '';
  if (this.discontinuity) res += '#EXT-X-DISCONTINUITY\n'
  if (this.program_time) {
    var program_time = this.program_time.toISOString ? this.program_time.toISOString() : this.program_time;
    res += '#EXT-X-PROGRAM-DATE-TIME:' + program_time + '\n';
  }
  if (this.key) res += '#EXT-X-KEY:' + StringifyAttrList(this.key) + '\n';
  if (this.map) res += '#EXT-X-MAP:' + StringifyAttrList(this.map) + '\n';
  if (this.byterange && (this.byterange.length + this.byterange.offset)) {
    var range = '' + this.byterange.length;
    if (this.byterange.offset)
      range += '@' + this.byterange.offset;
    res += '#EXT-X-BYTERANGE:' + range + '\n';
  }

  return res + '#EXTINF:' + parseFloat(this.duration.toFixed(3)) + ',' + this.title + '\n' + this.uri + '\n';
};

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

function M3U8Parse(stream, cb) {
  var m3u8 = new M3U8Playlist(),
      line_no = 0,
      meta = {};

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
      return ReportError(new ParserError('No line data', '', -1))
    cleanup();
//    m3u8.segments = m3u8.segments.slice(0,3); // temp hack
    cb(null, m3u8);
  }

  function ParseExt(cmd, arg) {
    if (!(cmd in extParser))
      return false;

    debug('parsing ext', cmd, arg);
    extParser[cmd](arg);
    return true;
  }
  
  function unquote(str) {
    return str.slice(1,-1);
  }

  function ParseLine(line) {
    line_no += 1;

    if (line_no === 1) {
      if (line !== '#EXTM3U')
        return ReportError(new ParserError('Missing required #EXTM3U header', line, line_no));
      return;
    }

    if (!line.length) return; // blank lines are ignored (3.1)
        
    if (line[0] === '#') {
      var matches = line.match(/^(#EXT[^:]*):?(.*)/);
      if (!matches)
        return debug('ignoring comment', line);

      var cmd = matches[1],
          arg = matches[2];

      if (!ParseExt(cmd, arg))
        return ReportError(new ParserError('Unknown #EXT: '+cmd, line, line_no));
    } else if (m3u8.variant) {
      var id = meta.info['program-id'];
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
  }

  // TODO: add more validation logic
  var extParser = {
    '#EXT-X-VERSION': function(arg) {
      m3u8.version = parseInt(arg, 10);

      if (m3u8.version >= 4)
        for (var attrname in extParserV4) { extParser[attrname] = extParser[attrname]; }
      if (m3u8.version >= 5)
        for (var attrname in extParserV5) { extParser[attrname] = extParser[attrname]; }
    },
    '#EXT-X-TARGETDURATION': function(arg) {
      m3u8.target_duration = parseInt(arg, 10);
    },
    '#EXT-X-ALLOW-CACHE': function(arg) {
      m3u8.allow_cache = (arg!=='NO');
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
      m3u8.start = ParseAttrList(arg);
    },
    '#EXT-X-ENDLIST': function(arg) {
      m3u8.ended = true;
    },

    '#EXTINF': function(arg) {
      var n = arg.split(',');
      meta.duration = parseFloat(n.shift());
      meta.title = n.join(',');

      if (meta.duration <= 0)
        return ReportError(new ParserError('Invalid duration', line, line_no));
    },
    '#EXT-X-KEY': function(arg) {
      meta.key = ParseAttrList(arg);
    },
    '#EXT-X-PROGRAM-DATE-TIME': function(arg) {
      meta.program_time = new Date(arg);
    },
    '#EXT-X-DISCONTINUITY': function(arg) {
      meta.discontinuity = true;
    },

    // variant
    '#EXT-X-STREAM-INF': function(arg) {
      m3u8.variant = true;
      meta.info = ParseAttrList(arg);
    },
    // variant v4 since variant streams are not required to specify version
    '#EXT-X-MEDIA': function(arg) {
      var attrs = ParseAttrList(arg),
          id = unquote(attrs['group-id']);

      if (!(id in m3u8.groups)) {
        m3u8.groups[id] = [];
        m3u8.groups[id].type = attrs.type;
      }
      m3u8.groups[id].push(attrs);
    },
    '#EXT-X-I-FRAME-STREAM-INF': function(arg) {
      var attrs = ParseAttrList(arg),
          id = unquote(attrs['program-id']);

      m3u8.variant = true;

      if (!(id in m3u8.iframes))
        m3u8.iframes[id] = [];

      m3u8.iframes[id].push(attrs);
    }
  };

  var extParserV4 = {
    '#EXT-X-I-FRAMES-ONLY': function(arg) {
      m3u8.i_frames_only = true;
    },
    '#EXT-X-BYTERANGE': function(arg) {
      var n = arg.split('@');
      meta.byterange = {length:parseInt(n[0], 10)};
      if (n.length > 1)
        meta.byterange.offset = parseInt(n[1], 10);
    }
  }

  var extParserV5 = {
    '#EXT-X-MAP': function(arg) {
      meta.map = ParseAttrList(arg);
    }
  }
}

function ParserError(msg, line, line_no, constr) {
  Error.captureStackTrace(this, constr || this);
  this.message = msg || 'Error';
  this.line = line;
  this.lineNumber = line_no;
}
util.inherits(ParserError, Error);
ParserError.prototype.name = 'Parser Error';
