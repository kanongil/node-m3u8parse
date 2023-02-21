/// <reference lib="dom" />

import type { ImmutableAttrList } from './attrlist.js';
import type { ImmutableMediaSegment, MediaSegment } from './media-segment.js';

import { AttrList } from './attrlist.js';
import { PlaylistWriter } from './writer.js';
import { Proto } from './types.js';


export type UriMapFunction<T extends string = string> = (uri: string | undefined, type: T, data: unknown) => string | undefined | void;
export type ImmutableUriMapFunction<T extends string = string> = (uri: string | undefined, type: T, data: unknown) => undefined | void;


type ImmutableMap<K, V> = Omit<Map<K, V>, 'clear' | 'set' | 'delete'>;

export type Immutify<T> =
    // eslint-disable-next-line @typescript-eslint/ban-types
    T extends Function ? T :
        T extends AttrList ? ImmutableAttrList :
            T extends Map<string, AttrList[]> ? ImmutableMap<string, AttrList[]> :
                T extends MediaSegment ? ImmutableMediaSegment :
                    T extends object ? { readonly [P in keyof T]: Immutify<T[P]>; } :
                        T;


export const cloneAttrArray = function (src?: readonly ImmutableAttrList[]) {

    const dst: AttrList[] = [];
    for (const entry of src ?? []) {
        dst.push(new AttrList(entry));
    }

    return dst;
};


/** Map that JSON serializes to an object that can restore the map with Object.entries() */
class JSONableMap extends Map {

    toJSON() {

        const obj = Object.create(null);

        for (const [key, value] of this) {
            obj[key] = value;
        }

        return obj;
    }
}

const isIterable = function (x: any): x is Iterable<any> {

    return !!x?.[Symbol.iterator];
};

export const cloneAttrMap = function (src?: Iterable<[string, readonly ImmutableAttrList[]]> | { [key: string]: readonly ImmutableAttrList[] }): Map<string, AttrList[]> {

    const dst = new JSONableMap();

    if (src) {
        if (isIterable(src)) {
            for (const [key, list] of src) {
                dst.set(key, list.map((attrs) => new AttrList(attrs)));
            }
        }
        else {
            for (const key in src) {
                const list = src[key];
                dst.set(key, list.map((attrs) => new AttrList(attrs)));
            }
        }
    }

    return dst;
};


export const isStringish = function (val: unknown): val is string  {

    return !!val || val === '';
};

export const rewriteAttr = function (mapFn: UriMapFunction<any>, attrs: AttrList | null | undefined, type: string) {

    if (attrs?.has('uri')) {
        const newUri = mapFn(attrs.get('uri', AttrList.Types.String), type, attrs);
        if (isStringish(newUri)) {
            attrs.set('uri', newUri, AttrList.Types.String);
        }
    }
};

export const rewriteAttrs = function (mapFn: UriMapFunction<any>, list: AttrList[] | null | undefined, type: string) {

    for (const item of list || []) {
        rewriteAttr(mapFn, item, type);
    }
};

export const rewriteMappedAttrs = function (mapFn: UriMapFunction<any>, map: Map<string, AttrList[]>, type: string) {

    if (map) {
        for (const list of map.values()) {
            rewriteAttrs(mapFn, list, type);
        }
    }
};


export interface IRewritableUris {
    rewriteUris(mapFn: UriMapFunction): this;
}

export interface ImmutableIRewritableUris extends IRewritableUris {
    rewriteUris(mapFn: ImmutableUriMapFunction): this;
}


export class BasePlaylist {

    readonly master: boolean;
    version: number;

    start?: AttrList;
    independent_segments?: boolean;
    defines: AttrList[];

    vendor?: Iterable<[string, string | null]>;

    constructor(obj: Immutify<Proto<BasePlaylist>>) {

        this.master = !!obj.master;

        this.version = obj.version || 1;
        this.start = obj.start ? new AttrList(obj.start) : undefined;
        this.independent_segments = obj.independent_segments !== undefined ? !!obj.independent_segments : undefined;
        this.defines = cloneAttrArray(obj.defines);

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

    toString(): string {

        return new PlaylistWriter(this as any).toString();
    }
}
