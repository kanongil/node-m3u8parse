/// <reference lib="dom" />

import { ImmutableMediaSegment, IndependentSegment, MediaSegment } from './media-segment.js';
import { ImmutableMainPlaylist, MainPlaylist } from './playlist-main.js';
import { ImmutableMediaPlaylist, MediaPlaylist } from './playlist-media.js';


export type { ImmutableMainPlaylist, ImmutableMediaPlaylist, ImmutableMediaSegment, IndependentSegment };
export { MainPlaylist, MediaPlaylist, MediaSegment };

export type M3U8Playlist = MainPlaylist | MediaPlaylist;
