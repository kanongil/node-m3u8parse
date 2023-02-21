import { expect } from '@hapi/code';
import Lab from '@hapi/lab';

import { AttrList } from '../lib/attrlist.js';


// Test shortcuts

export const lab = Lab.script();
const { before, describe, it } = lab;


describe('AttrList', () => {

    describe('constructor()', () => {

        it('supports empty arguments', () => {

            const empty = new AttrList('');
            expect(new AttrList()).to.equal(empty);
            expect(new AttrList({})).to.equal(empty);
            expect(new AttrList(undefined)).to.equal(empty);
        });

        it('supports Map argument', () => {

            const map = new Map([['value', '42']]);
            const list = new AttrList(map);
            expect(list.decimalIntegerAsNumber('VALUE')).to.equal(42);
            expect(list.size).to.equal(1);
        });

        it('supports mappable array argument', () => {

            const list = new AttrList([['value', '42'], ['null', null], ['UNDEFINED'], ['EMPTY', '']] as any);
            expect(list.decimalIntegerAsNumber('VALUE')).to.equal(42);
            expect(list.enumeratedString('empty')).to.equal('');
            expect(list.size).to.equal(2);
        });

        it('supports object argument', () => {

            const obj = { value: '42', null: null, UNDEFINED: undefined, EMPTY: '' };
            const list = new AttrList(obj as any);
            expect(list.decimalIntegerAsNumber('VALUE')).to.equal(42);
            expect(list.enumeratedString('empty')).to.equal('');
            expect(list.size).to.equal(2);
        });

        it('creates a copy', () => {

            const orig = new AttrList('A=B');
            const copy = new AttrList(orig);
            expect(copy).to.equal(orig);
        });

        it('does not copy null and undefined attrs', () => {

            // TODO
        });
    });

    it('toString() has valid output', () => {

        const list = new AttrList('INT=42,HEX=0x42,FLOAT=0.42,STRING="hi",ENUM=OK,RES=4x2');
        expect(list.toString()).to.equal('INT=42,HEX=0x42,FLOAT=0.42,STRING="hi",ENUM=OK,RES=4x2');
        list.decimalIntegerAsNumber('extra', 123);
        expect(list.toString()).to.equal('INT=42,HEX=0x42,FLOAT=0.42,STRING="hi",ENUM=OK,RES=4x2,EXTRA=123');
        list!.set('extra', null);
        expect(list.toString()).to.equal('INT=42,HEX=0x42,FLOAT=0.42,STRING="hi",ENUM=OK,RES=4x2');
    });


    describe('iterator', () => {

        it('works', () => {

            const attrs = new AttrList({ a: 'ok' });
            for (const [entry, value] of attrs) {
                new AttrList().set(entry, value.toUpperCase());
            }
        });
    });

    describe('method', () => {

        const types: [any, any][] = [
            ['bigint', BigInt(42)],
            ['hexint', BigInt(66)],
            ['int', 42],
            ['hexno', 66],
            ['enum', 'OK'],
            ['string', 'hi'],
            ['float', 0.42],
            ['signed-float', -0.42],
            ['resolution', { width: 4, height: 2 }],
            ['byterange', { offset: 10, length: 20 }]
        ];

        type Context = { list?: AttrList };
        type TestArg = Lab.script.Flags & { context: Context };

        before(({ context }: TestArg) => {

            context.list = new AttrList('BIGINT=42,HEXINT=0x42,INT=42,HEXNO=0x42,FLOAT=0.42,SIGNED-FLOAT=-0.42,STRING="hi",ENUM=OK,RESOLUTION=4x2,BYTERANGE="20@10"');
        });

        describe('#get()', () => {

            it('handles all known types', ({ context: { list } }: TestArg) => {

                for (const [type, value] of types) {
                    expect(list!.get(type, type)).to.equal(value);
                }
            });

            it('returns "undefined" when attr is not present', () => {

                const list = new AttrList();
                for (const [type] of types) {
                    expect(list!.get(type, type)).to.be.undefined();
                }
            });

            it('fails on unknown types', ({ context: { list } }: TestArg) => {

                expect(() => list!.get('int', 'b' as any)).to.throw('Invalid type: b');
            });

            it('fails on non-string attributes', ({ context: { list } }: TestArg) => {

                expect(() => list!.get(undefined as any)).to.throw('Attributes must be a "string"');
                expect(() => list!.get({} as any)).to.throw('Attributes must be a "string"');
                expect(() => list!.get(Symbol() as any)).to.throw('Attributes must be a "string"');
            });
        });

        describe('#set()', () => {

            it('handles all known types', ({ context: { list } }: TestArg) => {

                const attrs = new AttrList();
                for (const [type, value] of types) {
                    attrs.set(type, value, type);
                }

                expect(attrs).to.equal(list!);
            });

            it('fails on unknown types', ({ context: { list } }: TestArg) => {

                expect(() => list!.set('int', 42, 'b' as any)).to.throw('Invalid type: b');
            });

            it('handles falsy types', () => {

                const attrs = new AttrList();

                attrs.set('a', '');
                expect(attrs.get('a')).to.equal('');

                attrs.set('a', 0);
                expect(attrs.get('a')).to.equal('0');

                attrs.set('a', -0);
                expect(attrs.get('a')).to.equal('0');

                attrs.set('a', BigInt(0));
                expect(attrs.get('a')).to.equal('0');

                attrs.set('a', false);
                expect(attrs.get('a')).to.equal('false');

                attrs.set('a', Number.NaN);
                expect(attrs.get('a')).to.equal('NaN');
            });

            it('deletes attr when null or undefined', ({ context: { list } }: TestArg) => {

                expect(list!.has('string')).to.be.true();
                list!.set('string', null);
                expect(list!.has('string')).to.be.false();

                expect(list!.has('enum')).to.be.true();
                list!.set('enum', undefined);
                expect(list!.has('enum')).to.be.false();
            });

            it('fails on non-string attributes', () => {

                expect(() => new AttrList().set(undefined as any, 'a')).to.throw('Attributes must be a "string"');
                expect(() => new AttrList().set({} as any, 'a')).to.throw('Attributes must be a "string"');
                expect(() => new AttrList().set(Symbol() as any, 'a')).to.throw('Attributes must be a "string"');
            });
        });

        describe('#has()', () => {

            it('returns whether entry exists', () => {

                const attrs = new AttrList('A=B');

                expect(attrs.has('a')).to.be.true();
                expect(attrs.has('A')).to.be.true();
                expect(attrs.has('b')).to.be.false();
            });

            it('fails on non-string attributes', () => {

                expect(() => new AttrList('A=B').has(undefined as any)).to.throw('Attributes must be a "string"');
                expect(() => new AttrList('A=B').has({} as any)).to.throw('Attributes must be a "string"');
                expect(() => new AttrList('A=B').has(Symbol() as any)).to.throw('Attributes must be a "string"');
            });
        });

        describe('#delete()', () => {

            it('removes the entry if it exists', () => {

                let attrs = new AttrList('A=B');
                expect(attrs.delete('a')).to.be.true();
                expect(attrs.size).to.equal(0);

                attrs = new AttrList('A=B');
                expect(attrs.delete('A')).to.be.true();
                expect(attrs.size).to.equal(0);

                attrs = new AttrList('A=B');
                expect(attrs.delete('B')).to.be.false();
                expect(attrs.size).to.equal(1);
            });

            it('fails on non-string attributes', () => {

                expect(() => new AttrList('A=B').delete(undefined as any)).to.throw('Attributes must be a "string"');
                expect(() => new AttrList('A=B').delete({} as any)).to.throw('Attributes must be a "string"');
                expect(() => new AttrList('A=B').delete(Symbol() as any)).to.throw('Attributes must be a "string"');
            });
        });
    });

    describe('parsing', () => {

        it('parses valid decimalInteger attribute', () => {

            expect(new AttrList('INT=42').decimalIntegerAsNumber('INT')).to.equal(42);
            expect(new AttrList('INT=0').decimalIntegerAsNumber('INT')).to.equal(0);
        });

        it('parses valid hexadecimalInteger attribute', () => {

            expect(new AttrList('HEX=0x42').hexadecimalIntegerAsNumber('HEX')).to.equal(0x42);
            expect(new AttrList('HEX=0x0').hexadecimalIntegerAsNumber('HEX')).to.equal(0);
        });

        it('parses valid decimalFloatingPoint attribute', () => {

            expect(new AttrList('FLOAT=42.0').decimalFloatingPoint('FLOAT')).to.equal(42.0);
            expect(new AttrList('FLOAT=0.42').decimalFloatingPoint('FLOAT')).to.equal(0.42);
            expect(new AttrList('FLOAT=0').decimalFloatingPoint('FLOAT')).to.equal(0);
        });

        it('parses valid signedDecimalFloatingPoint attribute', () => {

            expect(new AttrList('FLOAT=42.0').signedDecimalFloatingPoint('FLOAT')).to.equal(42.0);
            expect(new AttrList('FLOAT=-42.0').signedDecimalFloatingPoint('FLOAT')).to.equal(-42.0);
            expect(new AttrList('FLOAT=0.42').signedDecimalFloatingPoint('FLOAT')).to.equal(0.42);
            expect(new AttrList('FLOAT=-0.42').signedDecimalFloatingPoint('FLOAT')).to.equal(-0.42);
            expect(new AttrList('FLOAT=0').signedDecimalFloatingPoint('FLOAT')).to.equal(0);
            expect(new AttrList('FLOAT=-0').signedDecimalFloatingPoint('FLOAT')).to.equal(-0);
        });

        it('parses valid quotedString attribute', () => {

            expect(new AttrList('STRING="hi"').quotedString('STRING')).to.equal('hi');
            expect(new AttrList('STRING=""').quotedString('STRING')).to.equal('');
        });

        it('parses exotic quotedString attribute', () => {

            const list = new AttrList('STRING="hi,ENUM=OK,RES=4x2"');
            expect(list.quotedString('STRING')).to.equal('hi,ENUM=OK,RES=4x2');
            expect(list.size).to.equal(1);
        });

        it('parses valid enumeratedString attribute', () => {

            expect(new AttrList('ENUM=OK').enumeratedString('ENUM')).to.equal('OK');
        });

        it('parses exotic enumeratedString attribute', () => {

            expect(new AttrList('ENUM=1').enumeratedString('ENUM')).to.equal('1');
            expect(new AttrList('ENUM=A=B').enumeratedString('ENUM')).to.equal('A=B');
            expect(new AttrList('ENUM=A=B=C').enumeratedString('ENUM')).to.equal('A=B=C');
            const list = new AttrList('ENUM1=A=B=C,ENUM2=42');
            expect(list.enumeratedString('ENUM1')).to.equal('A=B=C');
            expect(list.enumeratedString('ENUM2')).to.equal('42');
        });

        it('parses valid decimalResolution attribute', () => {

            expect(new AttrList('RES=400x200').decimalResolution('RES')).to.equal({ width: 400, height: 200 });
            expect(new AttrList('RES=0x0').decimalResolution('RES')).to.equal({ width: 0, height: 0 });
        });

        it('handles invalid decimalResolution attribute', () => {

            expect(new AttrList('RES=400x-200').decimalResolution('RES')).to.equal(undefined);
            expect(new AttrList('RES=400.5x200').decimalResolution('RES')).to.equal(undefined);
            expect(new AttrList('RES=400x200.5').decimalResolution('RES')).to.equal(undefined);
            expect(new AttrList('RES=400').decimalResolution('RES')).to.equal(undefined);
            expect(new AttrList('RES=400x').decimalResolution('RES')).to.equal(undefined);
            expect(new AttrList('RES=x200').decimalResolution('RES')).to.equal(undefined);
            expect(new AttrList('RES=x').decimalResolution('RES')).to.equal(undefined);
        });

        it('parses valid decimalByterange attribute', () => {

            expect(new AttrList('RANGE="400@0"').decimalByterange('RANGE')).to.equal({ offset: 0, length: 400 });
            expect(new AttrList('RANGE="0@42"').decimalByterange('RANGE')).to.equal({ offset: 42, length: 0 });
            expect(new AttrList('RANGE="100"').decimalByterange('RANGE')).to.equal({ offset: undefined, length: 100 });
        });

        it('parses unqouted decimalByterange attribute', () => {

            expect(new AttrList('RANGE=400@0').decimalByterange('RANGE')).to.equal({ offset: 0, length: 400 });
            expect(new AttrList('RANGE=0@42').decimalByterange('RANGE')).to.equal({ offset: 42, length: 0 });
            expect(new AttrList('RANGE=100').decimalByterange('RANGE')).to.equal({ offset: undefined, length: 100 });
        });

        it('handles invalid decimalByterange attribute', () => {

            expect(new AttrList('RANGE=').decimalByterange('RANGE')).to.equal(undefined);
            expect(new AttrList('RANGE=""').decimalByterange('RANGE')).to.equal(undefined);
            expect(new AttrList('RANGE="50.5"').decimalByterange('RANGE')).to.equal(undefined);
            expect(new AttrList('RANGE="-50"').decimalByterange('RANGE')).to.equal(undefined);
            expect(new AttrList('RANGE="50@"').decimalByterange('RANGE')).to.equal(undefined);
            expect(new AttrList('RANGE="50@-10"').decimalByterange('RANGE')).to.equal(undefined);
            expect(new AttrList('RANGE="@"').decimalByterange('RANGE')).to.equal(undefined);
            expect(new AttrList('RANGE="@0"').decimalByterange('RANGE')).to.equal(undefined);
        });

        it('parses multiple attributes', () => {

            const list = new AttrList('INT=42,HEX=0x42,FLOAT=0.42,STRING="hi",ENUM=OK,RES=4x2');
            expect(list.decimalIntegerAsNumber('INT')).to.equal(42);
            expect(list.hexadecimalIntegerAsNumber('HEX')).to.equal(0x42);
            expect(list.decimalFloatingPoint('FLOAT')).to.equal(0.42);
            expect(list.quotedString('STRING')).to.equal('hi');
            expect(list.enumeratedString('ENUM')).to.equal('OK');
            expect(list.decimalResolution('RES')).to.equal({ width: 4, height: 2 });
            expect(list.size).to.equal(6);
        });

        it('handles missing attributes', () => {

            const list = new AttrList();
            expect(() => list.decimalInteger('INT')).to.throw(TypeError);
            expect(() => list.hexadecimalInteger('HEX')).to.throw(TypeError);
            expect(isNaN(list.hexadecimalIntegerAsNumber('HEX')));
            expect(isNaN(list.decimalIntegerAsNumber('INT')));
            expect(isNaN(list.hexadecimalIntegerAsNumber('HEX')));
            expect(isNaN(list.decimalFloatingPoint('FLOAT')));
            expect(list.quotedString('STRING')).to.equal(undefined);
            expect(list.enumeratedString('ENUM')).to.equal(undefined);
            expect(list.decimalResolution('RES')).to.equal(undefined);
            expect(list.decimalByterange('RANGE')).to.equal(undefined);
            expect(list.size).to.equal(0);
        });

        it('parses dashed attribute names', () => {

            const list = new AttrList('INT-VALUE=42,H-E-X=0x42,-FLOAT=0.42,STRING-="hi",ENUM=OK');
            expect(list.decimalIntegerAsNumber('INT-VALUE')).to.equal(42);
            expect(list.hexadecimalIntegerAsNumber('H-E-X')).to.equal(0x42);
            expect(list.decimalFloatingPoint('-FLOAT')).to.equal(0.42);
            expect(list.quotedString('STRING-')).to.equal('hi');
            expect(list.enumeratedString('ENUM')).to.equal('OK');
            expect(list.size).to.equal(5);
        });

        it('handles decimalInteger conversions', () => {

            const list = new AttrList('INT1=1234567890123456789,INT2=123,INT3=0,HEX=0x123');
            expect(list.decimalInteger('INT1')).to.equal(BigInt('1234567890123456789'));
            expect(list.decimalInteger('INT2')).to.equal(BigInt(123));
            expect(list.decimalInteger('INT3')).to.equal(BigInt(0));

            expect(() => list.decimalInteger('HEX')).to.throw(SyntaxError);
        });

        it('handles hexadecimalInteger conversions', () => {

            const list = new AttrList('HEX1=0x0123456789abcdef0123456789abcdef,HEX2=0x123,HEX3=0x0,INT=123');
            expect(list.hexadecimalInteger('HEX1')).to.equal(BigInt('0x0123456789abcdef0123456789abcdef'));
            expect(list.hexadecimalInteger('HEX2')).to.equal(BigInt(0x123));
            expect(list.hexadecimalInteger('HEX3')).to.equal(BigInt(0));

            expect(() => list.hexadecimalInteger('INT')).to.throw(SyntaxError);
        });

        it('returns infinity on large number conversions', () => {

            const list = new AttrList('VAL=1234567890123456789,HEX=0x0123456789abcdef0123456789abcdef');
            expect(list.decimalIntegerAsNumber('VAL')).to.equal(Infinity);
            expect(list.hexadecimalIntegerAsNumber('HEX')).to.equal(Infinity);
        });
    });

    describe('encoding', () => {

        const encode = function (method: keyof AttrList, value: any) {

            const list = new AttrList();
            (list as any)[method]('VALUE', value);
            return list.get('value', AttrList.Types.Enum);
        };

        it('encodes valid decimalInteger attribute', () => {

            expect(encode('decimalIntegerAsNumber', 42)).to.equal('42');
            expect(encode('decimalIntegerAsNumber', 0)).to.equal('0');
        });

        it('encodes valid hexadecimalInteger attribute', () => {

            expect(encode('hexadecimalIntegerAsNumber', 0x42)).to.equal('0x42');
            expect(encode('hexadecimalIntegerAsNumber', 0x0)).to.equal('0x0');
        });

        it('encodes valid decimalFloatingPoint attribute', () => {

            expect(encode('decimalFloatingPoint', 42.5)).to.equal('42.5');
            expect(encode('decimalFloatingPoint', 0.42)).to.equal('0.42');
            expect(encode('decimalFloatingPoint', 0)).to.equal('0');
        });

        it('encodes valid signedDecimalFloatingPoint attribute', () => {

            expect(encode('signedDecimalFloatingPoint', 42.5)).to.equal('42.5');
            expect(encode('signedDecimalFloatingPoint', 0.42)).to.equal('0.42');
            expect(encode('signedDecimalFloatingPoint', -0.42)).to.equal('-0.42');
            expect(encode('signedDecimalFloatingPoint', 0)).to.equal('0');
            expect(encode('signedDecimalFloatingPoint', -0)).to.equal('0');
        });

        it('encodes valid quotedString attribute', () => {

            expect(encode('quotedString', 'hi')).to.equal('"hi"');
            expect(encode('quotedString', '')).to.equal('""');
        });

        it('encodes exotic quotedString attribute', () => {

            expect(encode('quotedString', 'hi,ENUM=OK,RES=4x2')).to.equal('"hi,ENUM=OK,RES=4x2"');
        });

        it('encodes valid enumeratedString attribute', () => {

            expect(encode('enumeratedString', 'OK')).to.equal('OK');
        });

        it('encodes exotic enumeratedString attribute', () => {

            expect(encode('enumeratedString', '1')).to.equal('1');
            expect(encode('enumeratedString', 'A=B')).to.equal('A=B');
            expect(encode('enumeratedString', 'A=B=C')).to.equal('A=B=C');
        });

        it('encodes valid decimalResolution attribute', () => {

            expect(encode('decimalResolution', { width: 400, height: 200 })).to.equal('400x200');
            expect(encode('decimalResolution', { width: 0, height: 0 })).to.equal('0x0');
        });

        it('handles invalid decimalResolution attribute', () => {

            expect(encode('decimalResolution', {})).to.equal('NaNxNaN');
            expect(encode('decimalResolution', undefined)).to.equal('NaNxNaN');
        });

        it('encodes valid decimalByterange attribute', () => {

            expect(encode('decimalByterange', { offset: 400, length: 200 })).to.equal('"200@400"');
            expect(encode('decimalByterange', { length: 200 })).to.equal('"200"');
            expect(encode('decimalByterange', {})).to.equal('"0"');
            expect(encode('decimalByterange', undefined)).to.equal('"0"');
        });

        it('handles decimalInteger conversions', () => {

            expect(encode('decimalInteger', BigInt('1234567890123456789'))).to.equal('1234567890123456789');
            expect(encode('decimalInteger', 123)).to.equal('123');
            expect(encode('decimalInteger', 0)).to.equal('0');
        });

        it('handles hexadecimalInteger conversions', () => {

            expect(encode('hexadecimalInteger', BigInt('0x123456789abcdef0123456789abcdef'))).to.equal('0x123456789abcdef0123456789abcdef');
            expect(encode('hexadecimalInteger', 0x123)).to.equal('0x123');
            expect(encode('hexadecimalInteger', 0)).to.equal('0x0');
        });
    });
});
