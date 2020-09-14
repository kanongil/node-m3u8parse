'use strict';

const Fs = require('fs');
const Path = require('path');

const Code = require('@hapi/code');
const Lab = require('@hapi/lab');
const M3u8Parse = require('..');
const { MasterPlaylist, MediaPlaylist } = require('..');


const fixtureDir = Path.join(__dirname, 'fixtures');

// Test shortcuts

const { describe, it, before } = exports.lab = Lab.script();
const { expect } = Code;


describe('M3U8Parse', () => {

    it('should parse a valid live file', async () => {

        const stream = Fs.createReadStream(Path.join(fixtureDir, 'enc.m3u8'));
        const index = await M3u8Parse(stream);

        expect(index).to.exist();
        expect(index.master).to.be.false();
    });

    it('supports buffer input', async () => {

        const buf = Fs.readFileSync(Path.join(fixtureDir, 'enc.m3u8'));
        const index = await M3u8Parse(buf);

        expect(index).to.exist();
        expect(index.master).to.be.false();
    });

    it('supports string input', async () => {

        const str = Fs.readFileSync(Path.join(fixtureDir, 'enc.m3u8'), 'utf-8');
        const index = await M3u8Parse(str);

        expect(index).to.exist();
        expect(index.master).to.be.false();
    });

    it('throws a ParserError for empty input', () => {

        expect(() => M3u8Parse('')).to.throw(M3u8Parse.ParserError, 'No line data');
    });

    it('should parse a valid VOD file', async () => {

        const stream = Fs.createReadStream(Path.join(fixtureDir, 'vod.m3u8'));
        const index = await M3u8Parse(stream);
        expect(index).to.exist();
        expect(index.master).to.be.false();
    });

    it('should parse a basic master file', async () => {

        const stream = Fs.createReadStream(Path.join(fixtureDir, 'variant.m3u8'));
        const index = await M3u8Parse(stream);
        expect(index).to.exist();
        expect(index.master).to.be.true();
    });

    it('should parse an advanced master file', async () => {

        const stream = Fs.createReadStream(Path.join(fixtureDir, 'variant_v4.m3u8'));
        const index = await M3u8Parse(stream);
        expect(index).to.exist();
        expect(index.master).to.be.true();
    });

    it('should parse a v6 master file', async () => {

        const stream = Fs.createReadStream(Path.join(fixtureDir, 'variant_v6.m3u8'));
        const index = await M3u8Parse(stream);
        expect(index).to.exist();
        expect(index.master).to.be.true();
    });

    it('should parse an iframe master file', async () => {

        const stream = Fs.createReadStream(Path.join(fixtureDir, 'variant_iframe.m3u8'));
        const index = await M3u8Parse(stream);
        expect(index).to.exist();
        expect(index.master).to.be.true();
    });

    it('should handle vendor extensions', async () => {

        const stream = Fs.createReadStream(Path.join(fixtureDir, 'enc.m3u8'));
        const index = await M3u8Parse(stream, { extensions: { '#EXT-X-UNKNOWN-EXTENSION': false, '#EXT-Y-META-EXTENSION': true } });
        expect(index).to.exist();

        expect(index.vendor).to.equal([['#EXT-X-UNKNOWN-EXTENSION', null]]);
        expect(index.segments[2].vendor).to.equal([['#EXT-Y-META-EXTENSION', 'w00t']]);

        const index2 = new MediaPlaylist(index);
        expect(index2.vendor).to.equal([['#EXT-X-UNKNOWN-EXTENSION', null]]);
        expect(index2.segments[2].vendor).to.equal([['#EXT-Y-META-EXTENSION', 'w00t']]);
    });

    it('should fail on invalid files', async () => {

        const stream = Fs.createReadStream(Path.join(fixtureDir, 'empty.m3u8'));
        await expect(M3u8Parse(stream)).to.reject(M3u8Parse.ParserError);
    });
});

describe('M3U8Playlist', () => {

    /** @type {MediaPlaylist} */
    let testIndex;
    /** @type {MediaPlaylist} */
    let testIndexAlt;
    /** @type {MediaPlaylist} */
    let testIndexSingle;
    /** @type {MediaPlaylist} */
    let testIndexLl;
    /** @type {MasterPlaylist} */
    let masterIndex;

    before(async () => {

        testIndex = await M3u8Parse(Fs.createReadStream(Path.join(fixtureDir, 'enc.m3u8')));
        testIndexAlt = await M3u8Parse(Fs.createReadStream(Path.join(fixtureDir, 'enc-discont.m3u8')));
        testIndexSingle = await M3u8Parse(Fs.createReadStream(Path.join(fixtureDir, 'enc-single.m3u8')));
        testIndexLl = await M3u8Parse(Fs.createReadStream(Path.join(fixtureDir, 'll.m3u8')));
        masterIndex = await M3u8Parse(Fs.createReadStream(Path.join(fixtureDir, 'variant_v4.m3u8')));
    });

    describe('constructor', () => {

        it('should clone passed object', () => {

            expect(testIndex).to.equal(new MediaPlaylist(testIndex));
            expect(testIndexAlt).to.equal(new MediaPlaylist(testIndexAlt));
            expect(testIndexSingle).to.equal(new MediaPlaylist(testIndexSingle));
            expect(masterIndex).to.equal(new MasterPlaylist(masterIndex));
            expect(testIndexLl).to.equal(new MediaPlaylist(testIndexLl));
        });

        it('support JSONification', () => {

            expect(testIndex).to.equal(new MediaPlaylist(JSON.parse(JSON.stringify(testIndex))));
            expect(testIndexAlt).to.equal(new MediaPlaylist(JSON.parse(JSON.stringify(testIndexAlt))));
            expect(testIndexSingle).to.equal(new MediaPlaylist(JSON.parse(JSON.stringify(testIndexSingle))));
            expect(masterIndex).to.equal(new MasterPlaylist(JSON.parse(JSON.stringify(masterIndex))));
        });

        it('performs object to Map conversion', async () => {

            const stream = Fs.createReadStream(Path.join(fixtureDir, 'variant_v4.m3u8'));
            const index = await M3u8Parse(stream);

            const toObject = function (map) {

                const obj = Object.create(null);

                for (const [key, value] of map) {
                    obj[key] = value;
                }

                return obj;
            };

            expect(index.groups.size).to.be.above(0);
            expect(index.data.size).to.be.above(0);

            index.groups = toObject(index.groups);
            index.data = toObject(index.data);

            expect(new MasterPlaylist(index)).to.equal(masterIndex);
        });
    });

    describe('#totalDuration()', () => {

        it('should calculate total of all segments durations', () => {

            expect(testIndex.totalDuration()).to.equal(46.166);
            expect(new MediaPlaylist().totalDuration()).to.equal(0);
        });
    });

    describe('#isLive()', () => {

        it('should return true when no #EXT-X-ENDLIST is present', () => {

            expect(testIndex.ended).to.be.false();
            expect(testIndex.isLive()).to.be.true();
        });
    });

    describe('#startMsn()', () => {

        it('should return the sequence number to start streaming from', () => {

            expect(testIndex.startMsn()).to.equal(7794);
            expect(testIndexSingle.startMsn()).to.equal(300);
            expect(new MediaPlaylist().startMsn()).to.equal(-1);
        });

        it('should handle the full option', () => {

            expect(testIndex.startMsn(true)).to.equal(7794);
            expect(testIndexSingle.startMsn(true)).to.equal(300);
            expect(new MediaPlaylist().startMsn(true)).to.equal(-1);
        });
    });

    describe('#lastMsn()', () => {

        it('should return the sequence number of the final segment', () => {

            expect(testIndex.lastMsn()).to.equal(7797);
            expect(new MediaPlaylist().lastMsn()).to.equal(-1);
            expect(new MediaPlaylist().lastMsn(false)).to.equal(-1);
        });
    });

    describe('#isValidMsn()', () => {

        it('should return false for early numbers', () => {

            expect(testIndex.isValidMsn(-1000)).to.be.false();
            expect(testIndex.isValidMsn(0)).to.be.false();
            expect(testIndex.isValidMsn('100')).to.be.false();
        });

        it('should return false for future numbers', () => {

            expect(testIndex.isValidMsn(10000)).to.be.false();
            expect(testIndex.isValidMsn('10000')).to.be.false();
        });

        it('should return true for numbers in range', () => {

            expect(testIndex.isValidMsn(7794)).to.be.true();
            expect(testIndex.isValidMsn('7795')).to.be.true();
            expect(testIndex.isValidMsn(7796)).to.be.true();
            expect(testIndex.isValidMsn(7797)).to.be.true();
        });
    });

    describe('#dateForMsn()', () => {

        it('should return null for out of bounds sequence numbers', () => {

            expect(testIndex.dateForMsn(0)).to.not.exist();
            expect(testIndex.dateForMsn('100')).to.not.exist();
            expect(testIndex.dateForMsn(10000)).to.not.exist();
            expect(testIndex.dateForMsn('10000')).to.not.exist();
        });

        it('should return null for indexes with no date information', () => {

            expect(new MediaPlaylist().dateForMsn(0)).to.not.exist();

            const index = new MediaPlaylist(testIndex);
            delete index.segments[0].program_time;
            expect(index.dateForMsn(7794)).to.not.exist();
        });

        it('should return correct value for numbers in range', () => {

            expect(testIndex.dateForMsn('7794')).to.be.an.instanceof(Date);
            expect(testIndex.dateForMsn(7794)).to.equal(new Date('2013-10-29T11:34:13.000Z'));
            expect(testIndex.dateForMsn(7795)).to.equal(new Date('2013-10-29T11:34:15.833Z'));
            expect(testIndex.dateForMsn(7796)).to.equal(new Date('2013-10-29T11:34:30.833Z'));
            expect(testIndex.dateForMsn(7797)).to.equal(new Date('2013-10-29T11:34:44.000Z'));
        });

        it('should handle a discontinuity', () => {

            expect(testIndexAlt.dateForMsn(7794)).to.equal(new Date('2013-10-29T11:34:13.000Z'));
            expect(testIndexAlt.dateForMsn(7795)).to.not.exist();
            expect(testIndexAlt.dateForMsn(7796)).to.not.exist();
            expect(testIndexAlt.dateForMsn(7797)).to.equal(new Date('2013-10-20T19:34:44.000Z'));
        });
    });

    describe('#msnForDate()', () => {

        it('should return -1 for out of bounds dates', () => {

            expect(testIndex.msnForDate()).to.equal(-1);
            expect(testIndex.msnForDate(0)).to.equal(-1);
            expect(testIndex.msnForDate(true)).to.equal(-1);
            expect(testIndex.msnForDate(new Date())).to.equal(-1);
            expect(testIndex.msnForDate(new Date('2013-10-29T11:34:12.999Z'))).to.equal(-1);
            expect(testIndex.msnForDate(new Date('2013-10-29T12:34:59.000+0100'))).to.equal(-1);
            expect(testIndex.msnForDate(Number.MAX_VALUE)).to.equal(-1);
            expect(testIndex.msnForDate('2014-01-01', true)).to.equal(-1);
            expect(testIndex.msnForDate(Infinity)).to.equal(-1);
        });

        it('should return correct sequence numbers for in bound dates', () => {

            expect(testIndex.msnForDate(0, true)).to.equal(7794);
            expect(testIndex.msnForDate(new Date('2013-10-29T11:34:12.999Z'), true)).to.equal(7794);
            expect(testIndex.msnForDate(new Date('2013-10-29T11:34:13.000Z'))).to.equal(7794);
            expect(testIndex.msnForDate(new Date('2013-10-29T11:34:13.000Z'), true)).to.equal(7794);
            expect(testIndex.msnForDate(new Date('2013-10-29T11:34:15.832Z'))).to.equal(7794);
            expect(testIndex.msnForDate(new Date('2013-10-29T11:34:15.832Z'), true)).to.equal(7794);
            expect(testIndex.msnForDate(new Date('2013-10-29T11:34:15.833Z'))).to.equal(7795);
            expect(testIndex.msnForDate(new Date('2013-10-29T11:34:15.833Z'), true)).to.equal(7795);
            expect(testIndex.msnForDate('2013-10-29T11:34:18.000Z')).to.equal(7795);
            expect(testIndex.msnForDate('2013-10-29T11:34:18.000Z', true)).to.equal(7795);
            expect(testIndex.msnForDate(new Date('2013-10-29T12:34:43.999+0100'))).to.equal(7796);
            expect(testIndex.msnForDate(new Date('2013-10-29T12:34:43.999+0100'), true)).to.equal(7796);
            expect(testIndex.msnForDate(1383046484000)).to.equal(7797);
            expect(testIndex.msnForDate(1383046484000, true)).to.equal(7797);
            expect(testIndex.msnForDate(new Date('2013-10-29T12:34:58.999+0100'))).to.equal(7797);
            expect(testIndex.msnForDate(new Date('2013-10-29T12:34:58.999+0100'), true)).to.equal(7797);
            expect(testIndex.msnForDate(-Infinity, true)).to.equal(7794);
        });

        it('should return correct sequence numbers for indexes with non-monotonic discontinuities', () => {

            expect(testIndexAlt.msnForDate(0, true)).to.equal(7797);
            expect(testIndexAlt.msnForDate(new Date('2013-10-29T11:34:12.999Z'), true)).to.equal(7794);
            expect(testIndexAlt.msnForDate(new Date('2013-10-29T11:34:13.000Z'))).to.equal(7794);
            expect(testIndexAlt.msnForDate(new Date('2013-10-29T11:34:15.833Z'))).to.equal(-1);
            expect(testIndexAlt.msnForDate(new Date('2013-10-29T11:34:15.833Z'), true)).to.equal(-1);
            expect(testIndexAlt.msnForDate(new Date('2013-10-20T20:34:44.000+0100'))).to.equal(7797);
            expect(testIndexAlt.msnForDate(new Date('2013-10-20'), true)).to.equal(7797);
        });
    });

    describe('#keysForMsn()', () => {

        it('should return null for for out of bounds sequence numbers', () => {

            expect(testIndex.keysForMsn(0)).to.not.exist();
            expect(testIndexAlt.keysForMsn('100')).to.not.exist();
            expect(testIndexSingle.keysForMsn(100)).to.not.exist();
            expect(testIndex.keysForMsn(10000)).to.not.exist();
            expect(testIndexAlt.keysForMsn('10000')).to.not.exist();
            expect(testIndexSingle.keysForMsn(10000)).to.not.exist();
        });

        it('should return null for for indexes with no key information', () => {

            expect(new MediaPlaylist().keysForMsn(0)).to.not.exist();

            const index = new MediaPlaylist(testIndex);
            delete index.segments[0].keys;
            expect(index.keysForMsn(7794)).to.not.exist();
        });

        it('should return correct value for numbers in range', () => {

            expect(testIndex.keysForMsn(7794)).to.equal([new M3u8Parse.AttrList({ method: 'AES-128', uri: '"https://priv.example.com/key.php?r=52"', iv: '0x1e72' })]);
            expect(testIndex.keysForMsn(7795)).to.equal([new M3u8Parse.AttrList({ method: 'AES-128', uri: '"https://priv.example.com/key.php?r=52"', iv: '0x1e73' })]);
            expect(testIndex.keysForMsn(7796)).to.equal([new M3u8Parse.AttrList({ method: 'AES-128', uri: '"https://priv.example.com/key.php?r=52"', iv: '0x1e74' })]);
            expect(testIndex.keysForMsn(7797)).to.equal([new M3u8Parse.AttrList({ method: 'AES-128', uri: '"https://priv.example.com/key.php?r=53"', iv: '0x1e75' })]);

            expect(testIndexSingle.keysForMsn(300)).to.equal([new M3u8Parse.AttrList({ method: 'SAMPLE-AES', uri: '"https://priv.example.com/key.php?r=52"', iv: '0x1234' })]);
            expect(testIndexSingle.keysForMsn(301)).to.not.exist();
            expect(testIndexSingle.keysForMsn(302)).to.equal([
                new M3u8Parse.AttrList({ method: 'SAMPLE-AES', uri: '"https://priv.example.com/key.php?r=53"', iv: '0x4321' }),
                new M3u8Parse.AttrList({ method: 'SAMPLE-AES', uri: '"skd://key53"', keyformat: '"com.apple.streamingkeydelivery"', keyformatversions: '"1"' })
            ]);
            expect(testIndexSingle.keysForMsn(303)).to.equal([
                new M3u8Parse.AttrList({ method: 'SAMPLE-AES', uri: '"https://priv.example.com/key.php?r=53"', iv: '0x4322' }),
                new M3u8Parse.AttrList({ method: 'SAMPLE-AES', uri: '"skd://key53"', keyformat: '"com.apple.streamingkeydelivery"', keyformatversions: '"1"' })
            ]);
        });

        it('should handle multiple keyformats', () => {
        });

        it('should return null after method=NONE', () => {

            expect(testIndexAlt.keysForMsn(7795)).to.not.exist();
            expect(testIndexSingle.keysForMsn(301)).to.not.exist();
        });
    });

    describe('#byterangeForMsn()', () => {

        it('should return null for for out of bounds sequence numbers', () => {

            expect(testIndexSingle.byterangeForMsn(0)).to.not.exist();
            expect(testIndexSingle.byterangeForMsn('100')).to.not.exist();
            expect(testIndexSingle.byterangeForMsn('10000')).to.not.exist();
        });

        it('should return null for for indexes with no byterange information', () => {

            expect(testIndex.byterangeForMsn(7794)).to.not.exist();
        });

        it('should return correct values', () => {

            expect(testIndexSingle.byterangeForMsn(300)).to.equal({ length: 300000, offset: 5000000 });
            expect(testIndexSingle.byterangeForMsn(301)).to.equal({ length: 300000, offset: 0 });
            expect(testIndexSingle.byterangeForMsn(302)).to.equal({ length: 300000, offset: 300000 });
            expect(testIndexSingle.byterangeForMsn(303)).to.equal({ length: 300000, offset: 600000 });
        });
    });

    describe('#getSegment()', () => {

        it('should return segment data for valid sequence numbers', () => {

            expect(testIndex.getSegment('7794')).to.be.an.instanceof(M3u8Parse.MediaSegment);
            expect(testIndex.getSegment(7797)).to.be.an.instanceof(M3u8Parse.MediaSegment);
        });

        it('should return null for out of bounds sequence numbers', () => {

            expect(testIndex.getSegment()).to.not.exist();
            expect(testIndex.getSegment(-1)).to.not.exist();
            expect(testIndex.getSegment(7793)).to.not.exist();
            expect(testIndex.getSegment(7798)).to.not.exist();

            expect(new MediaPlaylist().getSegment(0)).to.not.exist();
        });

        it('should return computed independent segments attributes correctly', () => {

            expect(testIndex.getSegment(7794, true)).to.be.an.instanceof(M3u8Parse.MediaSegment);
            expect(testIndex.getSegment(7794, true).program_time).to.equal(new Date('2013-10-29T11:34:13.000Z'));
            expect(testIndex.getSegment(7795, true).program_time).to.equal(new Date('2013-10-29T11:34:15.833Z'));
            expect(testIndex.getSegment(7796, true).program_time).to.equal(new Date('2013-10-29T11:34:30.833Z'));
            expect(testIndex.getSegment(7797, true).program_time).to.equal(new Date('2013-10-29T11:34:44.000Z'));
            expect(testIndex.getSegment(7794, true).keys).to.equal([new M3u8Parse.AttrList({ method: 'AES-128', uri: '"https://priv.example.com/key.php?r=52"', iv: '0x1e72' })]);
            expect(testIndex.getSegment(7795, true).keys).to.equal([new M3u8Parse.AttrList({ method: 'AES-128', uri: '"https://priv.example.com/key.php?r=52"', iv: '0x1e73' })]);
            expect(testIndex.getSegment(7796, true).keys).to.equal([new M3u8Parse.AttrList({ method: 'AES-128', uri: '"https://priv.example.com/key.php?r=52"', iv: '0x1e74' })]);
            expect(testIndex.getSegment(7797, true).keys).to.equal([new M3u8Parse.AttrList({ method: 'AES-128', uri: '"https://priv.example.com/key.php?r=53"', iv: '0x1e75' })]);
            expect(testIndexSingle.getSegment(302, true).byterange).to.equal({ length: 300000, offset: 300000 });
            expect(testIndex.getSegment(7794, true).map).to.not.exist();
            expect(testIndex.getSegment(7797, true).map).to.not.exist();
        });

        it('should resolve relative byteranges in parts', () => {

            const index = new MediaPlaylist({
                segments: [
                    new M3u8Parse.MediaSegment({
                        parts: [
                            new M3u8Parse.AttrList('URI="file1",BYTERANGE=100@50'),
                            new M3u8Parse.AttrList('URI="file1",BYTERANGE=150'),
                            new M3u8Parse.AttrList('URI="file1",BYTERANGE=50'),
                            new M3u8Parse.AttrList('URI="file1",BYTERANGE=100@500'),
                            new M3u8Parse.AttrList('URI="file2",BYTERANGE=150'),
                            new M3u8Parse.AttrList('URI="file2",BYTERANGE=100'),
                            new M3u8Parse.AttrList('URI="file3"'),
                            new M3u8Parse.AttrList('URI="file3",BYTERANGE=150')
                        ]
                    })
                ]
            });

            expect(index.getSegment(0, true)).to.be.an.instanceof(M3u8Parse.MediaSegment);
            expect(index.getSegment(0, true).parts).to.equal([
                new M3u8Parse.AttrList({ uri: '"file1"', byterange: '100@50' }),
                new M3u8Parse.AttrList({ uri: '"file1"', byterange: '150@150' }),
                new M3u8Parse.AttrList({ uri: '"file1"', byterange: '50@300' }),
                new M3u8Parse.AttrList({ uri: '"file1"', byterange: '100@500' }),
                new M3u8Parse.AttrList({ uri: '"file2"', byterange: '150' }),
                new M3u8Parse.AttrList({ uri: '"file2"', byterange: '100' }),
                new M3u8Parse.AttrList({ uri: '"file3"' }),
                new M3u8Parse.AttrList({ uri: '"file3"', byterange: '150' })
            ]);
        });
    });

    describe('#rewriteUris()', () => {

        it('should map all variant playlist uris', () => {

            const mapFn = function (uri, type) {

                return uri + '?' + type;
            };

            const index = new MediaPlaylist(testIndex).rewriteUris(mapFn);
            expect(index.segments[0].uri).to.equal('http://media.example.com/fileSequence52-A.ts?segment');
            expect(index.segments[0].keys[0].quotedString('uri')).to.equal('https://priv.example.com/key.php?r=52?segment-key');
            expect(index.segments[3].uri).to.equal('http://media.example.com/fileSequence53-A.ts?segment');
            // TODO: test segment-map

            const index2 = new MediaPlaylist(testIndexLl).rewriteUris(mapFn);
            expect(index2.meta.rendition_reports[0].quotedString('uri')).to.equal('../1M/waitForMSN.php?rendition-report');
            expect(index2.meta.preload_hints[0].quotedString('uri')).to.equal('filePart273.4.mp4?preload-hint');
            expect(index2.segments[2].parts[0].quotedString('uri')).to.equal('filePart271.0.mp4?segment-part');
            expect(index2.segments[4].parts[3].quotedString('uri')).to.equal('filePart273.3.mp4?segment-part');
        });

        it('should map all master playlist uris', () => {

            const mapFn = function (uri, type) {

                return uri + '?' + type;
            };

            const index = new MasterPlaylist(masterIndex).rewriteUris(mapFn);

            expect(index.variants[0].uri).to.equal('low/video-only.m3u8?variant');
            expect(index.variants[3].uri).to.equal('main/english-audio.m3u8?variant');
            expect(index.iframes[0].quotedString('uri')).to.equal('lo/iframes.m3u8?iframe');
            expect(index.iframes[2].quotedString('uri')).to.equal('hi/iframes.m3u8?iframe');
            expect(index.groups.get('aac')[0].quotedString('uri')).to.equal('main/english-audio.m3u8?group');
            expect(index.groups.get('aac')[2].quotedString('uri')).to.equal('commentary/audio-only.m3u8?group');
            expect(index.data.get('com.example.lyrics')[0].quotedString('uri')).to.equal('lyrics.json?data');
            expect(index.session_keys[0].quotedString('uri')).to.equal('https://priv.example.com/key.php?r=52?session-key');
        });

        it('preserves uris when mapFn returns undefined', () => {

            const mapFn = function (uri, type) {

                return;
            };

            const index = new MediaPlaylist(testIndex).rewriteUris(mapFn);
            expect(index.segments[0].uri).to.equal('http://media.example.com/fileSequence52-A.ts');
            expect(index.segments[0].keys[0].quotedString('uri')).to.equal('https://priv.example.com/key.php?r=52');
            expect(index.segments[3].uri).to.equal('http://media.example.com/fileSequence53-A.ts');

            const index2 = new MasterPlaylist(masterIndex).rewriteUris(mapFn);
            expect(index2.variants[0].uri).to.equal('low/video-only.m3u8');
            expect(index2.iframes[0].quotedString('uri')).to.equal('lo/iframes.m3u8');
            expect(index2.groups.get('aac')[0].quotedString('uri')).to.equal('main/english-audio.m3u8');
        });

        it('resolves in playlist order', () => {

            const index = new MediaPlaylist({
                segments: [{
                    uri: '',
                    keys: [{ uri: '"key:1"' }],
                    map: { uri: '"map:1"' },
                    parts: [{ uri: '"part:1"' }]
                },{
                    keys: [{ uri: '"key:2"' }],
                    map: { uri: '"map:2"' },
                    parts: [{ uri: '"part:2"' }]
                }],
                meta: {
                    preload_hints: [{ uri: '"hint:"' }],
                    rendition_reports: [{ uri: '"report:"' }]
                }
            });

            /** @type {string[]} */
            const calls = [];
            const mapFn = (uri, type) => {

                calls.push(type);
            };

            index.rewriteUris(mapFn);

            expect(calls).to.equal([
                'segment-key',
                'segment-map',
                'segment-part',
                'segment',
                'segment-key',
                'segment-map',
                'segment-part',
                'preload-hint',
                'rendition-report'
            ]);
        });

        it('works when attributes are missing', () => {

            const mapFn = function (uri, type) {

                return uri + '?' + type;
            };

            const index = new MediaPlaylist(testIndex);
            delete index.data;
            delete index.meta;

            const index2 = index.rewriteUris(mapFn);
            expect(index2.segments[0].uri).to.equal('http://media.example.com/fileSequence52-A.ts?segment');
            expect(index2.segments[0].keys[0].quotedString('uri')).to.equal('https://priv.example.com/key.php?r=52?segment-key');
            expect(index2.segments[3].uri).to.equal('http://media.example.com/fileSequence53-A.ts?segment');
        });

        it('assigns empty string uris', () => {

            const mapFn = () => '';

            const index = new MediaPlaylist(testIndexLl).rewriteUris(mapFn);
            expect(index.meta.rendition_reports[0].quotedString('uri')).to.equal('');
            expect(index.meta.preload_hints[0].quotedString('uri')).to.equal('');
            expect(index.segments[0].uri).to.equal('');
            expect(index.segments[2].parts[0].quotedString('uri')).to.equal('');

            const index2 = new MasterPlaylist(masterIndex).rewriteUris(mapFn);
            expect(index2.variants[0].uri).to.equal('');
        });
    });

    describe('parsed object includes', () => {

        it('session-data', () => {

            expect(masterIndex.data.get('com.example.lyrics')[0].quotedString('uri')).to.equal('lyrics.json');
            expect(masterIndex.data.get('com.example.title')[0].quotedString('value')).to.equal('This is an example');
            expect(masterIndex.data.get('com.example.title')[1].quotedString('value')).to.equal('Este es un ejemplo');
        });

        it('segment gap info', () => {

            expect(testIndexSingle.segments[0].gap).to.not.exist();
            expect(testIndexSingle.segments[1].gap).to.be.true();
            expect(testIndexSingle.segments[2].gap).to.not.exist();
        });
    });

    describe('#toString()', () => {

        it('should output valid index files', async () => {

            const index = await M3u8Parse(testIndex.toString());
            expect(index).to.exist();
            expect(testIndex).to.equal(index);

            const index2 = await M3u8Parse(testIndexAlt.toString());
            expect(index2).to.exist();
            expect(testIndexAlt).to.equal(index2);

            const index3 = await M3u8Parse(testIndexSingle.toString());
            expect(index3).to.exist();
            expect(testIndexSingle).to.equal(index3);

            const index4 = await M3u8Parse(testIndexLl.toString());
            expect(index4).to.exist();
            expect(testIndexLl).to.equal(index4);
        });

        it('should output valid master files', async () => {

            const index = await M3u8Parse(masterIndex.toString());
            expect(index).to.exist();
            expect(masterIndex).to.equal(index);

            const masterIndexV6 = await M3u8Parse(Fs.createReadStream(Path.join(fixtureDir, 'variant_v6.m3u8')));
            const index2 = await M3u8Parse(masterIndexV6.toString());
            expect(index2).to.exist();
            expect(masterIndexV6).to.equal(index2);
        });

        it('should handle vendor extensions', () => {

            const index = new MasterPlaylist();

            index.vendor = new Map([
                ['#EXT-MY-TEST', 'yeah!'],
                ['#EXT-MY-SIMPLE', false]
            ]);
            expect(index.toString()).to.equal('#EXTM3U\n#EXT-MY-TEST:yeah!\n#EXT-MY-SIMPLE\n');

            index.vendor = {
                '#EXT-MY-TEST': 'yeah!',
                '#EXT-MY-SIMPLE': false
            };
            expect(new MasterPlaylist(index).toString()).to.equal('#EXTM3U\n#EXT-MY-TEST:yeah!\n#EXT-MY-SIMPLE\n');
        });

        it('should handle vendor segment-extensions', () => {

            const index = new MediaPlaylist();

            index.target_duration = 10;
            index.segments = [
                new M3u8Parse.MediaSegment({
                    uri: 'url',
                    duration: 10,
                    title: '',
                    vendor: new Map([['#EXT-MY-TEST', 'yeah!'], ['#EXT-MY-SIMPLE', false]])
                }),
                new M3u8Parse.MediaSegment({
                    uri: 'url',
                    duration: 10,
                    title: '',
                    vendor: { '#EXT-MY-TEST': 'yeah!', '#EXT-MY-SIMPLE': false }
                })
            ];
            index.ended = true;
            expect(index.toString()).to.equal('#EXTM3U\n#EXT-X-TARGETDURATION:10\n' +
                                              '#EXT-MY-TEST:yeah!\n#EXT-MY-SIMPLE\n#EXTINF:10,\nurl\n' +
                                              '#EXT-MY-TEST:yeah!\n#EXT-MY-SIMPLE\n#EXTINF:10,\nurl\n' +
                                              '#EXT-X-ENDLIST\n');
        });
    });
});
