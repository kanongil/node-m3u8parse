# M3U8Parse

Structural parsing of [Apple HTTP Live Streaming](http://tools.ietf.org/html/draft-pantos-http-live-streaming-13) `.m3u8` files.

This module is tested and is used in production systems.

[![Build Status](https://travis-ci.org/kanongil/node-m3u8parse.svg?branch=master)](https://travis-ci.org/kanongil/node-m3u8parse)
[![Coverage Status](https://coveralls.io/repos/kanongil/node-m3u8parse/badge.svg?branch=master&service=github)](https://coveralls.io/github/kanongil/node-m3u8parse?branch=master)

## Known Issues

 * Indexes with more than one `EXT-X-KEY` entry per segment are not supported.

## TODO

 * Validation option.
 * `String`/`Buffer` input.

# License
(BSD 2-Clause License)

Copyright (c) 2013-2016, Gil Pedersen &lt;gpdev@gpost.dk&gt;  
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met: 

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer. 
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution. 

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.