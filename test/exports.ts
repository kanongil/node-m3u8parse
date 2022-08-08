import { expect } from '@hapi/code';
import Lab from '@hapi/lab';

import * as M3U8Parse from 'm3u8parse';
import * as AttrList from 'm3u8parse/attrlist';
import * as Playlist from 'm3u8parse/playlist';


// Test shortcuts

export const lab = Lab.script();
const { describe } = lab;


describe('has required exports', () => {

    describe('M3U8Parse', () => {

        expect(M3U8Parse).to.contain([
            'AttrList',
            'MainPlaylist',
            'MediaPlaylist',
            'MediaSegment',
            'ParserError',
            'default'
        ]);
    });

    describe('AttrList', () => {

        expect(AttrList).to.contain([
            'AttrList'
        ]);
    });

    describe('Playlist', () => {

        expect(Playlist).to.contain([
            'MainPlaylist',
            'MediaPlaylist',
            'MediaSegment'
        ]);
    });
});
