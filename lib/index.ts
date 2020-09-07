import { AttrList } from './attrlist';
import _M3U8Parse, { ParserError } from './m3u8parse';
import { M3U8Playlist, M3U8Segment } from './m3u8playlist';
import type { MasterPlaylist, MediaPlaylist, M3U8IndependentSegment } from './m3u8playlist';

const M3U8Parse = Object.assign(_M3U8Parse, {
    AttrList, M3U8Playlist, M3U8Segment, ParserError
});

export = M3U8Parse as typeof M3U8Parse & {
    MasterPlaylist: MasterPlaylist;
    MediaPlaylist: MediaPlaylist;
    M3U8IndependentSegment: M3U8IndependentSegment;
};
