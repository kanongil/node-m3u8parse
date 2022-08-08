/// <reference lib="dom" />

import { AttrList } from './attrlist.js';
import { BigIntish, URL } from './types.js';


type Msn = number;

type Byterange = {
    offset: number;
    length: number;
};

type UriMapFunction<T extends string = string> = (uri: string | undefined, type: T, data: unknown) => string | undefined | void;


const internals = {
    Map: class JSONableMap extends Map {

        toJSON() {

            const obj = Object.create(null);

            for (const [key, value] of this) {
                obj[key] = value;
            }

            return obj;
        }
    },

    formatMsn(obj?: Msn): Msn | undefined {

        const type = typeof obj;
        return (obj === undefined || type === 'number' || type === 'bigint') ? obj : +obj;
    },

    tryBigInt(value: unknown): bigint | undefined {

        try {
            if (typeof value === 'bigint') {
                return value;
            }

            if (typeof value === 'number' || typeof value === 'string') {
                return BigIntish(value);
            }
        }
        catch (err) {}

        return undefined;
    },

    isStringish(val: unknown): boolean {

        return !!val || val === '';
    },

    cloneAttrArray(src?: AttrList[]) {

        const dst: AttrList[] = [];
        for (const entry of src || []) {
            dst.push(new AttrList(entry));
        }

        return dst;
    },

    cloneAttrMap(src?: Map<string, AttrList[]> | { [groupId: string]: AttrList[] }): Map<string, AttrList[]> {

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
    },

    rewriteAttr(mapFn: UriMapFunction<any>, attrs: AttrList | null | undefined, type: string) {

        const { isStringish } = internals;
        if (attrs?.has('uri')) {
            const newUri = mapFn(attrs.get('uri', AttrList.Types.String), type, attrs);
            if (isStringish(newUri)) {
                attrs.set('uri', newUri, AttrList.Types.String);
            }
        }
    },

    rewriteAttrs(mapFn: UriMapFunction<any>, list: AttrList[] | null | undefined, type: string) {

        const { rewriteAttr } = internals;
        for (const item of list || []) {
            rewriteAttr(mapFn, item, type);
        }
    },

    rewriteMappedAttrs(mapFn: UriMapFunction<any>, map: Map<string, AttrList[]>, type: string) {

        const { rewriteAttrs } = internals;
        if (map) {
            for (const list of map.values()) {
                rewriteAttrs(mapFn, list, type);
            }
        }
    }
};

/* eslint-disable no-unused-vars */
enum PlaylistType {
    EVENT = 'EVENT',
    VOD = 'VOD'
}

enum ArrayMetas {
    DATERANGE = 'ranges',
    'PRELOAD-HINT' = 'preload_hints',
    'RENDITION-REPORT' = 'rendition_reports'
}
/* eslint-enable no-unused-vars */

interface Variant {
    uri: string;
    info?: AttrList;
}

interface Meta {
    skip?: AttrList;
    ranges?: AttrList[];
    preload_hints?: AttrList[];
    rendition_reports?: AttrList[];
}


interface IRewritableUris {
    rewriteUris(mapFn: UriMapFunction): this;
}


class BasePlaylist implements IRewritableUris {

    readonly master: boolean;
    version: number;

    start?: AttrList;
    independent_segments?: boolean;
    defines: AttrList[];

    vendor?: Iterable<[string, string | null]>;

    constructor(obj: Readonly<Partial<BasePlaylist>>) {

        this.master = !!obj.master;

        this.version = obj.version || 1;
        this.start = obj.start ? new AttrList(obj.start) : undefined;
        this.independent_segments = obj.independent_segments !== undefined ? !!obj.independent_segments : undefined;
        this.defines = internals.cloneAttrArray(obj.defines);

        // Custom vendor extensions

        if (obj.vendor) {
            if (typeof obj.vendor[Symbol.iterator] !== 'function') {
                // Convert from old style serialized format

                this.vendor = Object.entries(obj.vendor as unknown as { [entry: string]: string });
            }
            else {
                const set = this.vendor = [] as [string, string | null][];
                for (const [ext, value] of obj.vendor) {
                    set.push([ext, value]);
                }
            }
        }
    }

    /**
     * Returns true if the playlist is expected to be updated by the server.
     */
    isLive(): boolean {

        return false;
    }

    rewriteUris(mapFn: UriMapFunction): this {

        return this;
    }

    toString(): string {

        const { stringifyAttrs } = PlaylistWriter;

        const m3u8 = new PlaylistWriter('#EXTM3U');

        if (this.version > 1) {
            m3u8.ext('VERSION', this.version);
        }

        for (const key of this.defines) {
            m3u8.ext('DEFINE', stringifyAttrs(key));
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

        return m3u8.toString();
    }
}

export class MainPlaylist extends BasePlaylist {

    static cast(index: MediaPlaylist | MainPlaylist): MainPlaylist | never {

        if (!index.master) {
            throw new Error('Cannot cast a media playlist');
        }

        return index as MainPlaylist;
    }

    readonly master: true = true;

    variants: Variant[];
    groups: Map<string, AttrList[]>;
    iframes: AttrList[];
    data: Map<string, AttrList[]>;
    session_keys: AttrList[];

    constructor(obj?: Readonly<MainPlaylist>);
    constructor(obj?: Readonly<Partial<MainPlaylist>>) {

        obj ??= {};

        super(obj);

        if (obj.master !== undefined && !!obj.master !== this.master) {
            throw new Error('Cannot create from media playlist');
        }

        this.variants = obj.variants?.map((variant) => ({ uri: variant.uri, info: new AttrList(variant.info) })) ?? [];
        this.groups = internals.cloneAttrMap(obj.groups);
        this.iframes = internals.cloneAttrArray(obj.iframes);
        this.data = internals.cloneAttrMap(obj.data);
        this.session_keys = internals.cloneAttrArray(obj.session_keys);
    }

    rewriteUris(mapFn: UriMapFunction<'variant' | 'iframe' | 'group' | 'data' | 'session-key'>): this {

        const { rewriteAttrs, rewriteMappedAttrs } = internals;

        for (const variant of this.variants) {
            const newUri = mapFn(variant.uri, 'variant', variant);
            if (internals.isStringish(newUri)) {
                variant.uri = newUri!;
            }
        }

        rewriteAttrs(mapFn, this.iframes, 'iframe');
        rewriteMappedAttrs(mapFn, this.groups, 'group');
        rewriteMappedAttrs(mapFn, this.data, 'data');
        rewriteAttrs(mapFn, this.session_keys, 'session-key');

        return super.rewriteUris(mapFn as UriMapFunction);
    }

    toString(): string {

        const { stringifyAttrs, streamInfAttrs } = PlaylistWriter;

        const m3u8 = new PlaylistWriter(super.toString());

        this.session_keys.forEach((key) => {

            m3u8.ext('SESSION-KEY', stringifyAttrs(key));
        });

        // add non-standard marlin entry

        const keys = (this as any as MediaSegment).keys;
        if (keys && Array.isArray(keys)) {
            for (const key of keys) {
                m3u8.ext('KEY', stringifyAttrs(key));
            }
        }

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

            if (variant.info) {
                m3u8.ext('STREAM-INF', streamInfAttrs(variant.info));
            }

            m3u8.push(variant.uri);
        });

        return m3u8.toString() + '\n';
    }
}

/**
 * Legacy properties, that could be used when restoring.
 */
interface Legacy {
    /** @deprecated Use {@link MediaPlaylist.media_sequence} */
    readonly first_seq_no?: number;

    /** @deprecated Completely removed */
    readonly allow_cache?: boolean;
}


export class MediaPlaylist extends BasePlaylist {

    public static readonly Type = PlaylistType;
    public static readonly _metas = new Map(Object.entries(ArrayMetas));

    public static cast(index: MediaPlaylist | MainPlaylist): MediaPlaylist {

        if (index.master) {
            throw new Error('Cannot cast a main playlist');
        }

        return index as MediaPlaylist;
    }

    readonly master: false = false;

    target_duration: number;
    media_sequence: Msn;
    discontinuity_sequence?: Msn;
    type?: PlaylistType | string;

    i_frames_only: boolean;
    ended: boolean;

    segments: MediaSegment[];

    meta: Meta;

    server_control?: AttrList;
    part_info?: AttrList;

    constructor(obj?: Readonly<MediaPlaylist>);
    constructor(obj?: Readonly<Partial<MediaPlaylist>> & Legacy) {

        obj ??= {};

        super(obj);

        if (obj.master !== undefined && !!obj.master !== this.master) {
            throw new Error('Cannot create from main playlist');
        }

        this.target_duration = +obj.target_duration! || Number.NaN;
        this.media_sequence = internals.formatMsn(obj.media_sequence) ?? internals.formatMsn(obj.first_seq_no) ?? 0;
        this.discontinuity_sequence = internals.formatMsn(obj.discontinuity_sequence);
        this.type = obj.type !== undefined ? `${obj.type}` : undefined;

        this.i_frames_only = !!obj.i_frames_only;
        this.ended = !!obj.ended;

        this.segments = [];
        if (obj.segments) {
            this.segments = obj.segments.map((segment) => new MediaSegment(segment));
        }

        this.meta = Object.create(null);
        if (obj.meta) {
            if (obj.meta.skip) {
                this.meta.skip = new AttrList(obj.meta.skip);
            }

            for (const key of MediaPlaylist._metas.values()) {
                if (obj.meta[key]) {
                    this.meta[key] = internals.cloneAttrArray(obj.meta[key]);
                }
            }
        }

        if (obj.server_control) {
            this.server_control = new AttrList(obj.server_control);
        }

        if (obj.part_info) {
            this.part_info = new AttrList(obj.part_info);
        }
    }

    private _lastSegmentProperty<P extends keyof MediaSegment>(key: P, msn: Msn | bigint, incrFn?: (segment: MediaSegment) => boolean): MediaSegment[P] | undefined {

        let segment;
        while ((segment = this.getSegment(msn--)) !== null) {
            if (incrFn && incrFn(segment)) {
                return undefined;
            }

            const val = segment[key];
            if (val) {
                return val;
            }
        }

        return undefined;
    }

    isLive(): boolean {

        return !(this.ended || this.type === PlaylistType.VOD);
    }

    totalDuration(): number {

        // TODO: include parts ????
        return this.segments.reduce((sum, segment) => sum + (segment.duration || 0), 0);
    }

    startMsn(full = false): Msn {

        if (this.segments.length === 0) {
            return -1;
        }

        if (!this.isLive() || full) {
            return this.media_sequence;
        }

        let i; let duration = (this.target_duration || 0) * 3;
        for (i = ~~this.segments.length - 1; i > 0; --i) {
            duration -= this.segments[i].duration || 0;
            if (duration < 0) {
                break;
            }
        }

        // TODO: validate that correct seqNo is returned
        return this.media_sequence + i;
    }

    lastMsn(includePartial = true): Msn {

        if (this.segments.length === 0) {
            return -1;
        }

        const msn = this.media_sequence + this.segments.length - 1;
        return includePartial ? msn : msn - +this.getSegment(msn)!.isPartial();
    }

    // return whether the msn (and part) is in the index
    isValidMsn(msn: Msn | string | bigint, part?: number): boolean {

        msn = internals.tryBigInt(msn)!;

        if (msn < BigIntish(this.media_sequence)) {
            return false;
        }

        const lastMsn = BigIntish(this.lastMsn(true));
        if (msn > lastMsn) {
            return false;
        }

        if (msn !== lastMsn) {
            return true;
        }

        // It has come down to the contents of the last segment

        if (part !== undefined) {
            if (part < 0) {      // Any negative part is assumed to be from the previous segment
                return this.isValidMsn(msn - BigIntish(1));
            }

            const { parts = { length: -1 } } = this.getSegment(lastMsn)!;
            return part <= parts.length;
        }

        return !this.getSegment(lastMsn)!.isPartial();
    }

    dateForMsn(msn: Msn | bigint): Date | null {

        let elapsed = 0;
        const program_time = this._lastSegmentProperty('program_time', msn, ({ duration = 0, discontinuity }) => {

            elapsed += duration;
            return discontinuity; // abort on discontinuity
        });

        return program_time ? new Date(program_time.getTime() + (elapsed - (this.getSegment(msn)!.duration || 0)) * 1000) : null;
    }

    msnForDate(date: Date | number | boolean, findNearestAfter = false): Msn {

        if (typeof date === 'boolean') {
            findNearestAfter = date;
            date = null as any;
        }

        let startTime = date;
        if (typeof date !== 'number') {
            startTime = date ? +new Date(date as any) : Date.now();
        }

        startTime = startTime as number;

        // If findNearestAfter is true, the first sequence number after the date is returned
        // No assumptions are made about monotonic time

        const firstValid: { msn: number; delta: number | null; duration: number } = { msn: -1, delta: null, duration: 0 };
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

            const segmentDuration = 1000 * (segment.duration || 0);
            if (segmentEndTime !== -1 && segmentDuration > 0) {
                segmentEndTime += segmentDuration;

                // update firstValid
                const delta = segmentEndTime - startTime - 1;
                if (delta >= 0 && (firstValid.delta === null || delta < firstValid.delta! || delta < segmentDuration)) {
                    firstValid.msn = this.media_sequence + i;
                    firstValid.delta = delta;
                    firstValid.duration = segmentDuration;
                }
            }
        }

        if (!findNearestAfter && firstValid.delta! >= firstValid.duration) {
            return -1;
        }

        return firstValid.msn;
    }

    keysForMsn(msn: Msn | bigint): AttrList[] | undefined {

        msn = internals.tryBigInt(msn)!;

        const keys = new Map<string, AttrList>();
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
                        return undefined;
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
            identity.set('iv', initialMsn, AttrList.Types.HexInt);
        }

        return keys.size > 0 ? [...keys.values()] : undefined;
    }

    byterangeForMsn(msn: Msn | bigint): Byterange | undefined {

        msn = internals.tryBigInt(msn)!;
        if (msn === undefined) {
            return undefined;
        }

        const segmentIdx = Number(msn - BigIntish(this.media_sequence));
        const segment = this.segments[segmentIdx];
        if (!segment || !segment.byterange) {
            return undefined;
        }

        const length = parseInt(segment.byterange.length as unknown as string, 10);
        if (isNaN(length)) {
            return undefined;
        }

        let offset = parseInt(segment.byterange.offset as unknown as string, 10);
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

                const segmentLength = parseInt(byterange.length as unknown as string, 10);
                const segmentOffset = parseInt(byterange.offset as unknown as string, 10);
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

    mapForMsn(msn: Msn | bigint): AttrList | undefined {

        return this._lastSegmentProperty('map', msn);
    }

    getSegment(msn: Msn | bigint, independent?: false): MediaSegment | null;
    getSegment(msn: Msn | bigint, independent: true): IndependentSegment | null;

    getSegment(msn: Msn | bigint, independent = false): MediaSegment | null {

        msn = internals.tryBigInt(msn)!;
        if (msn === undefined) {
            return null;
        }

        const index = Number(msn - BigIntish(this.media_sequence));
        let segment = this.segments[index] || null;
        if (independent && segment) {
            segment = new MediaSegment(segment);
            // EXT-X-KEY, EXT-X-MAP, EXT-X-PROGRAM-DATE-TIME, EXT-X-BYTERANGE needs to be individualized
            segment.program_time = this.dateForMsn(msn);
            segment.keys = this.keysForMsn(msn);
            if (this.version >= 4) {
                segment.byterange = this.byterangeForMsn(msn);
            }

            if (this.version >= 5) {
                segment.map = this.mapForMsn(msn);
            }

            // Resolve relative byteranges in parts

            if (segment.parts) {
                let lastPart;
                for (const part of segment.parts) {
                    if (lastPart) {
                        const byterange = part.get('byterange', AttrList.Types.Byterange);
                        if (byterange &&
                            byterange.offset === undefined &&
                            part.get('uri') === lastPart.get('uri')) {

                            const lastByterange = lastPart.get('byterange', AttrList.Types.Byterange);
                            if (lastByterange?.offset !== undefined) {
                                byterange.offset = lastByterange.offset + lastByterange.length;
                                part.set('byterange', byterange, AttrList.Types.Byterange);
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

    rewriteUris(mapFn: UriMapFunction<'segment' | 'segment-key' | 'segment-map' | 'segment-part' | 'preload-hint' | 'rendition-report'>): this {

        const { rewriteAttrs } = internals;

        for (const segment of this.segments) {
            segment.rewriteUris(mapFn);
        }

        if (this.meta) {
            rewriteAttrs(mapFn, this.meta.preload_hints, 'preload-hint');
            rewriteAttrs(mapFn, this.meta.rendition_reports, 'rendition-report');
        }

        return super.rewriteUris(mapFn as UriMapFunction);
    }

    toString(): string {

        const { stringifyAttrs } = PlaylistWriter;

        const m3u8 = new PlaylistWriter(super.toString());

        m3u8.ext('TARGETDURATION', this.target_duration);

        m3u8.ext('PLAYLIST-TYPE', this.type);

        m3u8.ext('SERVER-CONTROL', stringifyAttrs(this.server_control));
        m3u8.ext('PART-INF', stringifyAttrs(this.part_info));

        const mediaSequence = parseInt(this.media_sequence as unknown as string, 10) || 0;
        if (mediaSequence !== 0) {
            m3u8.ext('MEDIA-SEQUENCE', mediaSequence);
        }

        if (this.type !== PlaylistType.VOD && this.type !== PlaylistType.EVENT) {
            m3u8.ext('DISCONTINUITY-SEQUENCE', parseInt(this.discontinuity_sequence as unknown as string, 10));
        }

        if (this.version >= 4) {
            m3u8.ext('I-FRAMES-ONLY', !!this.i_frames_only);
        }

        const meta = this.meta || {};

        m3u8.ext('SKIP', stringifyAttrs(meta.skip));

        for (const segment of this.segments) {
            m3u8.push(...segment.toString().split('\n'));
        }

        for (const [ext, entry] of MediaPlaylist._metas.entries()) {
            for (const key of meta[entry] || []) {
                m3u8.ext(ext, stringifyAttrs(key));
            }
        }

        m3u8.ext('ENDLIST', !!(this.ended && !this.master));

        return m3u8.toString() + '\n';
    }
}


export class MediaSegment implements IRewritableUris {

    duration?: number;
    title?: string;
    uri?: string;
    discontinuity: boolean;

    program_time?: Date | null;
    keys?: AttrList[];
    byterange?: { offset?: number; length: number };
    map?: AttrList;
    gap?: boolean;
    parts?: AttrList[];

    vendor?: Iterable<[string, string | null]>;

    constructor(obj?: unknown);
    constructor(uri: string | typeof URL | undefined, meta: MediaSegment, version?: number);

    constructor(uri?: string | typeof URL, meta?: MediaSegment, version?: number) {

        if (URL && uri instanceof URL) {
            uri = uri.href;
        }

        if (uri && typeof uri === 'object') {
            meta = uri as MediaSegment;
            uri = meta.uri as string;
            version = 10000;
        }

        meta = meta || {} as MediaSegment;

        this.duration = meta.duration;
        this.title = meta.title;
        this.uri = uri as string;
        this.discontinuity = !!meta.discontinuity;

        // optional
        if (meta.program_time) {
            this.program_time = new Date(meta.program_time);
        }

        if (meta.keys) {
            this.keys = internals.cloneAttrArray(meta.keys);
        }

        if (version! >= 4 && meta.byterange) {
            this.byterange = { ...meta.byterange };
        }

        if (version! >= 5 && meta.map) {
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
            if (typeof meta.vendor[Symbol.iterator] !== 'function') {
                // Convert from old style serialized format

                this.vendor = Object.entries(meta.vendor as unknown as { [entry: string]: string });
            }
            else {
                const set = this.vendor = [] as [string, string | null][];
                for (const [ext, value] of meta.vendor) {
                    set.push([ext, value]);
                }
            }
        }
    }

    isPartial(): boolean {

        const full = (this.uri || this.uri === '') && this.duration! >= 0;
        return !full;
    }

    rewriteUris(mapFn: UriMapFunction<'segment' | 'segment-key' | 'segment-map' | 'segment-part'>): this {

        const { rewriteAttrs, rewriteAttr } = internals;

        rewriteAttrs(mapFn, this.keys, 'segment-key');
        rewriteAttr(mapFn, this.map, 'segment-map');
        rewriteAttrs(mapFn, this.parts, 'segment-part');

        const newUri = mapFn(this.uri, 'segment', this);
        if (internals.isStringish(newUri)) {
            this.uri = newUri!;
        }

        return this;
    }

    toString(): string {

        const { stringifyAttrs } = PlaylistWriter;
        const m3u8 = new PlaylistWriter();

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

        if (this.byterange?.length || this.byterange?.length === 0) {
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
}


export type IndependentSegment = MediaSegment & {
    byterange?: Byterange;
};


class PlaylistWriter {

    static stringifyAttrs(attrs: AttrList | undefined) {

        if (attrs === undefined || typeof attrs !== 'object') {
            return undefined;
        }

        if (!(attrs instanceof AttrList)) {
            attrs = new AttrList(attrs);
        }

        return attrs.size > 0 ? attrs.toString() : undefined;
    }

    static streamInfAttrs(obj: AttrList, version?: number) {

        const attrs = new AttrList(obj);
        if (version! >= 6) {
            attrs.delete('program-id');
        }

        return attrs;
    }

    _list: string[];

    constructor(header?: string) {

        this._list = header ? [header] : [];
    }

    push(...lines: string[]) {

        this._list.push(...lines);
    }

    ext(ext: string, value?: string | number | boolean | AttrList | Date) {

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
}

export type M3U8Playlist = MediaPlaylist | MainPlaylist;
