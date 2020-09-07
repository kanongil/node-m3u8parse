import { ok as assertOk } from 'assert';
import { Stream } from 'stream';

let Debug;
try {
    Debug = require('debug');
}
catch (err) {}

import Clone = require('clone');
import Split = require('split');

import { AttrList } from './attrlist';
import { M3U8Playlist, M3U8Segment } from './m3u8playlist';


const internals = {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    debug: (Debug ? Debug('m3u8parse') : function () {}) as (line: string, ...args: unknown[]) => void
};


interface ParserOptions {
    extensions?: { [K: string]: boolean };
}

export default function (input: string | Buffer, options?: ParserOptions): M3U8Playlist;
export default function (input: Stream, options?: ParserOptions): Promise<M3U8Playlist>;

export default function (input: Stream | string | Buffer, options: ParserOptions = {}): Promise<M3U8Playlist> | M3U8Playlist {

    const m3u8 = new M3U8Playlist();
    let line_no = 0;
    const deferred: { promise: Promise<M3U8Playlist>; resolve: (val?: M3U8Playlist) => void; reject: (err: Error) => void } = {} as any;
    let meta: M3U8Segment & { info?: AttrList } = {} as any;

    assertOk(input || input === '', 'Input must be a stream, string, or buffer');

    const ReportError = (err: Error) => {

        if (deferred.promise) {
            return deferred.reject(err);
        }

        throw err;
    };

    const extensions = Clone(options.extensions || {});

    const ParseExt = function (cmd: string, arg: string | null = null) {

        // Parse vendor extensions

        if (cmd in extensions) {
            const extObj = extensions[cmd] ? meta : m3u8;
            if (!extObj.vendor) {
                extObj.vendor = [];
            }

            (extObj.vendor as [string, string | null][]).push([cmd, arg]);
            return true;
        }

        if (!(cmd in extParser)) {
            return false;
        }

        internals.debug('parsing ext', cmd, arg);
        extParser[cmd](arg!);

        return true;
    };

    const ParseLine = function (line: string) {

        line_no += 1;

        if (line_no === 1) {
            if (line !== '#EXTM3U') {
                return ReportError(new ParserError('Missing required #EXTM3U header', line, line_no));
            }

            return true;
        }

        if (!line.length) {
            return true;        // blank lines are ignored (3.1)
        }

        if (line[0] === '#') {
            const matches = /^(#EXT[^:]*)(:?.*)$/.exec(line);
            if (!matches) {
                return internals.debug('ignoring comment', line);
            }

            const cmd = matches[1];
            const arg = matches[2].length > 1 ? matches[2].slice(1) : null;

            if (!ParseExt(cmd, arg)) {
                return internals.debug('ignoring unknown #EXT:' + cmd, line_no);
            }
        }
        else if (m3u8.master) {
            meta.uri = line;
            m3u8.variants.push({ uri: meta.uri, info: meta.info }); // FIXME: ??
            meta = {} as any;
        }
        else {
            if (!('duration' in meta)) {
                return ReportError(new ParserError('Missing #EXTINF before media file URI', line, line_no));
            }

            m3u8.segments.push(new M3U8Segment(line, meta, m3u8.version));
            meta = {} as any;
        }

        return true;
    };

    // TODO: add more validation logic
    const extParser: { [ext: string]: (arg: string) => void } = {
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

            m3u8.first_seq_no = parseInt(arg, 10);
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
            meta.duration = parseFloat(duration);
            meta.title = title.join(',');

            if (meta.duration <= 0) {
                return ReportError(new ParserError('Invalid duration', '#EXTINF:' + arg, line_no));
            }
        },
        '#EXT-X-KEY': (arg) => {

            if (!meta.keys) {
                meta.keys = [];
            }

            meta.keys.push(new AttrList(arg));
        },
        '#EXT-X-PROGRAM-DATE-TIME': (arg) => {

            meta.program_time = new Date(arg);
        },
        '#EXT-X-DISCONTINUITY': () => {

            meta.discontinuity = true;
        },

        // master
        '#EXT-X-STREAM-INF': (arg) => {

            m3u8.master = true;
            meta.info = new AttrList(arg);
        },
        // master v4 since master streams are not required to specify version
        '#EXT-X-MEDIA': (arg) => {

            const attrs: AttrList = new AttrList(arg);
            const id = attrs.get('group-id', AttrList.Types.String) || '#';

            let list: AttrList[] & { type?: string } | undefined = m3u8.groups.get(id);
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

            m3u8.iframes.push(new AttrList(arg));
        },
        '#EXT-X-SESSION-DATA': (arg) => {

            const attrs = new AttrList(arg);
            const id = attrs.quotedString('data-id');

            if (id) {
                let list = m3u8.data.get(id);
                if (!list) {
                    list = [];
                    m3u8.data.set(id, list);
                }

                list.push(attrs);
            }
        },
        '#EXT-X-SESSION-KEY': (arg) => {

            m3u8.session_keys.push(new AttrList(arg));
        },
        '#EXT-X-GAP': () => {

            meta.gap = true;
        },
        '#EXT-X-DEFINE': (arg) => {

            m3u8.defines.push(new AttrList(arg));
        },
        '#EXT-X-PART-INF': (arg) => {

            m3u8.part_info = new AttrList(arg);
        },
        '#EXT-X-PART': (arg) => {

            (meta.parts = meta.parts || []).push(new AttrList(arg));
        },
        '#EXT-X-SERVER-CONTROL': (arg) => {

            m3u8.server_control = new AttrList(arg);
        },
        '#EXT-X-I-FRAMES-ONLY': () => {

            m3u8.i_frames_only = true;
        },
        '#EXT-X-BYTERANGE': (arg) => {

            const n = arg.split('@');
            meta.byterange = { length: parseInt(n[0], 10) };
            if (n.length > 1) {
                meta.byterange.offset = parseInt(n[1], 10);
            }
        },
        '#EXT-X-MAP': (arg) => {

            meta.map = new AttrList(arg);
        },
        '#EXT-X-SKIP': (arg) => {

            m3u8.meta.skip = new AttrList(arg);
        }
    };

    for (const [ext, entry] of M3U8Playlist._metas.entries()) {
        extParser['#EXT-X-' + ext] = (arg) => {

            (m3u8.meta[entry] = m3u8.meta[entry] || []).push(new AttrList(arg));
        };
    }

    const Complete = function () {

        if (line_no === 0) {
            return ReportError(new ParserError('No line data', '', -1));
        }

        if (Object.keys(meta).length) {
            m3u8.segments.push(new M3U8Segment(undefined, meta, m3u8.version));    // Append a partial segment
        }

        return deferred.promise ? deferred.resolve(m3u8) : m3u8;
    };

    if (input instanceof Stream) {
        deferred.promise = new Promise<M3U8Playlist>((resolve, reject) => {

            deferred.resolve = resolve;
            deferred.reject = reject;
        });

        const cr = input.pipe(Split());
        cr.on('data', ParseLine);
        cr.on('end', Complete);

        input.on('error', deferred.reject as any);

        return deferred.promise.finally(() => {

            input.removeListener('error', deferred.reject as any);
            cr.removeListener('data', ParseLine);
            cr.removeListener('end', Complete);
        });
    }

    const lines = (Buffer.isBuffer(input) ? input.toString('utf-8') : input).split(/\r?\n/);
    if (lines[0] === '') {
        lines.shift();
    }

    for (const line of lines) {
        if (ParseLine(line) !== true) {
            break;
        }
    }

    return Complete() as M3U8Playlist;
}


export class ParserError extends Error {

    line: string;
    lineNumber: number;

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(msg: string, line: string, line_no: number, constr? : Function) {

        super();

        Error.captureStackTrace(this, constr || this.constructor);
        this.message = msg || 'Error';
        this.line = line;
        this.lineNumber = line_no;
    }
}

ParserError.prototype.name = 'Parser Error';
