import * as R from 'ramda';

import { mapIter, toHex, copy, sha256, blockHash, reverseBuffer, loopArray, loopGenerator } from '../lib/utils';

import { h2b } from './helpers';

import blockFixtures from './fixtures/block.json';





describe('thunkLooping', () => {

    const thunk = R.always(Promise.resolve(42));

    test('array', async () => {

        const list = await loopArray(thunk)(3);

        expect(list).toStrictEqual(R.repeat(42, 3));

    });

    test('generator', async () => {

        const spy = jest.fn();

        const list = loopGenerator(thunk)(3);

        for await (const item of list) {
            spy(item);
            expect(item).toBe(42);
        }

        expect(spy).toHaveBeenCalledTimes(3);

    });

});



describe('mapIter', () => {

    test('maps over index', async () => {

        const spy = jest.fn();

        const addIndex = mapIter(<T> (item: T, index: number) => ({ item, index }));
        const gen = async function* <T> (list: T[]) { yield* list; };

        for await (const { item, index } of addIndex(gen([ 'a', 'b', 'c' ]))) {
            spy(item, index);
        }

        expect(spy).toHaveBeenNthCalledWith(1, 'a', 0);
        expect(spy).toHaveBeenNthCalledWith(2, 'b', 1);
        expect(spy).toHaveBeenNthCalledWith(3, 'c', 2);

    });

});



describe('toHex', () => {

    const hex = '001122aabbcc';
    const buffer = Buffer.from(hex, 'hex');

    test('default prefix', () => {
        expect(toHex(buffer)).toBe(hex);
    });

    test('prefix with 0x', () => {
        expect(toHex(buffer, '0x')).toBe('0x'.concat(hex));
    });

});



describe('copy', () => {

    const buffer = Buffer.from('001122aabbcc', 'hex');

    test('coping', () => {

        const dup = copy(buffer);

        expect(dup).toEqual(buffer);
        expect(dup).not.toBe(buffer);

        dup[0] = 255;
        expect(dup).not.toEqual(buffer);

    });

});



describe('sha256', () => {

    const reverse = R.map(R.reverse) as unknown as <T extends unknown[]> (list: T[]) => T[];

    test.each(reverse([

        [ '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', 'hello' ],
        [ '486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7', 'world' ],

    ]))('hashing - %s', (text, hex) => {

        const hashed = sha256(Buffer.from(text)).toString('hex');
        const sample = h2b(hex).toString('hex');

        expect(hashed).toBe(sample);

    });

});



describe('blockHash', () => {

    for (const { id, hex } of R.take(5, blockFixtures.valid)) {

        test(`hashing ${ R.take(20, id) }`, () => {

            expect(blockHash(h2b(R.take(80 * 2, hex)))).toBe(id);

        });

    }

});



describe('reverseBuffer', () => {

    test('manually', () => {

        expect(reverseBuffer(h2b('11223344'))).toEqual(h2b('44332211'))
        expect(reverseBuffer(h2b('112233'))).toEqual(h2b('332211'))
        expect(reverseBuffer(h2b('1122'))).toEqual(h2b('2211'))

    });



    const samples = R.filter(({ hex }) => hex.length === 80 * 2, blockFixtures.valid);

    for (const { id, hash } of samples) {

        test(`reversing ${ R.take(20, id) }`, () => {

            expect(reverseBuffer(h2b(id))).toEqual(h2b(hash));

        });

    }

});

