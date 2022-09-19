import { AttrList, Byterange } from './attrlist.js';
import { cloneAttrArray, IRewritableUris, isStringish, rewriteAttr, rewriteAttrs, UriMapFunction } from './playlist-base.js';
import { Proto, URL } from './types.js';


export class MediaSegment implements IRewritableUris {

    duration?: number;
    title?: string;
    uri?: string;
    discontinuity: boolean;

    program_time?: Date | null;
    keys?: AttrList[];
    byterange?: Byterange;
    map?: AttrList;
    gap?: boolean;
    parts?: AttrList[];

    vendor?: Iterable<[string, string | null]>;

    constructor(obj?: Proto<MediaSegment>);
    constructor(uri: string | typeof URL | undefined, meta: Readonly<MediaSegment>, version?: number);
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    constructor(uri: string | typeof URL | undefined, meta: Proto<MediaSegment>, version?: number);

    constructor(uri?: string | typeof URL | Proto<MediaSegment>, meta?: Proto<MediaSegment>, version?: number) {

        if (URL && uri instanceof URL) {
            uri = uri.href;
        }

        if (uri && typeof uri === 'object') {
            meta = uri;
            uri = meta.uri;
            version = 10000;
        }

        meta = meta || {} as Proto<MediaSegment>;

        this.duration = meta.duration;
        this.title = meta.title;
        this.uri = uri as string;
        this.discontinuity = !!meta.discontinuity;

        // optional
        if (meta.program_time) {
            this.program_time = new Date(meta.program_time);
        }

        if (meta.keys) {
            this.keys = cloneAttrArray(meta.keys);
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
            this.parts = cloneAttrArray(meta.parts);
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

    isPartial(): this is PartialSegment {

        const full = (this.uri || this.uri === '') && this.duration! >= 0;
        return !full;
    }

    rewriteUris(mapFn: UriMapFunction<'segment' | 'segment-key' | 'segment-map' | 'segment-part'>): this {

        rewriteAttrs(mapFn, this.keys, 'segment-key');
        rewriteAttr(mapFn, this.map, 'segment-map');
        rewriteAttrs(mapFn, this.parts, 'segment-part');

        const newUri = mapFn(this.uri, 'segment', this);
        if (isStringish(newUri)) {
            this.uri = newUri!;
        }

        return this;
    }
}


interface FullSegment extends Readonly<MediaSegment> {
    duration: number;
    title: string;
    uri: string;
}


interface PartialSegment extends Readonly<MediaSegment> {
    isPartial(): true;
}


export type ImmutableMediaSegment = PartialSegment | FullSegment;


export type IndependentSegment = ImmutableMediaSegment & {
    byterange?: Required<Byterange>;
};
