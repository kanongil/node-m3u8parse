import { Stream, Readable } from 'stream';

import { M3U8Parser, PlaylistType } from './parser.js';

import type { M3U8Playlist, MainPlaylist, MediaPlaylist } from './playlist.js';

import parseString, { ParseOptions } from './index.js';


export * from './index.js';


const parseStream = async function (stream: Readable, options: ParseOptions): Promise<M3U8Playlist> {

    const parser = new M3U8Parser(options);

    stream.setEncoding('utf-8');

    let saved = '';
    for await (const input of stream) {
        const lines = (saved + input).split(/\r?\n/);

        let i;
        for (i = 0; i < lines.length - 1; ++i) {
            parser.feed(lines[i]);
        }

        saved = lines[i];
    }

    parser.feed(saved);

    return parser.finalize(options.type);
};


export default function (input: string | Buffer, options?: ParseOptions & { type: PlaylistType.Main | 'main' }): MainPlaylist;
export default function (input: string | Buffer, options?: ParseOptions & { type: PlaylistType.Media | 'media' }): MediaPlaylist;
export default function (input: string | Buffer, options?: ParseOptions): M3U8Playlist;
export default function (input: Stream | Readable, options?: ParseOptions & { type: PlaylistType.Main | 'main' }): Promise<MainPlaylist>;
export default function (input: Stream | Readable, options?: ParseOptions & { type: PlaylistType.Media | 'media' }): Promise<MediaPlaylist>;
export default function (input: Stream | Readable, options?: ParseOptions): Promise<M3U8Playlist>;

export default function (input: Stream | Readable | string | Buffer, options: ParseOptions = {}): Promise<M3U8Playlist> | M3U8Playlist {

    if (!(input instanceof Stream) && typeof input !== 'string' && !Buffer.isBuffer(input)) {
        throw new TypeError('Passed input must be a stream, string, or buffer');
    }

    if (options.type && (options.type !== PlaylistType.Main && options.type !== PlaylistType.Media)) {
        throw new TypeError(`Passed type must be "${PlaylistType.Main}" or "${PlaylistType.Media}"`);
    }

    if (input instanceof Stream) {
        return parseStream(input as Readable, options);
    }

    input = Buffer.isBuffer(input) ? input.toString('utf-8') : input;
    return parseString(input, options);
}
