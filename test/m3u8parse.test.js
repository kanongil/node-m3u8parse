var fs = require('fs'),
    path = require('path'),
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

  it('should parse an iframe variant file', function(done) {
  	var stream = fs.createReadStream(path.join(fixtureDir, 'variant_iframe.m3u8'));
    m3u8parse(stream, function(err, index) {
      should.not.exist(err);
      should.exist(index);
      index.variant.should.be.true;
      done();
    });
  })

})

describe('M3U8Playlist', function() {
  var testIndex = null;
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
    it('should return null for for out of bounds sequence numbers', function() {
      should.not.exist(testIndex.dateForSeqNo(0));
      should.not.exist(testIndex.dateForSeqNo("100"));
      should.not.exist(testIndex.dateForSeqNo(10000));
      should.not.exist(testIndex.dateForSeqNo("10000"));
    })
    it('should return null for for indexes with no date information', function() {
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
  })

})
