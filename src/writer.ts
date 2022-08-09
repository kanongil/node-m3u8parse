import { AttrList } from './attrlist.js';
import { M3U8Playlist, MainPlaylist, MediaPlaylist, MediaSegment } from './playlist.js';


const isStringish = function (val: unknown): boolean {

    return !!val || val === '';
};

const stringifyAttrs = function (attrs: AttrList | undefined) {

    if (attrs === undefined || typeof attrs !== 'object') {
        return undefined;
    }

    if (!(attrs instanceof AttrList)) {
        attrs = new AttrList(attrs);
    }

    return attrs.size > 0 ? attrs.toString() : undefined;
};

const streamInfAttrs = function (obj: AttrList, version?: number) {

    const attrs = new AttrList(obj);
    if (version! >= 6) {
        attrs.delete('program-id');
    }

    return attrs.toString();
};


export class PlaylistWriter {

    readonly playlist: Readonly<M3U8Playlist>;

    constructor(playlist: Readonly<M3U8Playlist>) {

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

    _writeShared(playlist: Readonly<M3U8Playlist>) {

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

    _writeMain(playlist: Readonly<MainPlaylist>) {

        for (const key of playlist.session_keys) {
            this._ext('SESSION-KEY', stringifyAttrs(key));
        }

        // add non-standard marlin entry

        const keys = (playlist as any as MediaSegment).keys;
        if (keys && Array.isArray(keys)) {
            for (const key of keys) {
                this._ext('KEY', stringifyAttrs(key));
            }
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

    _writeMedia(playlist: Readonly<MediaPlaylist>) {

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

    _writeSegment(segment: MediaSegment) {

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

        for (const part of segment.parts || []) {
            this._ext('PART', stringifyAttrs(part));
        }

        if (segment.duration) {
            this._push(`#EXTINF:${parseFloat(segment.duration.toFixed(5))},${segment.title}`);
            this._ext('GAP', !!segment.gap);

            if (segment.uri) {
                this._push(segment.uri);
            }
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
