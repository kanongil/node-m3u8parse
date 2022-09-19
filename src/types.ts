/// <reference lib="dom" />

/* c8 ignore start */

const global = typeof globalThis !== 'undefined' ? globalThis : self;

export default global;
export const BigIntish = global.BigInt ?? Number;     // Fallback to Number when no BigInt
export const URL = global.URL;

/* c8 ignore stop */


export type PropsOf<T> = {
    // eslint-disable-next-line @typescript-eslint/ban-types
    [P in keyof T as T[P] extends Function ? never : P]: T[P]
};

// Same as Partial<PropsOf<T>>;

export type Proto<T> = {
    // eslint-disable-next-line @typescript-eslint/ban-types
    [P in keyof T as T[P] extends Function ? never : P]?: T[P]
};
