'use strict';

const Clone = require('clone');

const AttrList = require('./attrlist');


const internals = {};


exports.M3U8Playlist = class M3U8Playlist {

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

            for (const key of M3U8Playlist.metas.values()) {
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
    isValidSeqNo(msn) {

        return (msn >= this.first_seq_no) && (msn <= this.lastSeqNo());
    }

    dateForSeqNo(msn) {

        let elapsed = 0;
        const program_time = internals.lastSegmentProperty(this, 'program_time', msn, ({ duration, discontinuity }) => {

            elapsed += duration;
            return discontinuity; // abort on discontinuity
        });

        return program_time ? new Date(program_time.getTime() + (elapsed - this.getSegment(msn).duration) * 1000) : null;
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

        // If findNearestAfter is true, the first sequence number after the date is returned
        // No assumptions are made about monotonic time

        const firstValid = { msn: -1, delta: null, duration: 0 };
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
                    firstValid.msn = this.first_seq_no + i;
                    firstValid.delta = delta;
                    firstValid.duration = segmentDuration;
                }
            }
        }

        if (!findNearestAfter && firstValid.delta >= firstValid.duration) {
            return -1;
        }

        return firstValid.msn;
    }

    keysForSeqNo(msn) {

        const keys = new Map();
        const initialMsn = msn;

        let segment;
        while ((segment = this.getSegment(msn--)) !== null) {
            if (!segment.keys) {
                continue;
            }

            for (const key of segment.keys) {
                const keyformat = key.get('keyformat') || 'identity';

                if (!keys.has(keyformat)) {
                    const keymethod = key.get('method');
                    if (keymethod === 'NONE') {
                        return null;
                    }

                    keys.set(keyformat, new AttrList(key));

                    if (this.version < 5) {
                        break;
                    }
                }
            }
        }

        const identity = keys.get('identity');
        if (identity && !identity.has('iv')) {
            identity.set('iv', initialMsn, 'hexint');
        }

        return keys.size > 0 ? [...keys.values()] : null;
    }

    byterangeForSeqNo(msn) {

        const segmentIdx = msn - this.first_seq_no;
        const segment = this.segments[segmentIdx];
        if (!segment || !segment.byterange) {
            return null;
        }

        const length = parseInt(segment.byterange.length, 10);
        if (isNaN(length)) {
            return null;
        }

        let offset = parseInt(segment.byterange.offset, 10);
        if (isNaN(offset)) {

            // Compute value from history

            offset = 0;

            for (let i = segmentIdx - 1; i >= 0; --i) {
                const { uri, byterange } = this.segments[i];
                if (uri !== segment.uri) {
                    continue;
                }

                if (!byterange) {
                    break;
                } // consistency error

                const segmentLength = parseInt(byterange.length, 10);
                const segmentOffset = parseInt(byterange.offset, 10);
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

    mapForSeqNo(msn) {

        return internals.lastSegmentProperty(this, 'map', msn, ({ discontinuity }) => !!discontinuity); // abort on discontinuity
    }

    getSegment(msn, independent) {

        // TODO: should we check for number type and throw if not?
        const index = msn - this.first_seq_no;
        let segment = this.segments[index] || null;
        if (independent && segment) {
            segment = new exports.M3U8Segment(segment);
            // EXT-X-KEY, EXT-X-MAP, EXT-X-PROGRAM-DATE-TIME, EXT-X-BYTERANGE needs to be individualized
            segment.program_time = this.dateForSeqNo(msn);
            segment.keys = this.keysForSeqNo(msn);
            if (this.version >= 4) {
                segment.byterange = this.byterangeForSeqNo(msn);
            }

            if (this.version >= 5) {
                segment.map = this.mapForSeqNo(msn);
            }

            // Resolve relative byteranges in parts

            if (segment.parts) {
                let lastPart;
                for (const part of segment.parts) {
                    if (lastPart) {
                        const byterange = part.get('byterange', 'byterange');
                        if (byterange &&
                            byterange.offset === undefined &&
                            part.get('uri') === lastPart.get('uri')) {

                            const lastByterange = lastPart.get('byterange', 'byterange');
                            if (lastByterange && lastByterange.offset !== undefined) {
                                byterange.offset = lastByterange.offset + lastByterange.length;
                                part.set('byterange', byterange, 'byterange');
                            }
                        }
                    }

                    lastPart = part;
                }
            }

            // note: 'uri' is not resolved to an absolute url, since it principally opaque
        }

        return segment;
    }

    rewriteUris(mapFn) {

        const rewriteAttr = (attrs, type) => {

            if (attrs && attrs.has('uri')) {
                const newUri = mapFn(attrs.get('uri', 'string'), type, attrs);
                if (internals.isStringish(newUri)) {
                    attrs.set('uri', newUri, 'string');
                }
            }
        };

        const rewriteAttrs = (list, type) => {

            for (const item of list || []) {
                rewriteAttr(item, type);
            }
        };

        const rewriteMappedAttrs = (map, type) => {

            if (map) {
                for (const list of map.values()) {
                    rewriteAttrs(list, type);
                }
            }
        };

        for (const variant of this.variants) {
            const newUri = mapFn(variant.uri, 'variant', variant);
            if (internals.isStringish(newUri)) {
                variant.uri = newUri;
            }
        }

        rewriteAttrs(this.iframes, 'iframe');
        rewriteMappedAttrs(this.groups, 'group');
        rewriteMappedAttrs(this.data, 'data');
        rewriteAttrs(this.session_keys, 'session-key');

        // Update segments

        for (const segment of this.segments) {
            rewriteAttrs(segment.keys, 'segment-key');
            rewriteAttr(segment.map, 'segment-map');
            rewriteAttrs(segment.parts, 'segment-part');

            if (internals.isStringish(segment.uri)) {
                const newUri = mapFn(segment.uri, 'segment', segment);
                if (internals.isStringish(newUri)) {
                    segment.uri = newUri;
                }
            }
        }

        if (this.meta) {
            rewriteAttrs(this.meta.preload_hints, 'preload-hint');
            rewriteAttrs(this.meta.rendition_reports, 'rendition-report');
        }

        return this;
    }

    toString() {

        const { stringifyAttrs, streamInfAttrs } = internals.PlaylistWriter;

        const m3u8 = new internals.PlaylistWriter('#EXTM3U');

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

                if (internals.isStringish(value)) {
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

        for (const [ext, entry] of M3U8Playlist.metas.entries()) {
            for (const key of meta[entry] || []) {
                m3u8.ext(ext, stringifyAttrs(key));
            }
        }

        m3u8.ext('ENDLIST', !!(this.ended && !this.master));

        return m3u8.toString() + '\n';
    }
};


exports.M3U8Playlist.metas = new Map([
    ['DATERANGE', 'ranges'],
    ['PRELOAD-HINT', 'preload_hints'],
    ['RENDITION-REPORT', 'rendition_reports']
]);


exports.M3U8Segment = class M3U8Segment {

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
            this.keys = internals.cloneAttrArray(meta.keys);
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
            this.parts = internals.cloneAttrArray(meta.parts);
        }

        // custom vendor extensions
        if (meta.vendor) {
            this.vendor = Clone(meta.vendor);
        }
    }

    toString() {

        const { stringifyAttrs } = internals.PlaylistWriter;
        const m3u8 = new internals.PlaylistWriter();

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

                if (internals.isStringish(value)) {
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


internals.PlaylistWriter = class {

    static stringifyAttrs(attrs) {

        if (attrs === null || typeof attrs !== 'object') {
            return undefined;
        }

        if (!(attrs instanceof AttrList)) {
            attrs = new AttrList(attrs);
        }

        return attrs.size > 0 ? attrs.toString() : undefined;
    }

    static streamInfAttrs(obj, version) {

        const attrs = new AttrList(obj);
        if (version >= 6) {
            attrs.delete('program-id');
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


internals.isStringish = (val) => {

    return val || val === '';
};


internals.lastSegmentProperty = function (index, key, msn, incrFn) {

    let segment;
    while ((segment = index.getSegment(msn--)) !== null) {
        if (incrFn(segment)) {
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


internals.cloneAttrArray = function (src) {

    const dst = [];
    for (const entry of src || []) {
        dst.push(new AttrList(entry));
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
