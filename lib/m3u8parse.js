'use strict';

const Assert = require('assert');
const Process = require('process');
const Stream = require('stream');

try {
    var Debug = require('debug');
}
catch (err) {}

const Clone = require('clone');
const Split = require('split');

const AttrList = require('./attrlist');


const internals = {
    debug: Debug ? Debug('m3u8parse') : function () {}
};


internals.lastSegmentProperty = function (index, key, seqNo, incrFn) {

    let segment;
    while ((segment = index.getSegment(seqNo--)) !== null) {
        if (incrFn && incrFn(segment)) {
            return null;
        }

        const val = segment[key];
        if (val) {
            return val;
        }
    }

    return null;
};


internals.Map = class JSONableMap extends Map {

    toJSON() {

        const obj = Object.create(null);

        for (const [key, value] of this) {
            obj[key] = value;
        }

        return obj;
    }
};


internals.metas = new Map([
    ['DATERANGE', 'ranges'],
    ['PRELOAD-HINT', 'preload_hints'],
    ['RENDITION-REPORT', 'rendition_reports']
]);


exports = module.exports = function (input, options = {}, cb) {

    const m3u8 = new exports.M3U8Playlist();
    let line_no = 0;
    let meta = {};
    let cleanup = function () {};
    let promise;

    Assert.ok(input || input === '', 'Input must be a stream, string, or buffer');

    if (typeof options === 'function') {
        cb = options;
        options = {};
    }
    else if (typeof cb !== 'function') {
        promise = new Promise((resolve, reject) => {

            cb = (err, res) => {

                return err ? reject(err) : resolve(res);
            };
        });
    }

    const extensions = Clone(options.extensions || {});

    const ReportError = function (err) {

        cleanup();
        cb(err);
    };

    const Complete = function () {

        if (line_no === 0) {
            return ReportError(new exports.ParserError('No line data', '', -1));
        }

        if (Object.keys(meta).length) {
            m3u8.segments.push(new exports.M3U8Segment(undefined, meta, m3u8.version));
        }

        cleanup();
        cb(null, m3u8);
    };

    const ParseExt = function (cmd, arg = null) {

        // Parse vendor extensions

        if (cmd in extensions) {
            const extObj = options.extensions[cmd] ? meta : m3u8;
            if (!extObj.vendor) {
                extObj.vendor = [];
            }

            extObj.vendor.push([cmd, arg]);
            return true;
        }

        if (!(cmd in extParser)) {
            return false;
        }

        internals.debug('parsing ext', cmd, arg);
        extParser[cmd](arg);

        return true;
    };

    const ParseLine = function (line) {

        line_no += 1;

        if (line_no === 1) {
            if (line !== '#EXTM3U') {
                return ReportError(new exports.ParserError('Missing required #EXTM3U header', line, line_no));
            }

            return true;
        }

        if (!line.length) {
            return true;
        } // blank lines are ignored (3.1)

        if (line[0] === '#') {
            const matches = /^(#EXT[^:]*)(:?.*)$/.exec(line);
            if (!matches) {
                return internals.debug('ignoring comment', line);
            }

            const cmd = matches[1];
            const arg = matches[2].length > 1 ? matches[2].slice(1) : null;

            if (!ParseExt(cmd, arg)) {
                return internals.debug('ignoring unknown #EXT:' + cmd, line_no);
            }
        }
        else if (m3u8.master) {
            meta.uri = line;
            m3u8.variants.push(meta);
            meta = {};
        }
        else {
            if (!('duration' in meta)) {
                return ReportError(new exports.ParserError('Missing #EXTINF before media file URI', line, line_no));
            }

            m3u8.segments.push(new exports.M3U8Segment(line, meta, m3u8.version));
            meta = {};
        }

        return true;
    };

    // TODO: add more validation logic
    const extParser = {
        '#EXT-X-VERSION': (arg) => {

            m3u8.version = parseInt(arg, 10);
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
        '#EXT-X-DISCONTINUITY-SEQUENCE': (arg) => {

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

            const n = arg.split(',');
            meta.duration = parseFloat(n.shift());
            meta.title = n.join(',');

            if (meta.duration <= 0) {
                return ReportError(new exports.ParserError('Invalid duration', '#EXTINF:' + arg, line_no));
            }
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

            const attrs = new AttrList(arg);
            const id = attrs.quotedString('group-id') || '#';

            let list = m3u8.groups.get(id);
            if (!list) {
                list = [];
                m3u8.groups.set(id, list);
                if (id !== '#') {
                    list.type = attrs.type;
                }
            }

            list.push(attrs);
        },
        '#EXT-X-I-FRAME-STREAM-INF': (arg) => {

            m3u8.iframes.push(new AttrList(arg));
        },
        '#EXT-X-SESSION-DATA': (arg) => {

            const attrs = new AttrList(arg);
            const id = attrs.quotedString('data-id');

            if (id) {
                let list = m3u8.data.get(id);
                if (!list) {
                    list = [];
                    m3u8.data.set(id, list);
                }

                list.push(attrs);
            }
        },
        '#EXT-X-SESSION-KEY': (arg) => {

            m3u8.session_keys.push(new AttrList(arg));
        },
        '#EXT-X-GAP': () => {

            meta.gap = true;
        },
        '#EXT-X-DEFINE': (arg) => {

            m3u8.defines.push(new AttrList(arg));
        },
        '#EXT-X-PART-INF': (arg) => {

            m3u8.part_info = new AttrList(arg);
        },
        '#EXT-X-PART': (arg) => {

            (meta.parts = meta.parts || []).push(new AttrList(arg));
        },
        '#EXT-X-SERVER-CONTROL': (arg) => {

            m3u8.server_control = new AttrList(arg);
        },
        '#EXT-X-I-FRAMES-ONLY': () => {

            m3u8.i_frames_only = true;
        },
        '#EXT-X-BYTERANGE': (arg) => {

            const n = arg.split('@');
            meta.byterange = { length: parseInt(n[0], 10) };
            if (n.length > 1) {
                meta.byterange.offset = parseInt(n[1], 10);
            }
        },
        '#EXT-X-MAP': (arg) => {

            meta.map = new AttrList(arg);
        },
        '#EXT-X-SKIP': (arg) => {

            m3u8.meta.skip = new AttrList(arg);
        }
    };

    for (const [ext, entry] of internals.metas.entries()) {
        extParser['#EXT-X-' + ext] = (arg) => {

            (m3u8.meta[entry] = m3u8.meta[entry] || []).push(new AttrList(arg));
        };
    }

    if (input instanceof Stream) {
        const cr = input.pipe(Split());
        cr.on('data', ParseLine);
        cr.on('end', Complete);

        input.on('error', ReportError);

        cleanup = function () {

            input.removeListener('error', ReportError);
            cr.removeListener('data', ParseLine);
            cr.removeListener('end', Complete);
        };
    }
    else {
        const lines = (Buffer.isBuffer(input) ? input.toString('utf-8') : input).split(/\r?\n/);

        Process.nextTick(() => {

            try {
                for (const line of lines) {
                    if (ParseLine(line) !== true) {
                        break;
                    }
                }

                Complete();
            }
            catch (err) {
                ReportError(err);
            }
        });
    }

    return promise;
};


exports.ParserError = class extends Error {

    constructor(msg, line, line_no, constr) {

        super();

        Error.captureStackTrace(this, constr || this);
        this.message = msg || 'Error';
        this.line = line;
        this.lineNumber = line_no;
    }
};

exports.ParserError.prototype.name = 'Parser Error';


internals.cloneAttrArray = function (src) {

    const dst = Clone(src) || [];
    for (let i = 0; i < dst.length; ++i) {
        dst[i] = new AttrList(dst[i]);
    }

    return dst;
};


internals.cloneAttrMap = function (src) {

    const dst = new internals.Map();

    if (src) {
        if (src instanceof Map) {
            for (const [groupId, list] of src) {
                dst.set(groupId, list.map((attrs) => new AttrList(attrs)));
            }
        }
        else {
            for (const groupId in src) {
                const list = src[groupId];
                dst.set(groupId, list.map((attrs) => new AttrList(attrs)));
            }
        }
    }

    return dst;
};


internals.playlistWriter = class {

    static stringifyAttrs(attrs) {

        if (typeof attrs !== 'object' || !Object.keys(attrs).length) {
            return undefined;
        }

        return AttrList.prototype.toString.call(attrs);
    }

    static streamInfAttrs(obj, version) {

        const attrs = new AttrList(obj);
        if (version >= 6) {
            delete attrs['program-id'];
        }

        return attrs;
    }

    constructor(header) {

        this._list = header ? [header] : [];
    }

    push(...lines) {

        this._list.push(...lines);
    }

    ext(ext, value) {

        if (value === undefined ||
            value === false ||
            (typeof value === 'number' && isNaN(value))) {

            return;
        }

        if (value === true) {
            this.push('#EXT-X-' + ext);
        }
        else {
            this.push(`#EXT-X-${ext}:${value}`);
        }
    }

    toString() {

        return this._list.join('\n');
    }
};


exports.M3U8Playlist = class {

    constructor(obj) {

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
        this.discontinuity_sequence = obj.discontinuity_sequence; // V6
        this.start = new AttrList(obj.start); // V6
        this.independent_segments = obj.independent_segments; // V6

        this.segments = [];
        if (obj.segments) {
            this.segments = obj.segments.map((segment) => new exports.M3U8Segment(segment));
        }

        // for master streams
        this.variants = Clone(obj.variants) || [];
        this.variants.forEach((variant) => {

            if (variant.info) {
                variant.info = new AttrList(variant.info);
            }
        });

        this.groups = internals.cloneAttrMap(obj.groups);

        this.iframes = internals.cloneAttrArray(obj.iframes); // V4

        this.data = internals.cloneAttrMap(obj.data); // V7
        this.session_keys = internals.cloneAttrArray(obj.session_keys); // V7

        this.meta = {};
        if (obj.meta) {
            if (obj.meta.skip) {
                this.meta.skip = new AttrList(obj.meta.skip);
            }

            for (const key of internals.metas.values()) {
                if (obj.meta[key]) {
                    this.meta[key] = internals.cloneAttrArray(obj.meta[key]);
                }
            }
        }

        this.defines = internals.cloneAttrArray(obj.defines); // V8

        if (obj.server_control) {
            this.server_control = new AttrList(obj.server_control);
        }

        if (obj.part_info) {
            this.part_info = new AttrList(obj.part_info);
        }

        // Custom vendor extensions

        if (obj.vendor) {
            if (Array.isArray(obj.vendor)) {
                this.vendor = Clone(obj.vendor);
            }
            else {
                // convert from old style serialized format

                this.vendor = [];

                for (const entry in obj.vendor) {
                    const value = obj.vendor[entry];
                    this.vendor.push([entry, Clone(value)]);
                }
            }
        }
    }

    get PlaylistType() {

        return {
            EVENT: 'EVENT',
            VOD: 'VOD'
        };
    }

    totalDuration() {

        return this.segments.reduce((sum, segment) => sum + segment.duration, 0);
    }

    isLive() {

        return !(this.ended || this.type === this.PlaylistType.VOD);
    }

    startSeqNo(full) {

        if (this.segments.length === 0) {
            return -1;
        }

        if (!this.isLive() || full) {
            return this.first_seq_no;
        }

        let i; let duration = this.target_duration * 3;
        for (i = ~~this.segments.length - 1; i > 0; --i) {
            duration -= this.segments[i].duration;
            if (duration < 0) {
                break;
            }
        }

        // TODO: validate that correct seqNo is returned
        return this.first_seq_no + i;
    }

    lastSeqNo() {

        return this.first_seq_no + this.segments.length - 1;
    }

    // return whether the seqNo is in the index
    isValidSeqNo(seqNo) {

        return (seqNo >= this.first_seq_no) && (seqNo <= this.lastSeqNo());
    }

    dateForSeqNo(seqNo) {

        let elapsed = 0;
        const program_time = internals.lastSegmentProperty(this, 'program_time', seqNo, (segment) => {

            elapsed += segment.duration;
            return segment.discontinuity; // abort on discontinuity
        });

        return program_time ? new Date(program_time.getTime() + (elapsed - this.getSegment(seqNo).duration) * 1000) : null;
    }

    seqNoForDate(date, findNearestAfter) {

        if (typeof date === 'boolean') {
            findNearestAfter = date;
            date = null;
        }

        let startTime = date;
        if (typeof date !== 'number') {
            startTime = date ? +new Date(date) : Date.now();
        }

        // if findNearestAfter is true, the first sequence number after the date is returned
        findNearestAfter = !!findNearestAfter;

        // no assumptions are made about monotonic time
        const firstValid = { seqNo: -1, delta: null, duration: 0 };
        let segmentEndTime = -1;

        const segments = this.segments; const count = ~~segments.length;
        for (let i = 0; i < count; ++i) {
            const segment = segments[i];

            if (segment.program_time) {
                segmentEndTime = segment.program_time.getTime();
            }

            if (segment.discontinuity) {
                segmentEndTime = -1;
            }

            const segmentDuration = 1000 * segment.duration;
            if (segmentEndTime !== -1 && segmentDuration > 0) {
                segmentEndTime += segmentDuration;

                // update firstValid
                const delta = segmentEndTime - startTime - 1;
                if (delta >= 0 && (firstValid.delta === null || delta < firstValid.delta || delta < segmentDuration)) {
                    firstValid.seqNo = this.first_seq_no + i;
                    firstValid.delta = delta;
                    firstValid.duration = segmentDuration;
                }
            }
        }

        if (!findNearestAfter && firstValid.delta >= firstValid.duration) {
            return -1;
        }

        return firstValid.seqNo;
    }

    keysForSeqNo(seqNo) {

        let segment; const keys = {}; const initialSeqNo = seqNo;
        while ((segment = this.getSegment(seqNo--)) !== null) {
            if (!segment.keys) {
                continue;
            }

            for (let i = 0; i < segment.keys.length; ++i) {
                const key = segment.keys[i];
                const keyformat = key.keyformat ? key.enumeratedString('keyformat') : 'identity';

                if (!keys[keyformat]) {
                    const keymethod = key.enumeratedString('method');
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

        const result = Object.keys(keys).map((keyformat) => keys[keyformat]);

        return result.length ? result : null;
    }

    byterangeForSeqNo(seqNo) {

        const seqIndex = seqNo - this.first_seq_no;
        const seqSegment = this.segments[seqIndex] || null;
        if (!seqSegment || !seqSegment.byterange) {
            return null;
        }

        const length = parseInt(seqSegment.byterange.length, 10);
        if (isNaN(length)) {
            return null;
        }

        let offset = parseInt(seqSegment.byterange.offset, 10);
        if (isNaN(offset)) {
            // compute actual value from history
            offset = 0;

            for (let i = seqIndex - 1; i >= 0; --i) {
                const segment = this.segments[i];
                if (segment.uri !== seqSegment.uri) {
                    continue;
                }

                if (!segment.byterange) {
                    break;
                } // consistency error

                const segmentLength = parseInt(segment.byterange.length, 10);
                const segmentOffset = parseInt(segment.byterange.offset, 10);
                if (isNaN(segmentLength)) {
                    break;
                } // consistency error

                offset += segmentLength;
                if (!isNaN(segmentOffset)) {
                    offset += segmentOffset;
                    break;
                }
            }
        }

        return { length, offset };
    }

    mapForSeqNo(seqNo) {

        return internals.lastSegmentProperty(this, 'map', seqNo, (segment) => segment.discontinuity); // abort on discontinuity
    }

    getSegment(seqNo, independent) {

        // TODO: should we check for number type and throw if not?
        const index = seqNo - this.first_seq_no;
        let segment = this.segments[index] || null;
        if (independent && segment) {
            segment = new exports.M3U8Segment(segment);
            // EXT-X-KEY, EXT-X-MAP, EXT-X-PROGRAM-DATE-TIME, EXT-X-BYTERANGE needs to be individualized
            segment.program_time = this.dateForSeqNo(seqNo);
            segment.keys = this.keysForSeqNo(seqNo);
            if (this.version >= 4) {
                segment.byterange = this.byterangeForSeqNo(seqNo);
            }

            if (this.version >= 5) {
                segment.map = this.mapForSeqNo(seqNo);
            }
            // note: 'uri' is not resolved to an absolute url, since it principally opaque
        }

        return segment;
    }

    rewriteUris(mapFn) {

        const rewriteAttrs = (list, type) => {

            for (const item of list) {
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
                const allAttrs = [];
                for (const val of map.values()) {
                    Array.prototype.push.apply(allAttrs, val);
                }

                rewriteAttrs(allAttrs, type);
            }
        };

        const variants = this.variants;
        for (let i = 0; i < variants.length; ++i) {
            const newUri = mapFn(variants[i].uri, 'variant', variants[i]);
            if (newUri || newUri === '') {
                variants[i].uri = newUri;
            }
        }

        rewriteAttrs(this.iframes, 'iframe');
        rewriteMappedAttrs(this.groups, 'group');
        rewriteMappedAttrs(this.data, 'data');
        rewriteAttrs(this.session_keys, 'session-key');

        // Update segments

        const segments = this.segments;
        for (let i = 0; i < segments.length; ++i) {
            const segment = segments[i];
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
    }

    toString() {

        const { stringifyAttrs, streamInfAttrs } = internals.playlistWriter;

        const m3u8 = new internals.playlistWriter('#EXTM3U');

        if (this.version > 1) {
            m3u8.ext('VERSION', this.version);
        }

        for (const key of this.defines) {
            m3u8.ext('DEFINE', stringifyAttrs(key));
        }

        if (this.master) {
            this.session_keys.forEach((key) => {

                m3u8.ext('SESSION-KEY', stringifyAttrs(key));
            });

            // add non-standard marlin entry
            if (this.keys && Array.isArray(this.keys)) {
                this.keys.forEach((key) => {

                    m3u8.ext('KEY', stringifyAttrs(key));
                });
            }
        }
        else {
            m3u8.ext('TARGETDURATION', this.target_duration);

            m3u8.ext('PLAYLIST-TYPE', this.type);

            if (this.version < 7 && !this.allow_cache) {
                m3u8.ext('ALLOW-CACHE', 'NO');
            }

            m3u8.ext('SERVER-CONTROL', stringifyAttrs(this.server_control));
            m3u8.ext('PART-INF', stringifyAttrs(this.part_info));

            const firstSeqNo = parseInt(this.first_seq_no, 10) || 0;
            if (firstSeqNo !== 0) {
                m3u8.ext('MEDIA-SEQUENCE', firstSeqNo);
            }

            if (this.type !== this.PlaylistType.VOD && this.type !== this.PlaylistType.EVENT) {
                m3u8.ext('DISCONTINUITY-SEQUENCE', parseInt(this.discontinuity_sequence, 10));
            }

            if (this.version >= 4) {
                m3u8.ext('I-FRAMES-ONLY', !!this.i_frames_only);
            }
        }

        m3u8.ext('START', stringifyAttrs(this.start));
        m3u8.ext('INDEPENDENT-SEGMENTS', !!this.independent_segments);

        if (this.vendor) {

            // Add vendor extensions

            for (const [ext, value] of this.vendor) {
                let line = ext;

                if (value || value === '') {
                    line += ':' + value;
                }

                m3u8.push(line);
            }
        }

        if (this.master) {
            for (const list of this.data.values()) {
                for (const data of list) {
                    m3u8.ext('SESSION-DATA', stringifyAttrs(data));
                }
            }

            for (const list of this.groups.values()) {
                for (const group of list) {
                    m3u8.ext('MEDIA', stringifyAttrs(group));
                }
            }

            this.iframes.forEach((iframe) => {

                m3u8.ext('I-FRAME-STREAM-INF', streamInfAttrs(iframe));
            });

            this.variants.forEach((variant) => {

                m3u8.ext('STREAM-INF', streamInfAttrs(variant.info));
                m3u8.push(variant.uri);
            });
        }

        const meta = this.meta || {};

        m3u8.ext('SKIP', stringifyAttrs(meta.skip));

        for (const segment of this.segments) {
            m3u8.push(...segment.toString().split('\n'));
        }

        for (const [ext, entry] of internals.metas.entries()) {
            for (const key of meta[entry] || []) {
                m3u8.ext(ext, stringifyAttrs(key));
            }
        }

        m3u8.ext('ENDLIST', !!(this.ended && !this.master));

        return m3u8.toString() + '\n';
    }
};


exports.M3U8Segment = class {

    constructor(uri, meta, version) {

        if (uri instanceof URL) {
            uri = uri.href;
        }

        if (uri && typeof uri === 'object') {
            meta = uri;
            uri = meta.uri;
            version = 10000;
        }

        this.duration = meta.duration;
        this.title = meta.title;
        this.uri = uri;
        this.discontinuity = meta.discontinuity || false;

        // optional
        if (meta.program_time) {
            this.program_time = new Date(meta.program_time);
        }

        if (meta.keys) {
            this.keys = meta.keys.map((key) => new AttrList(key));
        }

        if (version >= 4 && meta.byterange) {
            this.byterange = Clone(meta.byterange);
        }

        if (version >= 5 && meta.map) {
            this.map = new AttrList(meta.map);
        }

        if (meta.gap) {
            this.gap = true; // V8 - ignoreable
        }

        if (meta.parts) {
            this.parts = Clone(meta.parts);
        }

        // custom vendor extensions
        if (meta.vendor) {
            this.vendor = Clone(meta.vendor);
        }
    }

    toString() {

        const { stringifyAttrs } = internals.playlistWriter;
        const m3u8 = new internals.playlistWriter();

        m3u8.ext('DISCONTINUITY', !!this.discontinuity);

        if (this.program_time) {
            const program_time = this.program_time.toISOString ? this.program_time.toISOString() : this.program_time;
            m3u8.ext('PROGRAM-DATE-TIME', program_time);
        }

        if (this.keys) {
            this.keys.forEach((key) => {

                m3u8.ext('KEY', stringifyAttrs(key));
            });
        }

        m3u8.ext('MAP', stringifyAttrs(this.map));

        if (this.byterange && (this.byterange.length || this.byterange.length === 0)) {
            let range = '' + this.byterange.length;
            if (this.byterange.offset || this.byterange.offset === 0) {
                range += '@' + this.byterange.offset;
            }

            m3u8.ext('BYTERANGE', range);
        }

        if (this.vendor) {

            // Add vendor extensions

            for (const [ext, value] of this.vendor) {
                let line = ext;

                if (value || value === '') {
                    line += ':' + value;
                }

                m3u8.push(line);
            }
        }

        for (const part of this.parts || []) {
            m3u8.ext('PART', stringifyAttrs(part));
        }

        if (this.duration) {
            m3u8.push(`#EXTINF:${parseFloat(this.duration.toFixed(5))},${this.title}`);
            m3u8.ext('GAP', !!this.gap);

            if (this.uri) {
                m3u8.push(this.uri);
            }
        }

        return m3u8.toString();
    }
};


exports.AttrList = AttrList;

