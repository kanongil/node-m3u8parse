var fs = require('fs'),
    path = require('path'),
    Readable = require('stream').Readable,
    should = require('should');

var m3u8parse = require('../m3u8parse');

var fixtureDir = path.join(__dirname, 'fixtures');

describe('M3U8Parse', function() {

  it('should parse a valid file', function(done) {
  	var stream = fs.createReadStream(path.join(fixtureDir, 'enc.m3u8'));
    m3u8parse(stream, function(err, index) {
      should.not.exist(err);
      should.exist(index);
      index.variant.should.be.false;
      done();
    });
  })

  it('should parse a basic variant file', function(done) {
  	var stream = fs.createReadStream(path.join(fixtureDir, 'variant.m3u8'));
    m3u8parse(stream, function(err, index) {
      should.not.exist(err);
      should.exist(index);
      index.variant.should.be.true;
      done();
    });
  })

  it('should parse an advanced variant file', function(done) {
  	var stream = fs.createReadStream(path.join(fixtureDir, 'variant_v4.m3u8'));
    m3u8parse(stream, function(err, index) {
      should.not.exist(err);
      should.exist(index);
      index.variant.should.be.true;
      done();
    });
  })

  it('should parse a v6 variant file', function(done) {
  	var stream = fs.createReadStream(path.join(fixtureDir, 'variant_v6.m3u8'));
    m3u8parse(stream, function(err, index) {
      should.not.exist(err);
      should.exist(index);
      index.variant.should.be.true;
      done();
    });
  })

  it('should parse an iframe variant file', function(done) {
  	var stream = fs.createReadStream(path.join(fixtureDir, 'variant_iframe.m3u8'));
    m3u8parse(stream, function(err, index) {
      should.not.exist(err);
      should.exist(index);
      index.variant.should.be.true;
      done();
    });
  })

  it('should parse vendor extensions', function(done) {
    var stream = fs.createReadStream(path.join(fixtureDir, 'enc.m3u8'));
    m3u8parse(stream, { extensions: {'#EXT-X-UNKNOWN-EXTENSION':false, '#EXT-Y-META-EXTENSION':true} }, function(err, index) {
      should.not.exist(err);
      should.exist(index);

      should.exist(index.vendor);
      index.vendor.should.eql({ '#EXT-X-UNKNOWN-EXTENSION': null });

      should.exist(index.segments[2].vendor);
      index.segments[2].vendor.should.eql({ '#EXT-Y-META-EXTENSION': 'w00t' });
      done();
    });
  })

})

describe('M3U8Playlist', function() {
  var testIndex = null;
  var testIndexAlt = null;
  var testIndexSingle = null;
  var variantIndex = null;

  before(function(done) {
  	var stream = fs.createReadStream(path.join(fixtureDir, 'enc.m3u8'));
    m3u8parse(stream, function(err, index) {
      should.not.exist(err);
      testIndex = index;
      done();
    });
  })

  before(function(done) {
    var stream = fs.createReadStream(path.join(fixtureDir, 'enc-discont.m3u8'));
    m3u8parse(stream, function(err, index) {
      should.not.exist(err);
      testIndexAlt = index;
      done();
    });
  })

  before(function(done) {
    var stream = fs.createReadStream(path.join(fixtureDir, 'enc-single.m3u8'));
    m3u8parse(stream, function(err, index) {
      should.not.exist(err);
      testIndexSingle = index;
      done();
    });
  })

  before(function(done) {
  	var stream = fs.createReadStream(path.join(fixtureDir, 'variant_v4.m3u8'));
    m3u8parse(stream, function(err, index) {
      should.not.exist(err);
      variantIndex = index;
      done();
    });
  })

  describe('constructor', function() {
    it('should auto instantiate', function() {
      m3u8parse.M3U8Playlist().should.be.an.instanceof(m3u8parse.M3U8Playlist);
    })

    it('should clone passed object', function() {
      testIndex.should.eql(new m3u8parse.M3U8Playlist(testIndex));
      variantIndex.should.eql(new m3u8parse.M3U8Playlist(variantIndex));
    })
  })

  describe('#totalDuration()', function() {
    it('should calculate total of all segments durations', function() {
      testIndex.totalDuration().should.equal(46.166);
      variantIndex.totalDuration().should.equal(0);
    })
  })

  describe('#isLive()', function() {
    it('should return true when no #EXT-X-ENDLIST is present', function() {
      testIndex.ended.should.be.false;
      testIndex.isLive().should.be.true;
    })
  })

  describe('#startSeqNo()', function() {
    it('should return the sequence number to start streaming from', function() {
      testIndex.startSeqNo().should.equal(7794);
      variantIndex.startSeqNo().should.equal(-1);
    })
  })

  describe('#lastSeqNo()', function() {
    it('should return the sequence number of the final segment', function() {
      testIndex.lastSeqNo().should.equal(7797);
      variantIndex.lastSeqNo().should.equal(-1);
    })
  })

  describe('#isValidSeqNo()', function() {
    it('should return false for early numbers', function() {
      testIndex.isValidSeqNo(-1000).should.be.false;
      testIndex.isValidSeqNo(0).should.be.false;
      testIndex.isValidSeqNo("100").should.be.false;
    })
    it('should return false for future numbers', function() {
      testIndex.isValidSeqNo(10000).should.be.false;
      testIndex.isValidSeqNo("10000").should.be.false;
    })
    it('should return true for numbers in range', function() {
      testIndex.isValidSeqNo(7794).should.be.true;
      testIndex.isValidSeqNo("7795").should.be.true;
      testIndex.isValidSeqNo(7796).should.be.true;
      testIndex.isValidSeqNo(7797).should.be.true;
    })
  })

  describe('#dateForSeqNo()', function() {
    it('should return null for out of bounds sequence numbers', function() {
      should.not.exist(testIndex.dateForSeqNo(0));
      should.not.exist(testIndex.dateForSeqNo("100"));
      should.not.exist(testIndex.dateForSeqNo(10000));
      should.not.exist(testIndex.dateForSeqNo("10000"));
    })
    it('should return null for indexes with no date information', function() {
      should.not.exist(variantIndex.dateForSeqNo(0));

      var index = new m3u8parse.M3U8Playlist(testIndex);
      delete index.segments[0].program_time;
      should.not.exist(index.dateForSeqNo(7794));
    })
    it('should return correct value for numbers in range', function() {
      testIndex.dateForSeqNo("7794").should.be.an.instanceof(Date);
      testIndex.dateForSeqNo(7794).should.eql(new Date('2013-10-29T11:34:13.000Z'));
      testIndex.dateForSeqNo(7795).should.eql(new Date('2013-10-29T11:34:15.833Z'));
      testIndex.dateForSeqNo(7796).should.eql(new Date('2013-10-29T11:34:30.833Z'));
      testIndex.dateForSeqNo(7797).should.eql(new Date('2013-10-29T11:34:44.000Z'));
    })
    it('should handle a discontinuity', function() {
      testIndexAlt.dateForSeqNo(7794).should.eql(new Date('2013-10-29T11:34:13.000Z'));
      should.not.exist(testIndexAlt.dateForSeqNo(7795));
      should.not.exist(testIndexAlt.dateForSeqNo(7796));
      testIndexAlt.dateForSeqNo(7797).should.eql(new Date('2013-10-20T19:34:44.000Z'));
    })
  })

  describe('#seqNoForDate()', function() {
    it('should return -1 for out of bounds dates', function() {
      testIndex.seqNoForDate().should.equal(-1);
      testIndex.seqNoForDate(0).should.equal(-1);
      testIndex.seqNoForDate(true).should.equal(-1);
      testIndex.seqNoForDate(new Date()).should.equal(-1);
      testIndex.seqNoForDate(new Date('2013-10-29T11:34:12.999Z')).should.equal(-1);
      testIndex.seqNoForDate(new Date('2013-10-29T12:34:59.000+0100')).should.equal(-1);
      testIndex.seqNoForDate(Number.MAX_VALUE).should.equal(-1);
      testIndex.seqNoForDate('2014-01-01', true).should.equal(-1);
      testIndex.seqNoForDate(Infinity).should.equal(-1);
    })

    it('should return correct sequence numbers for in bound dates', function() {
      testIndex.seqNoForDate(0, true).should.equal(7794);
      testIndex.seqNoForDate(new Date('2013-10-29T11:34:12.999Z'), true).should.equal(7794);
      testIndex.seqNoForDate(new Date('2013-10-29T11:34:13.000Z')).should.equal(7794);
      testIndex.seqNoForDate(new Date('2013-10-29T11:34:13.000Z'), true).should.equal(7794);
      testIndex.seqNoForDate(new Date('2013-10-29T11:34:15.832Z')).should.equal(7794);
      testIndex.seqNoForDate(new Date('2013-10-29T11:34:15.832Z'), true).should.equal(7794);
      testIndex.seqNoForDate(new Date('2013-10-29T11:34:15.833Z')).should.equal(7795);
      testIndex.seqNoForDate(new Date('2013-10-29T11:34:15.833Z'), true).should.equal(7795);
      testIndex.seqNoForDate('2013-10-29T11:34:18.000Z').should.equal(7795);
      testIndex.seqNoForDate('2013-10-29T11:34:18.000Z', true).should.equal(7795);
      testIndex.seqNoForDate(new Date('2013-10-29T12:34:43.999+0100')).should.equal(7796);
      testIndex.seqNoForDate(new Date('2013-10-29T12:34:43.999+0100'), true).should.equal(7796);
      testIndex.seqNoForDate(1383046484000).should.equal(7797);
      testIndex.seqNoForDate(1383046484000, true).should.equal(7797);
      testIndex.seqNoForDate(new Date('2013-10-29T12:34:58.999+0100')).should.equal(7797);
      testIndex.seqNoForDate(new Date('2013-10-29T12:34:58.999+0100'), true).should.equal(7797);
      testIndex.seqNoForDate(-Infinity, true).should.equal(7794);
    })

    it('should return correct sequence numbers for indexes with non-monotonic discontinuities', function() {
      testIndexAlt.seqNoForDate(0, true).should.equal(7797);
      testIndexAlt.seqNoForDate(new Date('2013-10-29T11:34:12.999Z'), true).should.equal(7794);
      testIndexAlt.seqNoForDate(new Date('2013-10-29T11:34:13.000Z')).should.equal(7794);
      testIndexAlt.seqNoForDate(new Date('2013-10-29T11:34:15.833Z')).should.equal(-1);
      testIndexAlt.seqNoForDate(new Date('2013-10-29T11:34:15.833Z'), true).should.equal(-1);
      testIndexAlt.seqNoForDate(new Date('2013-10-20T20:34:44.000+0100')).should.equal(7797);
      testIndexAlt.seqNoForDate(new Date('2013-10-20'), true).should.equal(7797);
    })
  })

  describe('#keyForSeqNo()', function() {
    it('should return null for for out of bounds sequence numbers', function() {
      should.not.exist(testIndex.keyForSeqNo(0));
      should.not.exist(testIndexAlt.keyForSeqNo("100"));
      should.not.exist(testIndex.keyForSeqNo(10000));
      should.not.exist(testIndexAlt.keyForSeqNo("10000"));
    })
    it('should return null for for indexes with no key information', function() {
      should.not.exist(variantIndex.keyForSeqNo(0));

      var index = new m3u8parse.M3U8Playlist(testIndex);
      delete index.segments[0].key;
      should.not.exist(index.keyForSeqNo(7794));
    })
    it('should return correct value for numbers in range', function() {
      testIndex.keyForSeqNo(7794).should.eql(new m3u8parse.AttrList({method:'AES-128', uri:'"https://priv.example.com/key.php?r=52"', iv:'0x1e72'}));
      testIndex.keyForSeqNo(7795).should.eql(new m3u8parse.AttrList({method:'AES-128', uri:'"https://priv.example.com/key.php?r=52"', iv:'0x1e73'}));
      testIndex.keyForSeqNo(7796).should.eql(new m3u8parse.AttrList({method:'AES-128', uri:'"https://priv.example.com/key.php?r=52"', iv:'0x1e74'}));
      testIndex.keyForSeqNo(7797).should.eql(new m3u8parse.AttrList({method:'AES-128', uri:'"https://priv.example.com/key.php?r=53"', iv:'0x1e75'}));
    })
    it('should return null after method=NONE', function() {
      should.not.exist(testIndexAlt.keyForSeqNo(7795));
    })
  })

  describe('#byterangeForSeqNo()', function() {
    it('should return null for for out of bounds sequence numbers', function() {
      should.not.exist(testIndexSingle.keyForSeqNo(0));
      should.not.exist(testIndexSingle.keyForSeqNo("100"));
      should.not.exist(testIndexSingle.keyForSeqNo("10000"));
    })
    it('should return null for for indexes with no byterange information', function() {
      should.not.exist(testIndex.byterangeForSeqNo(7794));
    })
    it('should return correct values', function() {
      testIndexSingle.byterangeForSeqNo(300).should.eql({length:300000, offset:5000000});
      testIndexSingle.byterangeForSeqNo(301).should.eql({length:300000, offset:0});
      testIndexSingle.byterangeForSeqNo(302).should.eql({length:300000, offset:300000});
      testIndexSingle.byterangeForSeqNo(303).should.eql({length:300000, offset:600000});
    })
  })

  describe('#getSegment()', function() {
    it('should return segment data for valid sequence numbers', function() {
      testIndex.getSegment("7794").should.be.an.instanceof(m3u8parse.M3U8Segment);
      testIndex.getSegment(7797).should.be.an.instanceof(m3u8parse.M3U8Segment);
    })
    it('should return null for out of bounds sequence numbers', function() {
      should.not.exist(testIndex.getSegment());
      should.not.exist(testIndex.getSegment(-1));
      should.not.exist(testIndex.getSegment(7793));
      should.not.exist(testIndex.getSegment(7798));

      should.not.exist(variantIndex.getSegment(0));
    })
    it('should return computed independent segments attributes correctly', function() {
      testIndex.getSegment(7794, true).should.be.an.instanceof(m3u8parse.M3U8Segment);
      testIndex.getSegment(7794, true).program_time.should.eql(new Date('2013-10-29T11:34:13.000Z'));
      testIndex.getSegment(7795, true).program_time.should.eql(new Date('2013-10-29T11:34:15.833Z'));
      testIndex.getSegment(7796, true).program_time.should.eql(new Date('2013-10-29T11:34:30.833Z'));
      testIndex.getSegment(7797, true).program_time.should.eql(new Date('2013-10-29T11:34:44.000Z'));
      testIndex.getSegment(7794, true).key.should.eql(new m3u8parse.AttrList({method:'AES-128', uri:'"https://priv.example.com/key.php?r=52"', iv:'0x1e72'}));
      testIndex.getSegment(7795, true).key.should.eql(new m3u8parse.AttrList({method:'AES-128', uri:'"https://priv.example.com/key.php?r=52"', iv:'0x1e73'}));
      testIndex.getSegment(7796, true).key.should.eql(new m3u8parse.AttrList({method:'AES-128', uri:'"https://priv.example.com/key.php?r=52"', iv:'0x1e74'}));
      testIndex.getSegment(7797, true).key.should.eql(new m3u8parse.AttrList({method:'AES-128', uri:'"https://priv.example.com/key.php?r=53"', iv:'0x1e75'}));
      testIndexSingle.getSegment(302, true).byterange.should.eql({length:300000, offset:300000});
      should.not.exist(testIndex.getSegment(7794, true).map);
      should.not.exist(testIndex.getSegment(7797, true).map);
    })
  })

  describe('#toString()', function() {

    it('should output valid index files', function(done) {
      var r1 = new Readable();
      r1.push(testIndex.toString());
      r1.push(null);

      // test that output string parses correctly
      m3u8parse(r1, function(err, index) {
        should.not.exist(err);
        should.exist(index);
        testIndex.should.eql(index);

        var r2 = new Readable();
        r2.push(testIndexAlt.toString());
        r2.push(null);

        // test that output string parses correctly
        m3u8parse(r2, function(err, index) {
          should.not.exist(err);
          should.exist(index);
          testIndexAlt.should.eql(index);

          var r3 = new Readable();
          r3.push(testIndexSingle.toString());
          r3.push(null);

          // test that output string parses correctly
          m3u8parse(r3, function(err, index) {
            should.not.exist(err);
            should.exist(index);
            testIndexSingle.should.eql(index);
            done();
          });
        });
      });
    })

    it('should output valid variant files', function(done) {
      var r = new Readable();
      r.push(variantIndex.toString());
      r.push(null);

      // test that output string parses correctly
      m3u8parse(r, function(err, index) {
        should.not.exist(err);
        should.exist(index);
        variantIndex.should.eql(index);
        done();
      });
    })

    it('should handle vendor extensions', function() {
      var index = m3u8parse.M3U8Playlist();

      index.variant = true;
      index.vendor = {
        '#EXT-MY-TEST': 'yeah!'
      };
      index.toString().should.equal('#EXTM3U\n#EXT-MY-TEST:yeah!\n')
    })

  })

})
