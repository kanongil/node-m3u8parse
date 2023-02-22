import type * as AttrT from './attr-typings.js';

import { AttrList } from './attrlist.js';
import { BasePlaylist, cloneAttrArray, cloneAttrMap, ImmutableUriMapFunction, Immutify, IRewritableUris, isStringish, rewriteAttrs, rewriteMappedAttrs, UriMapFunction } from './playlist-base.js';
import { MediaPlaylist } from './playlist-media.js';
import { Proto } from './types.js';


interface Variant {
    uri: string;
    info?: AttrList<AttrT.StreamInf>;
}

export type EntryType = 'variant' | 'iframe' | 'group' | 'data' | 'session-key';

export class MainPlaylist extends BasePlaylist implements IRewritableUris {

    static cast(index: MediaPlaylist | MainPlaylist): MainPlaylist | never {

        if (!index.master) {
            throw new Error('Cannot cast a media playlist');
        }

        return index as MainPlaylist;
    }

    readonly master: true = true;

    variants: Variant[];
    groups: Map<string, AttrList<AttrT.Media>[]>;
    iframes: AttrList<AttrT.IFrameStreamInf>[];
    data: Map<string, AttrList<AttrT.SessionData>[]>;
    session_keys: AttrList<AttrT.SessionKey>[];

    constructor(obj?: Proto<MainPlaylist | ImmutableMainPlaylist>);
    constructor(obj?: Proto<ImmutableMainPlaylist>) {

        obj ??= {};

        super(obj);

        if (obj.master !== undefined && !!obj.master !== this.master) {
            throw new Error('Cannot create from media playlist');
        }

        this.variants = obj.variants?.map((variant) => ({ uri: variant.uri, info: new AttrList(variant.info) })) ?? [];
        this.groups = cloneAttrMap(obj.groups);
        this.iframes = cloneAttrArray(obj.iframes);
        this.data = cloneAttrMap(obj.data);
        this.session_keys = cloneAttrArray(obj.session_keys);
    }

    rewriteUris(mapFn: UriMapFunction<EntryType>): this {

        for (const variant of this.variants) {
            const newUri = mapFn(variant.uri, 'variant', variant);
            if (isStringish(newUri)) {
                variant.uri = newUri!;
            }
        }

        rewriteAttrs(mapFn, this.iframes, 'iframe');
        rewriteMappedAttrs(mapFn, this.groups, 'group');
        rewriteMappedAttrs(mapFn, this.data, 'data');
        rewriteAttrs(mapFn, this.session_keys, 'session-key');

        return this;
    }
}

interface _ImmutableMain extends MainPlaylist {
    rewriteUris(mapFn: ImmutableUriMapFunction<EntryType>): this;
}

export type ImmutableMainPlaylist = Immutify<_ImmutableMain>;
