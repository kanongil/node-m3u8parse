import { M3U8Parser, PlaylistType } from './parser.js';

import type { ParserOptions } from './parser.js';
import type { M3U8Playlist, MasterPlaylist, MediaPlaylist } from './playlist.js';

export { AttrList } from './attrlist.js';
export { ParserError, PlaylistType } from './parser.js';
export { MasterPlaylist, MediaPlaylist, MediaSegment } from './playlist.js';

export type { ParserOptions } from './parser.js';
export type { IndependentSegment, M3U8Playlist } from './playlist.js';


export interface ParseOptions extends ParserOptions {
    type?: PlaylistType | `${PlaylistType}`;
}


export default function (input: string, options?: ParseOptions & { type: PlaylistType.Main | 'main' }): MasterPlaylist;
export default function (input: string, options?: ParseOptions & { type: PlaylistType.Media | 'media' }): MediaPlaylist;
export default function (input: string, options?: ParseOptions): M3U8Playlist;

export default function (input: string, options: ParseOptions = {}): M3U8Playlist {

    if (typeof input !== 'string') {
        throw new TypeError('Passed input must be a string');
    }

    if (options.type && (options.type !== PlaylistType.Main && options.type !== PlaylistType.Media)) {
        throw new TypeError('Passed type must be "main" or "media"');
    }

    const parser = new M3U8Parser(options);

    const lines = input.split(/\r?\n/);
    if (lines[0] === '') {
        lines.shift();
    }

    for (const line of lines) {
        parser.feed(line);
    }

    return parser.finalize(options.type);
}

