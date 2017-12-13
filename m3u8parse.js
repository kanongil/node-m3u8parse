"use strict";

const util = require('util');
const split = require('split');
const clone = require('clone');

const AttrList = require('./attrlist');

let debug = function () {};
try {
  debug = require('debug')('m3u8parse');
} catch (err) {}


function ParserError(msg, line, line_no, constr) {
  Error.captureStackTrace(this, constr || this);
  this.message = msg || 'Error';
  this.line = line;
  this.lineNumber = line_no;
}
util.inherits(ParserError, Error);
ParserError.prototype.name = 'Parser Error';


function M3U8Playlist(obj) {
  if (!(this instanceof M3U8Playlist))
    return new M3U8Playlist(obj);

  obj = obj || {};

  this.master = obj.master || false;

  // initialize to default values
  this.version = obj.version || 1; // V1
  this.allow_cache = !(obj.allow_cache === false);
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
    this.segments = obj.segments.map((segment) =>  new M3U8Segment(segment));
  }

  // for master streams
  this.variants = clone(obj.variants) || [];
  this.variants.forEach((variant) => {
    if (variant.info) variant.info = new AttrList(variant.info);
  });

  this.groups = clone(obj.groups) || {};
  Object.keys(this.groups).forEach((id) => {
    let list = this.groups[id];
    for (let idx = 0; idx < list.length; idx++)
      list[idx] = new AttrList(list[idx]);
  });

  this.iframes = clone(obj.iframes) || []; // V4
  for (let idx = 0; idx < this.iframes.length; idx++)
    this.iframes[idx] = new AttrList(this.iframes[idx]);

  this.data = clone(obj.data) || {}; // V7
  Object.keys(this.data).forEach((id) => {
    let list = this.data[id];
    for (let idx = 0; idx < list.length; idx++)
      list[idx] = new AttrList(list[idx]);
  });

  this.session_keys = clone(obj.session_keys) || []; // V7
  for (let idx = 0; idx < this.session_keys.length; idx++)
    this.session_keys[idx] = new AttrList(this.session_keys[idx]);

  // custom vendor extensions
  if (obj.vendor)
    this.vendor = clone(obj.vendor);
}

M3U8Playlist.prototype.PlaylistType = {
  EVENT: 'EVENT',
  VOD: 'VOD'
};

M3U8Playlist.prototype.totalDuration = function() {
  return this.segments.reduce((sum, segment) => sum + segment.duration, 0);
};

M3U8Playlist.prototype.isLive = function() {
  return !(this.ended || this.type === this.PlaylistType.VOD);
};

M3U8Playlist.prototype.startSeqNo = function(full) {
  if (this.segments.length === 0) return -1;
  if (!this.isLive() || full) return this.first_seq_no;

  let idx, duration = this.target_duration * 3;
  for (idx = ~~this.segments.length - 1; idx > 0; idx--) {
    duration -= this.segments[idx].duration;
    if (duration < 0) break;
  }
  // TODO: validate that correct seqNo is returned
  return this.first_seq_no + idx;
};

M3U8Playlist.prototype.lastSeqNo = function() {
  return this.first_seq_no + this.segments.length - 1;
};

// return whether the seqNo is in the index
M3U8Playlist.prototype.isValidSeqNo = function(seqNo) {
  return (seqNo >= this.first_seq_no) && (seqNo <= this.lastSeqNo());
};

function lastSegmentProperty(index, key, seqNo, incrFn) {
  let segment;
  while ((segment = index.getSegment(seqNo--)) !== null) {
    if (incrFn && incrFn(segment))
      return null;
    let val = segment[key];
    if (val) return val;
  }
  return null;
}

M3U8Playlist.prototype.dateForSeqNo = function(seqNo) {
  let elapsed = 0;
  let program_time = lastSegmentProperty(this, 'program_time', seqNo, (segment) => {
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

  let startTime = date;
  if (typeof date !== 'number')
    startTime = date ? +new Date(date) : Date.now();

  // if findNearestAfter is true, the first sequence number after the date is returned
  findNearestAfter = !!findNearestAfter;

  // no assumptions are made about monotonic time
  let firstValid = { seqNo: -1, delta: null, duration: 0 };
  let segmentEndTime = -1;

  let segments = this.segments, count = ~~segments.length;
  for (let idx = 0; idx < count; idx++) {
    let segment = segments[idx];

    if (segment.program_time) {
      segmentEndTime = segment.program_time.getTime();
    } if (segment.discontinuity) {
      segmentEndTime = -1;
    }

    let segmentDuration = 1000 * segment.duration;
    if (segmentEndTime !== -1 && segmentDuration > 0) {
      segmentEndTime += segmentDuration;

      // update firstValid
      let delta = segmentEndTime - startTime - 1;
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

M3U8Playlist.prototype.keysForSeqNo = function(seqNo) {
  let segment, keys = {}, initialSeqNo = seqNo;
  while ((segment = this.getSegment(seqNo--)) !== null) {
    if (!segment.keys) continue;

    for (let idx = 0; idx < segment.keys.length; idx++) {
      let key = segment.keys[idx];
      let keyformat = key.keyformat ? key.enumeratedString('keyformat') : 'identity';

      if (!keys[keyformat]) {
        let keymethod = key.enumeratedString('method');
        if (keymethod === 'NONE') {
          return null;
        }
        keys[keyformat] = new AttrList(key);

        if (this.version < 5) {
          break;
        }
      }
    }
  }

  if (keys.identity && !keys.identity.iv) {
    keys.identity.hexadecimalInteger('iv', initialSeqNo);
  }

  let result = Object.keys(keys).map((keyformat) => keys[keyformat]);

  return result.length ? result : null;
};

M3U8Playlist.prototype.byterangeForSeqNo = function(seqNo) {
  let seqIndex = seqNo - this.first_seq_no;
  let seqSegment = this.segments[seqIndex] || null;
  if (!seqSegment || !seqSegment.byterange) return null;

  let length = parseInt(seqSegment.byterange.length, 10);
  if (isNaN(length)) return null;

  let offset = parseInt(seqSegment.byterange.offset, 10);
  if (isNaN(offset)) {
    // compute actual value from history
    offset = 0;

    for (let idx = seqIndex-1; idx >= 0; idx--) {
      let segment = this.segments[idx];
      if (segment.uri !== seqSegment.uri) continue;
      if (!segment.byterange) break; // consistency error

      let segmentLength = parseInt(segment.byterange.length, 10);
      let segmentOffset = parseInt(segment.byterange.offset, 10);
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
  return lastSegmentProperty(this, 'map', seqNo, (segment) => segment.discontinuity); // abort on discontinuity
};

M3U8Playlist.prototype.getSegment = function(seqNo, independent) {
  // TODO: should we check for number type and throw if not?
  let index = seqNo - this.first_seq_no;
  let segment = this.segments[index] || null;
  if (independent && segment) {
    segment = new M3U8Segment(segment);
    // EXT-X-KEY, EXT-X-MAP, EXT-X-PROGRAM-DATE-TIME, EXT-X-BYTERANGE needs to be individualized
    segment.program_time = this.dateForSeqNo(seqNo);
    segment.keys = this.keysForSeqNo(seqNo);
    if (this.version >= 4)
      segment.byterange = this.byterangeForSeqNo(seqNo);
    if (this.version >= 5)
      segment.map = this.mapForSeqNo(seqNo);
    // note: 'uri' is not resolved to an absolute url, since it principally opaque
  }
  return segment;
};

M3U8Playlist.prototype.rewriteUris = function(mapFn) {
  const rewriteAttrs = (list, type) => {
    for (let idx = 0; idx < list.length; idx++) {
      let item = list[idx];
      if (item.uri) {
        const newUri = mapFn(item.quotedString('uri'), type, item);
        if (newUri || newUri === '') {
          item.quotedString('uri', newUri);
        }
      }
    }
  };

  const rewriteMappedAttrs = (map, type) => {
    if (map) {
      let allAttrs = [];
      for (let entry in map)
        Array.prototype.push.apply(allAttrs, map[entry]);

      rewriteAttrs(allAttrs, type);
    }
  };

  let variants = this.variants;
  for (let idx = 0; idx < variants.length; idx++) {
    const newUri = mapFn(variants[idx].uri, 'variant', variants[idx]);
    if (newUri || newUri === '') {
      variants[idx].uri = newUri;
    }
  }

  rewriteAttrs(this.iframes, 'iframe');
  rewriteMappedAttrs(this.groups, 'group');
  rewriteMappedAttrs(this.data, 'data');
  rewriteAttrs(this.session_keys, 'session-key');
  
  // Update segments

  let segments = this.segments;
  for (let idx = 0; idx < segments.length; idx++) {
    const segment = segments[idx];
    const newUri = mapFn(segment.uri, 'segment', segment);
    if (newUri || newUri === '') {
      segment.uri = newUri;
    }
    if (segment.keys) {
      rewriteAttrs(segment.keys, 'segment-key');
    }
    if (segment.map) {
      rewriteAttrs([segment.map], 'segment-map');
    }
  }

  return this;
};

M3U8Playlist.prototype.toString = function() {
  let m3u8 = '#EXTM3U\n';

  if (this.version > 1)
    m3u8 += '#EXT-X-VERSION:' + this.version + '\n';

  function streamInfAttrs(obj, version) {
    let attrs = new AttrList(obj);
    if (version >= 6) {
      delete attrs['program-id'];
    }
    return attrs;
  }

  if (!this.master) {
    m3u8 += '#EXT-X-TARGETDURATION:' + this.target_duration + '\n';

    if (this.type)
      m3u8 += '#EXT-X-PLAYLIST-TYPE:' + this.type + '\n';

    if (this.version < 7 && !this.allow_cache)
      m3u8 += '#EXT-X-ALLOW-CACHE:NO\n';

    let firstSeqNo = parseInt(this.first_seq_no, 10) || 0;
    if (firstSeqNo !== 0)
      m3u8 += '#EXT-X-MEDIA-SEQUENCE:' + firstSeqNo + '\n';

    if (this.type !== this.PlaylistType.VOD && this.type !== this.PlaylistType.EVENT) {
      let discontinuitySequence = parseInt(this.discontinuity_sequence, 10) || 0;
      if (discontinuitySequence !== 0)
        m3u8 += '#EXT-X-DISCONTINUITY-SEQUENCE:' + discontinuitySequence + '\n'; // soft V6
    }

    if (this.version >= 4 && this.i_frames_only)
      m3u8 += '#EXT-X-I-FRAMES-ONLY\n';
  }

  if (this.start && Object.keys(this.start).length)
    m3u8 += '#EXT-X-START:' + new AttrList(this.start) + '\n'; // soft V6

  if (this.independent_segments)
    m3u8 += '#EXT-X-INDEPENDENT-SEGMENTS\n'; // soft V6

  if (this.master) {
    this.session_keys.forEach((key) => {
      m3u8 += '#EXT-X-SESSION-KEY:' + new AttrList(key) + '\n';
    });

    // add non-standard marlin entry
    if (this.keys && util.isArray(this.keys)) {
      this.keys.forEach((key) => {
        m3u8 += '#EXT-X-KEY:' + new AttrList(key) + '\n';
      });
    }

    for (let dataId in this.data) {  // soft V7
      this.data[dataId].forEach((data) => {
        m3u8 += '#EXT-X-SESSION-DATA:' + new AttrList(data) + '\n';
      });
    }

    for (let groupId in this.groups) {
      this.groups[groupId].forEach((group) => {
        m3u8 += '#EXT-X-MEDIA:' + new AttrList(group) + '\n';
      });
    }

    this.iframes.forEach((iframe) => {
      m3u8 += '#EXT-X-I-FRAME-STREAM-INF:' + streamInfAttrs(iframe) + '\n';
    });

    this.variants.forEach((variant) => {
      m3u8 += '#EXT-X-STREAM-INF:' + streamInfAttrs(variant.info) + '\n';
      m3u8 += variant.uri + '\n';
    });
  }

  // add vendor extensions
  for (let ext in (this.vendor || {})) {
    let value = this.vendor[ext];
    m3u8 += ext;
    if (value !== null && typeof value !== 'undefined')
      m3u8 += ':' + value;
    m3u8 += '\n';
  }

  this.segments.forEach((segment) => {
    m3u8 += segment.toString();
  });

  if (this.ended && !this.master)
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
  if (meta.keys) {
    this.keys = meta.keys.map((key) => new AttrList(key));
  }

  if (version >= 4 && meta.byterange)
    this.byterange = clone(meta.byterange);
  if (version >= 5 && meta.map)
    this.map = new AttrList(meta.map);

  // custom vendor extensions
  if (meta.vendor)
    this.vendor = clone(meta.vendor);
}

M3U8Segment.prototype.toString = function() {
  let res = '';
  if (this.discontinuity) res += '#EXT-X-DISCONTINUITY\n';
  if (this.program_time) {
    let program_time = this.program_time.toISOString ? this.program_time.toISOString() : this.program_time;
    res += '#EXT-X-PROGRAM-DATE-TIME:' + program_time + '\n';
  }
  if (this.keys) {
    this.keys.forEach((key) => {
      res += '#EXT-X-KEY:' + AttrList(key) + '\n';
    });
  }
  if (this.map) res += '#EXT-X-MAP:' + AttrList(this.map) + '\n';
  if (this.byterange && (this.byterange.length || this.byterange.length === 0)) {
    let range = '' + this.byterange.length;
    if (this.byterange.offset || this.byterange.offset === 0)
      range += '@' + this.byterange.offset;
    res += '#EXT-X-BYTERANGE:' + range + '\n';
  }

  // add vendor extensions
  for (let ext in (this.vendor || {})) {
    let value = this.vendor[ext];
    res += ext;
    if (value !== null && typeof value !== 'undefined')
      res += ':' + value;
    res += '\n';
  }

  return res + '#EXTINF:' + parseFloat(this.duration.toFixed(3)) + ',' + this.title + '\n' + this.uri + '\n';
};

function M3U8Parse(stream, options, cb) {
  let m3u8 = new M3U8Playlist(),
      line_no = 0,
      meta = {};

  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  let extensions = clone(options.extensions || {});

  let cr = stream.pipe(split());
  cr.on('data', ParseLine);
  cr.on('end', Complete);

  stream.on('error', ReportError);

  function cleanup() {
    stream.removeListener('error', ReportError);
    cr.removeListener('data', ParseLine);
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
    cb(null, m3u8);
  }

  function ParseExt(cmd, arg) {
    // parse vendor extensions
    if (cmd in extensions) {
      let extObj = options.extensions[cmd] ? meta : m3u8;
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
      let matches = /^(#EXT[^:]*)(:?.*)$/.exec(line);
      if (!matches)
        return debug('ignoring comment', line);

      let cmd = matches[1],
          arg = matches[2].length > 1 ? matches[2].slice(1) : null;

      if (!ParseExt(cmd, arg))
        return debug('ignoring unknown #EXT:' + cmd, line_no);
    } else if (m3u8.master) {
      meta.uri = line;
      m3u8.variants.push(meta);
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
  let extParser = {
    '#EXT-X-VERSION': (arg) => {
      m3u8.version = parseInt(arg, 10);

      let attrname;
      if (m3u8.version >= 4)
        for (attrname in extParserV4) { extParser[attrname] = extParserV4[attrname]; }
      if (m3u8.version >= 5)
        for (attrname in extParserV5) { extParser[attrname] = extParserV5[attrname]; }
    },
    '#EXT-X-TARGETDURATION': (arg) => {
      m3u8.target_duration = parseInt(arg, 10);
    },
    '#EXT-X-ALLOW-CACHE': (arg) => {
      m3u8.allow_cache = (arg !== 'NO');
    },
    '#EXT-X-MEDIA-SEQUENCE': (arg) => {
      m3u8.first_seq_no = parseInt(arg, 10);
    },
    '#EXT-X-DISCONTINUITY-SEQUENCE':(arg) => {
      m3u8.discontinuity_sequence = parseInt(arg, 10);
    },
    '#EXT-X-PLAYLIST-TYPE': (arg) => {
      m3u8.type = arg;
    },
    '#EXT-X-START': (arg) => {
      m3u8.start = new AttrList(arg);
    },
    '#EXT-X-INDEPENDENT-SEGMENTS': () => {
      m3u8.independent_segments = true;
    },
    '#EXT-X-ENDLIST': () => {
      m3u8.ended = true;
    },

    '#EXTINF': (arg) => {
      let n = arg.split(',');
      meta.duration = parseFloat(n.shift());
      meta.title = n.join(',');

      if (meta.duration <= 0)
        return ReportError(new ParserError('Invalid duration', '#EXTINF:' + arg, line_no));
    },
    '#EXT-X-KEY': (arg) => {
      if (!meta.keys) {
        meta.keys = [];
      }
      meta.keys.push(new AttrList(arg));
    },
    '#EXT-X-PROGRAM-DATE-TIME': (arg) => {
      meta.program_time = new Date(arg);
    },
    '#EXT-X-DISCONTINUITY': () => {
      meta.discontinuity = true;
    },

    // master
    '#EXT-X-STREAM-INF': (arg) => {
      m3u8.master = true;
      meta.info = new AttrList(arg);
    },
    // master v4 since master streams are not required to specify version
    '#EXT-X-MEDIA': (arg) => {
      let attrs = new AttrList(arg),
          id = attrs.quotedString('group-id') || '#';

      if (!(id in m3u8.groups)) {
        m3u8.groups[id] = [];
        if (id !== '#')
          m3u8.groups[id].type = attrs.type;
      }
      m3u8.groups[id].push(attrs);
    },
    '#EXT-X-I-FRAME-STREAM-INF': (arg) => {
      m3u8.iframes.push(new AttrList(arg));
    },
    '#EXT-X-SESSION-DATA': (arg) => {
      let attrs = new AttrList(arg),
          id = attrs.quotedString('data-id');

      if (id) {
        if (!(id in m3u8.data)) {
          m3u8.data[id] = [];
        }
        m3u8.data[id].push(attrs);
      }
    },
    '#EXT-X-SESSION-KEY': (arg) => {
      m3u8.session_keys.push(new AttrList(arg));
    }
  };

  let extParserV4 = {
    '#EXT-X-I-FRAMES-ONLY': () => {
      m3u8.i_frames_only = true;
    },
    '#EXT-X-BYTERANGE': (arg) => {
      let n = arg.split('@');
      meta.byterange = {length:parseInt(n[0], 10)};
      if (n.length > 1)
        meta.byterange.offset = parseInt(n[1], 10);
    }
  };

  let extParserV5 = {
    '#EXT-X-MAP': (arg) => {
      meta.map = new AttrList(arg);
    }
  };
}

exports = module.exports = M3U8Parse;

exports.M3U8Playlist = M3U8Playlist;
exports.M3U8Segment = M3U8Segment;
exports.AttrList = AttrList;
exports.ParserError = ParserError;
