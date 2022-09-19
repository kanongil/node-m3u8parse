import { AttrList, ImmutableAttrList } from './attrlist.js';
import { isStringish } from './playlist-base.js';
import { MediaPlaylist, ImmutableMediaSegment, ImmutableMainPlaylist as ImmutableMainPlaylist, ImmutableMediaPlaylist as ImmutableMediaPlaylist } from './playlist.js';
import { PropsOf } from './types.js';


const stringifyAttrs = function (attrs: ImmutableAttrList | undefined) {

    if (attrs === undefined || typeof attrs !== 'object') {
        return undefined;
    }

    if (!(attrs instanceof AttrList)) {
        attrs = new AttrList(attrs);
    }

    return attrs.size > 0 ? attrs.toString() : undefined;
};

const streamInfAttrs = function (obj: ImmutableAttrList, version?: number) {

    const attrs = new AttrList(obj);
    if (version! >= 6) {
        attrs.delete('program-id');
    }

    return attrs.toString();
};


export class PlaylistWriter {

    readonly playlist: PropsOf<ImmutableMainPlaylist | ImmutableMediaPlaylist>;

    constructor(playlist: PropsOf<ImmutableMainPlaylist | ImmutableMediaPlaylist>) {

        this.playlist = playlist;
    }

    compile(pusher: (...lines: string[]) => void) {

        this._push = pusher;
        try {
            const { playlist } = this;

            this._writeShared(playlist);

            if (playlist.master) {
                this._writeMain(playlist);
            }
            else {
                this._writeMedia(playlist);
            }

            this._push('');
        }
        finally {
            this._push = PlaylistWriter.prototype._push;
        }
    }

    toString() {

        const list: string[] = [];

        this.compile((...lines) => list.push(...lines));

        return list.join('\n');
    }

    _writeShared(playlist: PropsOf<ImmutableMainPlaylist | ImmutableMediaPlaylist>) {

        this._push('#EXTM3U');

        if (playlist.version > 1) {
            this._ext('VERSION', playlist.version);
        }

        for (const key of playlist.defines) {
            this._ext('DEFINE', stringifyAttrs(key));
        }

        this._ext('START', stringifyAttrs(playlist.start));
        this._ext('INDEPENDENT-SEGMENTS', !!playlist.independent_segments);

        if (playlist.vendor) {

            // Add vendor extensions

            for (const [ext, value] of playlist.vendor) {
                let line = ext;

                if (isStringish(value)) {
                    line += ':' + value;
                }

                this._push(line);
            }
        }
    }

    _writeMain(playlist: PropsOf<ImmutableMainPlaylist>) {

        for (const key of playlist.session_keys) {
            this._ext('SESSION-KEY', stringifyAttrs(key));
        }

        for (const list of playlist.data.values()) {
            for (const data of list) {
                this._ext('SESSION-DATA', stringifyAttrs(data));
            }
        }

        for (const list of playlist.groups.values()) {
            for (const group of list) {
                this._ext('MEDIA', stringifyAttrs(group));
            }
        }

        for (const iframe of playlist.iframes) {
            this._ext('I-FRAME-STREAM-INF', streamInfAttrs(iframe));
        }

        for (const variant of playlist.variants) {
            if (variant.info) {
                this._ext('STREAM-INF', streamInfAttrs(variant.info));
            }

            this._push(variant.uri);
        }
    }

    _writeMedia(playlist: PropsOf<ImmutableMediaPlaylist>) {

        this._ext('TARGETDURATION', playlist.target_duration);

        this._ext('PLAYLIST-TYPE', playlist.type);

        this._ext('SERVER-CONTROL', stringifyAttrs(playlist.server_control));
        this._ext('PART-INF', stringifyAttrs(playlist.part_info));

        const mediaSequence = parseInt(playlist.media_sequence as unknown as string, 10) || 0;
        if (mediaSequence !== 0) {
            this._ext('MEDIA-SEQUENCE', mediaSequence);
        }

        if (playlist.type !== MediaPlaylist.Type.VOD && playlist.type !== MediaPlaylist.Type.EVENT) {
            this._ext('DISCONTINUITY-SEQUENCE', parseInt(playlist.discontinuity_sequence as unknown as string, 10));
        }

        if (playlist.version >= 4) {
            this._ext('I-FRAMES-ONLY', !!playlist.i_frames_only);
        }

        const meta = playlist.meta || {};

        this._ext('SKIP', stringifyAttrs(meta.skip));

        for (const segment of playlist.segments) {
            this._writeSegment(segment);
        }

        for (const [ext, entry] of MediaPlaylist._metas.entries()) {
            for (const key of meta[entry] || []) {
                this._ext(ext, stringifyAttrs(key));
            }
        }

        this._ext('ENDLIST', !!playlist.ended);
    }

    _writeSegment(segment: PropsOf<ImmutableMediaSegment>) {

        this._ext('DISCONTINUITY', !!segment.discontinuity);

        if (segment.program_time) {
            const program_time = segment.program_time.toISOString ? segment.program_time.toISOString() : segment.program_time;
            this._ext('PROGRAM-DATE-TIME', program_time);
        }

        if (segment.keys) {
            for (const key of segment.keys) {
                this._ext('KEY', stringifyAttrs(key));
            }
        }

        this._ext('MAP', stringifyAttrs(segment.map));

        if (segment.byterange?.length || segment.byterange?.length === 0) {
            let range = '' + segment.byterange.length;
            if (segment.byterange.offset || segment.byterange.offset === 0) {
                range += '@' + segment.byterange.offset;
            }

            this._ext('BYTERANGE', range);
        }

        if (segment.vendor) {

            // Add vendor extensions

            for (const [ext, value] of segment.vendor) {
                let line = ext;

                if (isStringish(value)) {
                    line += ':' + value;
                }

                this._push(line);
            }
        }

        for (const part of segment.parts ?? []) {
            this._ext('PART', stringifyAttrs(part));
        }

        if (segment.uri && segment.duration !== undefined) {
            this._push(`#EXTINF:${parseFloat(segment.duration.toFixed(5))},${segment.title}`);
            this._ext('GAP', !!segment.gap);

            this._push(segment.uri);
        }
    }

    _push(...lines: string[]) {

        throw new Error('No compiler');
    }

    _ext(ext: string, value?: string | number | boolean | Date) {

        if (value === undefined ||
            value === false ||
            (typeof value === 'number' && isNaN(value))) {

            return;
        }

        if (value === true) {
            this._push('#EXT-X-' + ext);
        }
        else {
            this._push(`#EXT-X-${ext}:${value}`);
        }
    }
}
