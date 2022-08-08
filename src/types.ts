/// <reference lib="dom" />

/* c8 ignore start */

const global = typeof globalThis !== 'undefined' ? globalThis : self;

export default global;
export const BigIntish = global.BigInt ?? Number;     // Fallback to Number when no BigInt
export const URL = global.URL;

/* c8 ignore stop */
