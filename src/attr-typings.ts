import { AttrType as T } from './attrlist.js';

// Updated for draft-pantos-hls-rfc8216bis-12

// Shared

export type Start = {
    'time-offset': T.SignedFloat;
    precise?: T.Enum;
};

export type Define = {
    name?: T.String;
    value?: T.String;
    import?: T.String;
};

// Media

export type PartInf = {
    'part-target': T.Float;
};

export type ServerControl = {
    'can-skip-until'?: T.Float;
    'can-skip-dateranges'?: T.Float;
    'hold-back'?: T.Float;
    'part-hold-back'?: T.Float;
    'can-block-reload'?: T.Enum;
};

// Media Segment

export type Key = {
    method: T.Enum;
    uri?: T.String;
    iv?: T.HexInt;
    keyformat?: T.String;
    keyformatversions?: T.String;
};

export type Map = {
    uri: T.String;
    byterange?: T.Byterange | T.Enum;
};

export type Part = {
    uri: T.String;
    duration: T.Float;
    independent?: T.Enum;
    byterange?: T.Byterange | T.Enum;
    gap?: T.Enum;
};

export type Daterange = {
    id: T.String;
    class?: T.String;
    'start-date': T.String;
    cue?: T.String;               // TODO: support enumerated-string-list
    'end-date'?: T.String;
    duration?: T.Float;
    'planned-duration'?: T.Float;
    // 'x-<client-attribute>'     // FIXME: unsupported
    'scte35-cmd'?: T.HexInt | T.HexNo;
    'scte-in'?: T.HexInt | T.HexNo;
    'scte-out'?: T.HexInt | T.HexNo;
    'end-on-next'?: T.Enum;
};

export type Skip = {
    'skipped-segments': T.BigInt | T.Int;
    'recently-removed-dateranges'?: T.String;
};

export type PreloadHint = {
    type: T.Enum;
    uri: T.String;
    'byterange-start'?: T.BigInt | T.Int;
    'byterange-length'?: T.BigInt | T.Int;
};

export type RenditionReport = {
    uri: T.String;
    'last-msn': T.BigInt | T.Int;
    'last-part': T.BigInt | T.Int;
};

// Multivariant / Main

export type Media = {
    type: T.Enum;
    uri?: T.String;
    'group-id': T.String;
    language?: T.String;
    'assoc-language'?: T.String;
    name: T.String;
    'stable-rendition-id'?: T.String;
    default?: T.Enum;
    autoselect?: T.Enum;
    forced?: T.Enum;
    'instream-id'?: T.String;
    characteristics?: T.String;
    channels?: T.String;
};

export type StreamInf = {
    bandwidth: T.Int | T.BigInt;
    'average-bandwidth'?: T.Int | T.BigInt;
    score?: T.Float;
    codecs?: T.String;
    'supplemental-codecs'?: T.String;
    resolution?: T.Resolution;
    'frame-rate'?: T.Float;
    'hdcp-level'?: T.Enum;
    'alloved-cpc'?: T.String;
    'video-range'?: T.Enum;
    'stable-variant-id'?: T.String;
    audio?: T.String;
    video?: T.String;
    subtitles?: T.String;
    'closed-captions'?: T.String | T.Enum;
    'pathway-id'?: T.String;
};

export type IFrameStreamInf = Omit<StreamInf, 'frame-rate' | 'audio' | 'subtitles' | 'closed-captions'> & {
    uri: T.String;
};

export type SessionData = {
    'data-id': T.String;
    value?: T.String;
    uri?: T.String;
    language?: T.String;
};

export type SessionKey = Key;

export type ContentSteering = {
    'server-uri': T.String;
    'pathway-id'?: T.String;
};
