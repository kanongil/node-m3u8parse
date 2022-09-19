import { AttrList, Byterange } from './attrlist.js';
import { ImmutableMediaSegment, IndependentSegment, MediaSegment } from './media-segment.js';
import { BasePlaylist, cloneAttrArray, ImmutableUriMapFunction, Immutify, IRewritableUris, rewriteAttrs, UriMapFunction } from './playlist-base.js';
import { MainPlaylist } from './playlist-main.js';
import { BigIntish, Proto } from './types.js';


type Msn = number;

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

interface Meta {
    skip?: AttrList;
    ranges?: AttrList[];
    preload_hints?: AttrList[];
    rendition_reports?: AttrList[];
}


const formatMsn = function (obj?: Msn): Msn | undefined {

    const type = typeof obj;
    return (obj === undefined || type === 'number' || type === 'bigint') ? obj : +obj;
};


const tryBigInt = function (value: unknown): bigint | undefined {

    try {
        if (typeof value === 'bigint') {
            return value;
        }

        if (typeof value === 'number' || typeof value === 'string') {
            return BigIntish(value);
        }
    }
    catch (err) { }

    return undefined;
};


/** Legacy properties, that could be used when restoring. */
interface Legacy {
    /** @deprecated Use {@link MediaPlaylist.media_sequence} */
    readonly first_seq_no?: number;

    /** @deprecated Completely removed */
    readonly allow_cache?: boolean;
}

export type EntryType = 'segment' | 'segment-key' | 'segment-map' | 'segment-part' | 'preload-hint' | 'rendition-report';

export class MediaPlaylist extends BasePlaylist implements IRewritableUris {

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

    constructor(obj?: Proto<MediaPlaylist | ImmutableMediaPlaylist>);
    constructor(obj?: Proto<ImmutableMediaPlaylist> & Legacy) {

        obj ??= {};

        super(obj);

        if (obj.master !== undefined && !!obj.master !== this.master) {
            throw new Error('Cannot create from main playlist');
        }

        this.target_duration = +obj.target_duration! || Number.NaN;
        this.media_sequence = formatMsn(obj.media_sequence) ?? formatMsn(obj.first_seq_no) ?? 0;
        this.discontinuity_sequence = formatMsn(obj.discontinuity_sequence);
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
                    this.meta[key] = cloneAttrArray(obj.meta[key]);
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

        const segments = this.segments as ImmutableMediaSegment[];
        return segments.reduce((sum, segment) => sum + (segment.duration ?? 0), 0);
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

        msn = tryBigInt(msn)!;

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

    dateForMsn(msn: Msn | bigint, lookahead = false): Date | null {

        // TODO: look ahead

        let elapsed = 0;
        const program_time = this._lastSegmentProperty('program_time', msn, ({ duration = 0, discontinuity }) => {

            elapsed += duration;
            return discontinuity; // abort on discontinuity
        });

        if (!program_time && lookahead) {

        }

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

        msn = tryBigInt(msn)!;

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

    byterangeForMsn(msn: Msn | bigint): Required<Byterange> | undefined {

        msn = tryBigInt(msn)!;
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

    getSegment(msn: Msn | bigint, independent?: false): ImmutableMediaSegment | null;
    getSegment(msn: Msn | bigint, independent: true): IndependentSegment | null;

    getSegment(msn: Msn | bigint, independent = false): ImmutableMediaSegment | null {

        msn = tryBigInt(msn)!;
        if (msn === undefined) {
            return null;
        }

        const index = Number(msn - BigIntish(this.media_sequence));
        const rawSegment = this.segments[index] as ImmutableMediaSegment | null ?? null;
        if (!independent || !rawSegment) {
            return rawSegment;
        }

        const segment = new MediaSegment(rawSegment);
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

        return segment as ImmutableMediaSegment;
    }

    rewriteUris(mapFn: UriMapFunction<EntryType>): this {

        for (const segment of this.segments) {
            segment.rewriteUris(mapFn);
        }

        if (this.meta) {
            rewriteAttrs(mapFn, this.meta.preload_hints, 'preload-hint');
            rewriteAttrs(mapFn, this.meta.rendition_reports, 'rendition-report');
        }

        return this;
    }
}

interface _ImmutablePlaylist extends MediaPlaylist {
    rewriteUris(mapFn: ImmutableUriMapFunction<EntryType>): this;
}

export type ImmutableMediaPlaylist = Immutify<_ImmutablePlaylist>;
