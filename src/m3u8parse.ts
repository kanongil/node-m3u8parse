import type { Readable } from 'stream';

import { ok as assertOk } from 'assert';
import { Stream } from 'stream';

import Split from 'split';

import { AttrList } from './attrlist.js';
import { M3U8Playlist, MediaPlaylist, MasterPlaylist, MediaSegment } from './m3u8playlist.js';


type PlaylistType = 'main' | 'media';

interface ParserOptions {
    type?: PlaylistType;
    extensions?: { [K: string]: boolean };
    debug?: (line: string, ...args: unknown[]) => void;
}

export class M3U8Parser {

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    static debug(line: string, ...args: unknown[]): void {}

    readonly m3u8: Partial<Omit<MediaPlaylist, 'master'> & Omit<MasterPlaylist, 'master'> & { master: boolean }> = {};
    readonly extensions: NonNullable<ParserOptions['extensions']>;
    extParser: { [ext: string]: (arg: string) => void } = {};

    // Parser state

    meta = {} as MediaSegment & { info?: AttrList };
    lineNo = 0;

    constructor(options: Omit<ParserOptions,'type'> = {}) {

        this.debug = options.debug ?? M3U8Parser.debug;

        this.extensions = Object.assign({}, options.extensions);
        this._prepareExtParser();
    }

    feed(line?: string): void {

        assertOk(typeof line === 'string', 'Must pass strings');

        this._parseLine(line);
    }

    finalize(type: 'main'): MasterPlaylist;
    finalize(type: 'media'): MediaPlaylist;
    finalize(type?: PlaylistType): M3U8Playlist;
    finalize(type?: PlaylistType): M3U8Playlist {

        const { m3u8 } = this;

        if (this.lineNo === 0) {
            throw new ParserError('No line data');
        }

        if (Object.keys(this.meta).length) {
            (m3u8.segments ??= []).push(new MediaSegment(undefined, this.meta, m3u8.version));    // Append a partial segment
            this.meta = {} as any;
        }

        if (type) {
            assertOk(type === 'main' || type === 'media', 'Type must be "main" or "media"');

            if (!!m3u8.master !== (type === 'main')) {
                throw new ParserError('Invalid playlist type');
            }
        }

        return m3u8.master ? new MasterPlaylist(m3u8 as any) : new MediaPlaylist(m3u8 as any);
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    debug(line: string, ...args: unknown[]) {}

    _prepareExtParser() {

        const { m3u8 } = this;

        // TODO: add more validation logic
        this.extParser = {
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

                m3u8.media_sequence = parseInt(arg, 10);
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

                const [duration, ...title] = arg.split(',');
                this.meta.duration = parseFloat(duration);
                this.meta.title = title.join(',');

                if (this.meta.duration <= 0) {
                    throw new ParserError('Invalid duration', '#EXTINF:' + arg, this.lineNo);
                }
            },
            '#EXT-X-KEY': (arg) => {

                if (!this.meta.keys) {
                    this.meta.keys = [];
                }

                this.meta.keys.push(new AttrList(arg));
            },
            '#EXT-X-PROGRAM-DATE-TIME': (arg) => {

                this.meta.program_time = new Date(arg);
            },
            '#EXT-X-DISCONTINUITY': () => {

                this.meta.discontinuity = true;
            },

            // master
            '#EXT-X-STREAM-INF': (arg) => {

                m3u8.master = true;
                this.meta.info = new AttrList(arg);
            },
            // master v4 since master streams are not required to specify version
            '#EXT-X-MEDIA': (arg) => {

                const attrs: AttrList = new AttrList(arg);
                const id = attrs.get('group-id', AttrList.Types.String) || '#';

                let list: AttrList[] & { type?: string } | undefined = (m3u8.groups ??= new Map()).get(id);
                if (!list) {
                    list = [];
                    m3u8.groups.set(id, list);
                    if (id !== '#') {
                        list.type = attrs.get('type');
                    }
                }

                list.push(attrs);
            },
            '#EXT-X-I-FRAME-STREAM-INF': (arg) => {

                (m3u8.iframes ??= []).push(new AttrList(arg));
            },
            '#EXT-X-SESSION-DATA': (arg) => {

                const attrs = new AttrList(arg);
                const id = attrs.quotedString('data-id');

                if (id) {
                    let list = (m3u8.data ??= new Map()).get(id);
                    if (!list) {
                        list = [];
                        m3u8.data.set(id, list);
                    }

                    list.push(attrs);
                }
            },
            '#EXT-X-SESSION-KEY': (arg) => {

                (m3u8.session_keys ??= []).push(new AttrList(arg));
            },
            '#EXT-X-GAP': () => {

                this.meta.gap = true;
            },
            '#EXT-X-DEFINE': (arg) => {

                (m3u8.defines ??= []).push(new AttrList(arg));
            },
            '#EXT-X-PART-INF': (arg) => {

                m3u8.part_info = new AttrList(arg);
            },
            '#EXT-X-PART': (arg) => {

                (this.meta.parts = this.meta.parts || []).push(new AttrList(arg));
            },
            '#EXT-X-SERVER-CONTROL': (arg) => {

                m3u8.server_control = new AttrList(arg);
            },
            '#EXT-X-I-FRAMES-ONLY': () => {

                m3u8.i_frames_only = true;
            },
            '#EXT-X-BYTERANGE': (arg) => {

                const n = arg.split('@');
                this.meta.byterange = { length: parseInt(n[0], 10) };
                if (n.length > 1) {
                    this.meta.byterange.offset = parseInt(n[1], 10);
                }
            },
            '#EXT-X-MAP': (arg) => {

                this.meta.map = new AttrList(arg);
            },
            '#EXT-X-SKIP': (arg) => {

                (m3u8.meta ??= Object.create(null)).skip = new AttrList(arg);
            }
        };

        for (const [ext, entry] of MediaPlaylist._metas.entries()) {
            this.extParser['#EXT-X-' + ext] = (arg) => {

                const m3u8meta = m3u8.meta ??= Object.create(null);
                (m3u8meta[entry] ??= []).push(new AttrList(arg));
            };
        }
    }

    _parseLine(line: string): void {

        this.lineNo += 1;

        if (this.lineNo === 1) {
            if (line !== '#EXTM3U') {
                throw new ParserError('Missing required #EXTM3U header', line, this.lineNo);
            }

            return;
        }

        if (!line.length) {
            return;            // blank lines are ignored (3.1)
        }

        if (line[0] === '#') {
            const matches = /^(#EXT[^:]*)(:?.*)$/.exec(line);
            if (!matches) {
                return this.debug('ignoring comment', line);
            }

            const cmd = matches[1];
            const arg = matches[2].length > 1 ? matches[2].slice(1) : null;

            if (!this._parseExt(cmd, arg)) {
                return this.debug('ignoring unknown #EXT:' + cmd, this.lineNo);
            }
        }
        else if (this.m3u8.master) {
            this.meta.uri = line;
            (this.m3u8.variants ??= []).push({ uri: this.meta.uri, info: this.meta.info }); // FIXME: ??
            this.meta = {} as any;
        }
        else {
            if (!('duration' in this.meta)) {
                throw new ParserError('Missing #EXTINF before media file URI', line, this.lineNo);
            }

            (this.m3u8.segments ??= []).push(new MediaSegment(line, this.meta, this.m3u8.version));
            this.meta = {} as any;
        }

    }

    _parseExt(cmd: string, arg: string | null = null) {

        // Parse vendor extensions

        if (cmd in this.extensions) {
            const extObj = this.extensions[cmd] ? this.meta : this.m3u8;
            if (!extObj.vendor) {
                extObj.vendor = [];
            }

            (extObj.vendor as [string, string | null][]).push([cmd, arg]);
            return true;
        }

        if (!(cmd in this.extParser)) {
            return false;
        }

        this.debug('parsing ext', cmd, arg);
        this.extParser[cmd](arg!);

        return true;
    }
}


const interceptError = function <T>(method: (...args: T[]) => any, onError: (err: Error) => void) {

    return function (...args: T[]) {

        try {
            method(...args);
        }
        catch (err) {
            onError(err as Error);
        }
    };
};


export default function (input: string | Buffer, options?: ParserOptions & { type: 'main' }): MasterPlaylist;
export default function (input: string | Buffer, options?: ParserOptions & { type: 'media' }): MediaPlaylist;
export default function (input: string | Buffer, options?: ParserOptions): M3U8Playlist;
export default function (input: Stream | Readable, options?: ParserOptions & { type: 'main' }): Promise<MasterPlaylist>;
export default function (input: Stream | Readable, options?: ParserOptions & { type: 'media' }): Promise<MediaPlaylist>;
export default function (input: Stream | Readable, options?: ParserOptions): Promise<M3U8Playlist>;

export default function (input: Stream | Readable | string | Buffer, options: ParserOptions = {}): Promise<M3U8Playlist> | M3U8Playlist {

    assertOk(input instanceof Stream || typeof input === 'string' || Buffer.isBuffer(input), 'Input must be a stream, string, or buffer');
    assertOk(!options.type || options.type === 'main' || options.type === 'media', 'Type must be "main" or "media"');

    const parser = new M3U8Parser(options);

    if (input instanceof Stream) {
        const deferred = {} as { promise: Promise<M3U8Playlist>; resolve: (val: M3U8Playlist) => void; reject: (err: Error) => void };
        deferred.promise = new Promise<M3U8Playlist>((resolve, reject) => {

            deferred.resolve = resolve;
            deferred.reject = reject;
        });

        const feeder = interceptError(parser.feed.bind(parser), deferred.reject);
        const cr = input.pipe(Split());
        cr.on('data', feeder);
        cr.on('end', deferred.resolve);

        input.on('error', deferred.reject);

        return deferred.promise.finally(() => {

            input.removeListener('error', deferred.reject);
            cr.removeListener('data', feeder);
            cr.removeListener('end', deferred.resolve);
        }).then(() => parser.finalize()!);
    }

    const lines = (Buffer.isBuffer(input) ? input.toString('utf-8') : input).split(/\r?\n/);
    if (lines[0] === '') {
        lines.shift();
    }

    for (const line of lines) {
        parser.feed(line);
    }

    return parser.finalize(options.type);
}


export class ParserError extends Error {

    readonly name = 'ParserError';

    line: string;
    lineNumber: number;

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(msg: string, line?: string, line_no?: number, constr?: Function) {

        super(msg ?? 'Error');

        this.line = line ?? '';
        this.lineNumber = line_no ?? -1;
    }
}
