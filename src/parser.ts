import { AttrList } from './attrlist.js';
import { MediaPlaylist, MainPlaylist, MediaSegment, M3U8Playlist } from './playlist.js';
import { PropsOf } from './types.js';


export enum PlaylistType {
    Main = 'main',
    Media = 'media'
}


export interface ParserOptions {
    extensions?: { [K: string]: boolean };
    debug?: (line: string, ...args: unknown[]) => void;
}


interface ParserState {
    readonly m3u8: Partial<Omit<PropsOf<MediaPlaylist>, 'master'> & Omit<PropsOf<MainPlaylist>, 'master'> & { master: boolean }>;
    meta: MediaSegment & { info?: AttrList };
}


const extParser = new Map<string,(state: ParserState, arg?: string) => void>([
    /* eslint-disable no-return-assign */
    ['VERSION', (_, arg) => _.m3u8.version = parseInt(arg!, 10)],
    ['TARGETDURATION', (_, arg) => _.m3u8.target_duration = parseInt(arg!, 10)],
    ['MEDIA-SEQUENCE', (_, arg) => _.m3u8.media_sequence = parseInt(arg!, 10)],
    ['DISCONTINUITY-SEQUENCE', (_, arg) => _.m3u8.discontinuity_sequence = parseInt(arg!, 10)],
    ['PLAYLIST-TYPE', (_, arg) => _.m3u8.type = arg!],
    ['START', (_, arg) => _.m3u8.start = new AttrList(arg!)],
    ['INDEPENDENT-SEGMENTS', (_) => _.m3u8.independent_segments = true],
    ['ENDLIST', (_) => _.m3u8.ended = true],
    ['KEY', (_, arg) => (_.meta.keys ??= []).push(new AttrList(arg))],
    ['PROGRAM-DATE-TIME', (_, arg) => _.meta.program_time = new Date(arg!)],
    ['DISCONTINUITY', (_) => _.meta.discontinuity = true],

    // main
    ['STREAM-INF', (_, arg) => {

        _.m3u8.master = true;
        _.meta.info = new AttrList(arg);
    }],

    // main v4 since main streams are not required to specify version
    ['MEDIA', (_, arg) => {

        const attrs = new AttrList(arg);
        const id = attrs.get('group-id', AttrList.Types.String) ?? '#';

        let list: AttrList[] & { type?: string } | undefined = (_.m3u8.groups ??= new Map()).get(id);
        if (!list) {
            list = [];
            _.m3u8.groups.set(id, list);
            if (id !== '#') {
                list.type = attrs.get('type');
            }
        }

        list.push(attrs);
    }],
    ['I-FRAME-STREAM-INF', (_, arg) => (_.m3u8.iframes ??= []).push(new AttrList(arg))],
    ['SESSION-DATA', (_, arg) => {

        const attrs = new AttrList(arg);
        const id = attrs.quotedString('data-id');

        if (id) {
            let list = (_.m3u8.data ??= new Map()).get(id);
            if (!list) {
                list = [];
                _.m3u8.data.set(id, list);
            }

            list.push(attrs);
        }
    }],
    ['SESSION-KEY', (_, arg) => (_.m3u8.session_keys ??= []).push(new AttrList(arg))],
    ['GAP', (_) => _.meta.gap = true],
    ['DEFINE', (_, arg) => (_.m3u8.defines ??= []).push(new AttrList(arg))],
    ['PART-INF', (_, arg) => _.m3u8.part_info = new AttrList(arg)],
    ['PART', (_, arg) => (_.meta.parts ??= []).push(new AttrList(arg))],
    ['SERVER-CONTROL', (_, arg) => _.m3u8.server_control = new AttrList(arg)],
    ['I-FRAMES-ONLY', (_) => _.m3u8.i_frames_only = true],
    ['BYTERANGE', (_, arg) => {

        const n = arg!.split('@');
        _.meta.byterange = { length: parseInt(n[0], 10) };
        if (n.length > 1) {
            _.meta.byterange.offset = parseInt(n[1], 10);
        }
    }],
    ['MAP', (_, arg) => _.meta.map = new AttrList(arg)],
    ['SKIP', (_, arg) => (_.m3u8.meta ??= Object.create(null)).skip = new AttrList(arg)]
    /* eslint-enable no-return-assign */
]);

for (const [ext, entry] of MediaPlaylist._metas.entries()) {
    extParser.set(ext, (_, arg) => {

        const m3u8meta = _.m3u8.meta ??= Object.create(null);
        (m3u8meta[entry] ??= []).push(new AttrList(arg));
    });
}


export class M3U8Parser {

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    static debug(line: string, ...args: unknown[]): void {}

    readonly extensions: NonNullable<ParserOptions['extensions']>;

    // Parser state

    state: ParserState = { m3u8: {}, meta: {} as any };
    lineNo = 0;

    constructor(options: ParserOptions = {}) {

        this.debug = options.debug ?? M3U8Parser.debug;

        this.extensions = Object.assign({}, options.extensions);
    }

    feed(line?: string): void {

        if (typeof line !== 'string') {
            throw new TypeError('Passed line must be string');
        }

        this._parseLine(line);
    }

    finalize(type: PlaylistType.Main | `${PlaylistType.Main}`): MainPlaylist;
    finalize(type: PlaylistType.Media | `${PlaylistType.Media}`): MediaPlaylist;
    finalize(type?: PlaylistType | `${PlaylistType}`): M3U8Playlist;
    finalize(type?: PlaylistType | `${PlaylistType}`): M3U8Playlist {

        const { state } = this;

        if (this.lineNo === 0) {
            throw new ParserError('No line data');
        }

        if (Object.keys(state.meta).length) {
            (state.m3u8.segments ??= []).push(new MediaSegment(undefined, state.meta, state.m3u8.version));    // Append a partial segment
            state.meta = {} as any;
        }

        if (type) {
            if (type !== PlaylistType.Main && type !== PlaylistType.Media) {
                throw new TypeError(`Passed type must be "${PlaylistType.Main}" or "${PlaylistType.Media}"`);
            }

            if (!!state.m3u8.master !== (type === PlaylistType.Main)) {
                throw new ParserError('Incorrect playlist type');
            }
        }

        return state.m3u8.master ? new MainPlaylist(state.m3u8 as any) : new MediaPlaylist(state.m3u8 as any);
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    debug(line: string, ...args: unknown[]) {}

    _parseLine(line: string): void {

        const { state } = this;

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
        else if (state.m3u8.master) {
            state.meta.uri = line;
            (state.m3u8.variants ??= []).push({ uri: state.meta.uri, info: state.meta.info }); // FIXME: ??
            state.meta = {} as any;
        }
        else {
            if (!('duration' in state.meta)) {
                throw new ParserError('Missing #EXTINF before media file URI', line, this.lineNo);
            }

            (state.m3u8.segments ??= []).push(new MediaSegment(line, state.meta, state.m3u8.version));
            state.meta = {} as any;
        }

    }

    _parseExt(cmd: string, arg: string | null = null) {

        const { state } = this;

        // Parse vendor extensions

        if (cmd in this.extensions) {
            const extObj = this.extensions[cmd] ? state.meta : state.m3u8;
            if (!extObj.vendor) {
                extObj.vendor = [];
            }

            (extObj.vendor as [string, string | null][]).push([cmd, arg]);
            return true;
        }

        if (!cmd.startsWith('#EXT-X-')) {
            if (arg && cmd === '#EXTINF') {
                const [duration, ...title] = arg.split(',');
                state.meta.duration = parseFloat(duration);
                state.meta.title = title.join(',');

                if (state.meta.duration <= 0) {
                    throw new ParserError('Invalid duration', '#EXTINF:' + arg, this.lineNo);
                }

                return true;
            }

            return false;
        }

        const name = cmd.slice(7);

        const handler = extParser.get(name);
        if (!handler) {
            return false;
        }

        this.debug('parsing ext', cmd, arg);
        handler(this.state, arg!);

        return true;
    }
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
