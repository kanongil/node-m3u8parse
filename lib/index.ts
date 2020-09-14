import { AttrList } from './attrlist';
import _M3U8Parse, { ParserError } from './m3u8parse';
import { MasterPlaylist, MediaPlaylist, MediaSegment } from './m3u8playlist';
import type { IndependentSegment } from './m3u8playlist';

const M3U8Parse = Object.assign(_M3U8Parse, {
    AttrList, MasterPlaylist, MediaPlaylist, MediaSegment, ParserError
});

export = M3U8Parse as typeof M3U8Parse & {
    M3U8IndependentSegment: IndependentSegment;
};
