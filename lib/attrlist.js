'use strict';

/* globals BigInt */

const internals = {};


internals.tokenify = function (attr) {

    if (typeof attr !== 'string') {
        throw new TypeError('Attributes must be a "string"');
    }

    return attr.toLowerCase();
};


// AttrList's are handled without any implicit knowledge of key/type mapping

module.exports = class AttrList extends Map {

    constructor(attrs) {

        super();

        if (attrs instanceof AttrList) {
            for (const [key, value] of attrs) {
                super.set(key, value);
            }
        }
        else if (typeof attrs === 'string') {

            // TODO: handle newline escapes in quoted-string's

            const re = /(.+?)=((?:\".*?\")|.*?)(?:,|$)/g;
            let match;

            while ((match = re.exec(attrs)) !== null) {
                super.set(internals.tokenify(match[1]), match[2]);
            }
        }
        else if (!(attrs instanceof Map) && !Array.isArray(attrs)) {
            for (const attr in attrs) {
                const value = attrs[attr] || '';
                super.set(internals.tokenify(attr), value.toString());
            }
        }
        else {
            for (const [key, value] of attrs) {
                super.set(internals.tokenify(key), value);
            }
        }
    }

    get(attr, type = 'enum') {

        return this._applyType(type, attr);
    }

    set(attr, value, type = 'enum') {

        if (!value && value !== '') {
            this.delete(attr);
            return;
        }

        this._applyType(type, attr, value);
    }

    has(attr) {

        attr = internals.tokenify(attr);
        return super.has(attr);
    }

    delete(attr) {

        attr = internals.tokenify(attr);
        return super.delete(attr);
    }

    decimalInteger(attrName, value) {

        const name = internals.tokenify(attrName);
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

        if (/^\s*0[^\d]/.test(stringValue)) {
            throw new SyntaxError('Representation is not decimal integer compatible');
        }

        return intValue;
    }

    hexadecimalInteger(attrName, value) {

        const name = internals.tokenify(attrName);
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

        if (!/^\s*0x/.test(stringValue)) {
            throw new SyntaxError('Representation is not hexadecimal integer compatible');
        }

        return intValue;
    }

    decimalIntegerAsNumber(attrName, value) {

        if (arguments.length > 1) {
            this.decimalInteger(attrName, value);
        }

        const name = internals.tokenify(attrName);
        const intValue = parseInt(super.get(name), 10);
        if (intValue > Number.MAX_SAFE_INTEGER) {
            return Number.POSITIVE_INFINITY;
        }

        return intValue;
    }

    hexadecimalIntegerAsNumber(attrName, value) {

        if (arguments.length > 1) {
            this.hexadecimalInteger(attrName, value);
        }

        const name = internals.tokenify(attrName);
        const intValue = parseInt(super.get(name), 16);
        if (intValue > Number.MAX_SAFE_INTEGER) {
            return Number.POSITIVE_INFINITY;
        }

        return intValue;
    }

    decimalFloatingPoint(attrName, value) {

        const name = internals.tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, value.toString());
        }

        return parseFloat(super.get(name));
    }

    signedDecimalFloatingPoint(attrName, value) {

        const name = internals.tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, value.toString());
        }

        return parseFloat(super.get(name));
    }

    quotedString(attrName, value) {

        const name = internals.tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, `"${value}"`);
        }

        const val = super.get(name);
        return val ? val.slice(1, -1) : undefined;
    }

    enumeratedString(attrName, value) {

        const name = internals.tokenify(attrName);
        if (arguments.length > 1) {
            super.set(name, value.toString());
        }

        return super.get(name);
    }

    decimalResolution(attrName, value) {

        const name = internals.tokenify(attrName);
        if (arguments.length > 1) {
            value = value || {};
            super.set(name, '' + Math.floor(value.width) + 'x' + Math.floor(value.height));
        }

        const res = /^(\d+)x(\d+)$/.exec(super.get(name));
        if (res === null) {
            return undefined;
        }

        return { width: parseInt(res[1], 10), height: parseInt(res[2], 10) };
    }

    /* unofficial type */
    decimalByterange(attrName, value) {

        const name = internals.tokenify(attrName);
        if (arguments.length > 1) {
            value = value || {};
            const base = `${Math.floor(value.length || 0)}`;
            super.set(name, value.offset === undefined ? base : base + `@${Math.floor(value.offset)}`);
        }

        const res = /^(\d+)(?:@(\d+))?$/.exec(super.get(name));
        if (res === null) {
            return undefined;
        }

        return {
            offset: res[2] !== undefined ? parseInt(res[2], 10) : undefined,
            length: parseInt(res[1], 10)
        };
    }

    toString() {

        let res = '';

        for (const [key, value] of this) {
            const comma = (res.length !== 0) ? ',' : '';
            res += `${comma}${key.toUpperCase()}=${value}`;
        }

        return res;
    }

    toJSON() {

        const obj = Object.create(null);

        for (const [key, value] of this) {
            obj[key] = value;
        }

        return obj;
    }

    _applyType(type, ...args) {

        switch (type) {
            case 'bigint': return this.decimalInteger(...args);
            case 'hexint': return this.hexadecimalInteger(...args);
            case 'int': return this.decimalIntegerAsNumber(...args);
            case 'hexno': return this.hexadecimalIntegerAsNumber(...args);
            case 'enum': return this.enumeratedString(...args);
            case 'string': return this.quotedString(...args);
            case 'float': return this.decimalFloatingPoint(...args);
            case 'signed-float': return this.signedDecimalFloatingPoint(...args);
            case 'resolution': return this.decimalResolution(...args);
            case 'byterange': return this.decimalByterange(...args);
        }

        throw new TypeError('Invalid type: ' + type);
    }
};
