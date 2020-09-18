interface Token {
    toUpperCase(): string;
}

export type Resolution = {
    width: number;
    height: number;
};

export type Byterange = {
    offset?: number;
    length: number;
};

enum AttrType {
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

const tokenify = function (attr: string): Token {

    if (typeof attr !== 'string') {
        throw new TypeError('Attributes must be a "string"');
    }

    return attr.toLowerCase() as Token;
};

// AttrList's are handled without any implicit knowledge of key/type mapping

export class AttrList extends Map<Token, unknown> {

    static readonly Types = AttrType;

    constructor(attrs?: AttrList | string | { [key: string]: string } | Map<string,unknown> | Array<Array<string>>) {

        super();

        const set = (key: Token, value: unknown, format?: (val: unknown) => string) => {

            if (value !== null && value !== undefined) {
                super.set(key, format ? format(value) : value);
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

    get(attr: string): string | undefined;
    get(attr: string, type?: AttrType.BigInt | AttrType.HexInt): BigInt;
    get(attr: string, type?: AttrType.Int | AttrType.HexNo | AttrType.Float | AttrType.SignedFloat): number;
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    get(attr: string, type?: AttrType.Enum | AttrType.String): string | undefined;
    get(attr: string, type?: AttrType.Resolution): Resolution | undefined;
    get(attr: string, type?: AttrType.Byterange): Byterange | undefined;

    get(attr: string, type: AttrType = AttrType.Enum): unknown {

        return this._applyType(type, attr) as any;
    }

    set(attr: string, value: undefined | null): this;
    set(attr: string, value: BigInt | number, type?: AttrType.BigInt | AttrType.HexInt): this;
    set(attr: string, value: number, type?: AttrType.Int | AttrType.HexNo | AttrType.Float | AttrType.SignedFloat): this;
    set(attr: string, value: Resolution, type?: AttrType.Resolution): this;
    set(attr: string, value: Byterange, type?: AttrType.Byterange): this;
    set(attr: string, value: string | unknown, type?: AttrType.Enum | AttrType.String): this;

    set(attr: string, value: unknown, type: AttrType = AttrType.Enum): this {

        if (value === undefined || value === null) {
            this.delete(attr);
            return this;
        }

        this._applyType(type, attr, value);
        return this;
    }

    has(attr: string): boolean {

        return super.has(tokenify(attr));
    }

    delete(attr: string): boolean {

        return super.delete(tokenify(attr));
    }

    decimalInteger(attrName: string, value? : number | bigint): bigint {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            if (Buffer.isBuffer(value)) {
                if (value.length) {
                    super.set(name, BigInt(`0x${value.toString('hex')}`).toString(10));
                }
                else {
                    super.set(name, '0');
                }
            }
            else {
                super.set(name, BigInt(value).toString(10));
            }
        }

        const stringValue = super.get(name);
        const intValue = BigInt(stringValue);

        if (/^\s*0[^\d]/.test(stringValue as string)) {
            throw new SyntaxError('Representation is not decimal integer compatible');
        }

        return intValue;
    }

    hexadecimalInteger(attrName: string, value?: number | bigint): bigint {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            if (Buffer.isBuffer(value)) {
                if (value.length) {
                    const hexValue = value.toString('hex');
                    super.set(name, '0x' + (hexValue[0] === '0' ? hexValue.slice(1) : hexValue));
                }
                else {
                    super.set(name, '0x0');
                }
            }
            else {
                super.set(name, '0x' + BigInt(value).toString(16));
            }
        }

        const stringValue = super.get(name);
        const intValue = BigInt(stringValue);

        if (!/^\s*0x/.test(stringValue as string)) {
            throw new SyntaxError('Representation is not hexadecimal integer compatible');
        }

        return intValue;
    }

    decimalIntegerAsNumber(attrName: string, value?: number | bigint): number {

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

    hexadecimalIntegerAsNumber(attrName: string, value?: number | bigint): number {

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

    decimalFloatingPoint(attrName: string, value?: number | bigint): number {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, value!.toString());
        }

        return parseFloat(super.get(name) as string);
    }

    signedDecimalFloatingPoint(attrName: string, value?: number | bigint): number {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, value!.toString());
        }

        return parseFloat(super.get(name) as string);
    }

    quotedString(attrName: string, value? : unknown): string | undefined {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, `"${value}"`);
        }

        const val = super.get(name) as string;
        return val ? val.slice(1, -1) : undefined;
    }

    enumeratedString(attrName: string, value?: unknown): string | undefined {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, `${value}`);
        }

        return super.get(name) as string | undefined;
    }

    decimalResolution(attrName: string, value?: Resolution): Resolution | undefined {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            value = value! || {} as any;
            super.set(name, '' + Math.floor(value.width) + 'x' + Math.floor(value.height));
        }

        const res = /^(\d+)x(\d+)$/.exec(super.get(name) as string);
        if (res === null) {
            return undefined;
        }

        return { width: parseInt(res[1], 10), height: parseInt(res[2], 10) };
    }

    /* unofficial type */
    decimalByterange(attrName: string, value? : Byterange): Byterange | undefined {

        const name = tokenify(attrName);
        if (arguments.length > 1) {
            value = value! || {} as unknown;
            const base = `"${Math.floor(value.length || 0)}`;
            super.set(name, base + (value.offset === undefined ? '"' : `@${Math.floor(value.offset)}"`));
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

    private _applyType<K extends AttrType>(type: K, attr: string, ...args: any[]) {

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
