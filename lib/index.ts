import AttrList from './attrlist';
import { M3U8Playlist, M3U8Segment } from './m3u8playlist';
import M3U8Parse, { ParserError } from './m3u8parse';

export = Object.assign(M3U8Parse, {
    AttrList, M3U8Playlist, M3U8Segment, ParserError
});
