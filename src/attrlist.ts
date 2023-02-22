type Enum<T extends string> = T | `${T}`;
type StringKeys<T> = Extract<keyof T, string>;

export type Resolution = {
    width: number;
    height: number;
};

export type Byterange = {
    offset?: number;
    length: number;
};

export enum AttrType {
    BigInt = 'bigint',
    HexInt = 'hexint',
    Int = 'int',
    HexNo = 'hexno',
    Enum = 'enum',
    String = 'string',
    Float = 'float',
    SignedFloat = 'signed-float',
    Resolution = 'resolution',
    Byterange = 'byterange'
}

type TypeMapping<T extends AttrType> =
    T extends Enum<AttrType.BigInt | AttrType.HexInt> ? bigint :
        T extends Enum<AttrType.Int | AttrType.HexNo | AttrType.Float | AttrType.SignedFloat> ? number :
            T extends Enum<AttrType.Enum | AttrType.String> ? string :
                T extends Enum<AttrType.Resolution> ? Resolution :
                    T extends Enum<AttrType.Byterange> ? Byterange :
                        never;

const tokenify = function <T extends string>(attr: T): T {

    if (typeof attr !== 'string') {
        throw new TypeError('Attributes must be a "string"');
    }

    return attr.toLowerCase() as T;
};

export type TAnyAttr = { [key: string]: AttrType };

// AttrList's are handled without any implicit knowledge of key/type mapping

// eslint-disable-next-line @typescript-eslint/ban-types
export class AttrList<E extends TAnyAttr = TAnyAttr> extends Map<StringKeys<E>, string> {

    static readonly Types = AttrType;

    constructor(attrs?: ImmutableAttrList<E> | string | { readonly [key in StringKeys<E>]?: string } | Map<string, unknown> | ReadonlyArray<ReadonlyArray<string>>);
    constructor(attrs?: AttrList | string | { [key: string]: string } | Map<string, unknown> | Array<Array<string>>) {

        super();

        const set = (key: string, value: unknown, format?: (val: unknown) => string) => {

            if (value !== null && value !== undefined) {
                super.set(key as any, format ? format(value) : <string>value);
            }
        };

        if (attrs instanceof AttrList) {
            for (const [key, value] of attrs) {
                set(key, value);
            }
        }
        else if (typeof attrs === 'string') {

            // TODO: handle newline escapes in quoted-string's

            const re = /(.+?)=((?:\".*?\")|.*?)(?:,|$)/g;
            let match;

            while ((match = re.exec(attrs)) !== null) {
                set(tokenify(match[1]), match[2]);
            }
        }
        else if (!(attrs instanceof Map) && !Array.isArray(attrs)) {
            for (const attr in attrs) {
                set(tokenify(attr), attrs[attr], (val) => `${val || ''}`);
            }
        }
        else {
            for (const [key, value] of attrs) {
                set(tokenify(key), value, (val) => `${val}`);
            }
        }
    }

    get(attr: StringKeys<E>): string | undefined;
    get<K extends StringKeys<E>, T extends E[K]>(attr: K, type: Enum<T>): TypeMapping<T> | undefined;
    get(attr: StringKeys<E>, type: string = AttrType.Enum): unknown | undefined {

        return this.has(attr) ? this._applyType(type as AttrType, attr) : undefined;
    }

    set(attr: StringKeys<E>, value: undefined | null): this;
    set<K extends StringKeys<E>, T extends AttrType>(attr: K, value: TypeMapping<T>, type?: Enum<E[K]>): this;
    set(attr: StringKeys<E>, value: unknown, type: Enum<AttrType> = AttrType.Enum): this {

        if (value === undefined || value === null) {
            this.delete(attr);
            return this;
        }

        this._applyType(type as AttrType, attr, value);
        return this;
    }

    has(attr: StringKeys<E>): boolean {

        return super.has(tokenify(attr));
    }

    delete(attr: StringKeys<E>): boolean {

        return super.delete(tokenify(attr));
    }

    decimalInteger(attrName: StringKeys<E>, value?: number | bigint): bigint {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, BigInt(value!).toString(10));
        }

        const stringValue = super.get(name) as string;
        const intValue = BigInt(stringValue);

        if (/^\s*0[^\d]/.test(stringValue as string)) {
            throw new SyntaxError('Representation is not decimal integer compatible');
        }

        return intValue;
    }

    hexadecimalInteger(attrName: StringKeys<E>, value?: number | bigint): bigint {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, '0x' + BigInt(value!).toString(16));
        }

        const stringValue = super.get(name) as string;
        const intValue = BigInt(stringValue!);

        if (!/^\s*0x/.test(stringValue as string)) {
            throw new SyntaxError('Representation is not hexadecimal integer compatible');
        }

        return intValue;
    }

    decimalIntegerAsNumber(attrName: StringKeys<E>, value?: number | bigint): number {

        if (arguments.length > 1) {
            this.decimalInteger(attrName, value);
        }

        const name = tokenify(attrName);
        const intValue = parseInt(super.get(name) as string, 10);
        if (intValue > Number.MAX_SAFE_INTEGER) {
            return Number.POSITIVE_INFINITY;
        }

        return intValue;
    }

    hexadecimalIntegerAsNumber(attrName: StringKeys<E>, value?: number | bigint): number {

        if (arguments.length > 1) {
            this.hexadecimalInteger(attrName, value);
        }

        const name = tokenify(attrName);
        const intValue = parseInt(super.get(name) as string, 16);
        if (intValue > Number.MAX_SAFE_INTEGER) {
            return Number.POSITIVE_INFINITY;
        }

        return intValue;
    }

    decimalFloatingPoint(attrName: StringKeys<E>, value?: number | bigint): number {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, value!.toString());
        }

        return parseFloat(super.get(name) as string);
    }

    signedDecimalFloatingPoint(attrName: StringKeys<E>, value?: number | bigint): number {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, value!.toString());
        }

        return parseFloat(super.get(name) as string);
    }

    quotedString(attrName: StringKeys<E>, value?: unknown): string | undefined {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, `"${value}"`);
        }

        const val = super.get(name) as string;
        return val ? val.slice(1, -1) : undefined;
    }

    enumeratedString(attrName: StringKeys<E>, value?: unknown): string | undefined {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, `${value}`);
        }

        return super.get(name) as string | undefined;
    }

    decimalResolution(attrName: StringKeys<E>, value?: Resolution): Resolution | undefined {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
            super.set(name, '' + Math.floor(value?.width!) + 'x' + Math.floor(value?.height!));
        }

        const res = /^(\d+)x(\d+)$/.exec(super.get(name) as string);
        if (res === null) {
            return undefined;
        }

        return { width: parseInt(res[1], 10), height: parseInt(res[2], 10) };
    }

    /* unofficial type */
    decimalByterange(attrName: StringKeys<E>, value?: Byterange): Byterange | undefined {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            const base = `"${Math.floor(value?.length ?? 0)}`;
            super.set(name, base + (value?.offset === undefined ? '"' : `@${Math.floor(value.offset)}"`));
        }

        const res = /^"?(\d+)(?:@(\d+))?"?$/.exec(super.get(name) as string);
        if (res === null) {
            return undefined;
        }

        return {
            offset: res[2] !== undefined ? parseInt(res[2], 10) : undefined,
            length: parseInt(res[1], 10)
        };
    }

    toString(): string {

        let res = '';

        for (const [key, value] of this) {
            const comma = (res.length !== 0) ? ',' : '';
            res += `${comma}${key.toUpperCase()}=${value}`;
        }

        return res;
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    toJSON(): object {

        const obj = Object.create(null);

        for (const [key, value] of this) {
            obj[key as string] = value;
        }

        return obj;
    }

    private _applyType<K extends AttrType>(type: K, attr: StringKeys<E>, ...args: any[]) {

        switch (type) {
            case AttrType.BigInt: return this.decimalInteger(attr, ...args);
            case AttrType.HexInt: return this.hexadecimalInteger(attr, ...args);
            case AttrType.Int: return this.decimalIntegerAsNumber(attr, ...args);
            case AttrType.HexNo: return this.hexadecimalIntegerAsNumber(attr, ...args);
            case AttrType.Enum: return this.enumeratedString(attr, ...args);
            case AttrType.String: return this.quotedString(attr, ...args);
            case AttrType.Float: return this.decimalFloatingPoint(attr, ...args);
            case AttrType.SignedFloat: return this.signedDecimalFloatingPoint(attr, ...args);
            case AttrType.Resolution: return this.decimalResolution(attr, ...args);
            case AttrType.Byterange: return this.decimalByterange(attr, ...args);
        }

        throw new TypeError('Invalid type: ' + type);
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ImmutableAttrList<T extends TAnyAttr = TAnyAttr> extends Omit<AttrList<T>, 'clear' | 'delete' | 'set'> {}
