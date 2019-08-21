import * as R from 'ramda';

import { asyncReadable } from 'async-readable';
import { bufferPond } from "buffer-pond";

import { h2b, h2r, toASM, reverseID } from './helpers';

import { readHeader, readTransaction, parseCoinbase, reader, readCompactSize } from '../lib/parser';

import txFixtures from './fixtures/transaction.json';
import blockFixtures from './fixtures/block.json';





describe('readHeader', () => {

    for (const { id, hex } of blockFixtures.valid) {

        test(`reading ${ R.take(20, id) }`, async () => {

            const { feed, read } = bufferPond();

            const headHex = R.take(80 * 2 + 2, hex);

            feed(h2b(headHex));

            const { hash } = await readHeader(read)(headHex.length > 80 * 2);

            expect(hash).toEqual(id);

        });

    }

});



describe('readCompactSize', () => {

    const samples = [
        [ '01', 1 ],
        [ '7e', 126 ],
        [ 'fd0302', 515 ],
        [ 'fdfaff', 65530 ],
        [ 'fe90e8e703', 65530000 ],
        [ 'ffffffffffffff1f00', Number.MAX_SAFE_INTEGER ],
    ] as const;

    for (const [ hex, number ] of samples) {

        test(hex, async () => {

            const { feed, read } = bufferPond();

            feed(h2b(hex));

            const value = await readCompactSize(read)();

            expect(value).toEqual(number);

        });

    }

});



describe('coinbase', () => {

    const sum = R.compose(
        R.sum,
        R.pluck('value') as (list: Array<{ value: number }>) => number[],
    );

    for (const { hex, description, raw } of txFixtures.valid) {

        test(description, async () => {

            const source = h2r(hex);
            const { read } = asyncReadable(source);

            const tx = await readTransaction(read)();
            const coinbase = parseCoinbase(tx);

            if (coinbase) {
                const value = sum(raw.outs);
                expect(coinbase.value.substr(2)).toEqual(value.toString(16));
            }

        });

    }

});



describe('transaction', () => {

    const parseIOScript = R.evolve({
        inputs: R.map(R.evolve({ script: toASM, vOut: R.identity, txId: R.identity, witness: R.identity })),
        outputs: R.map(R.evolve({ script: toASM, value: R.identity })),
    });

    const samples = R.filter(R.propEq('coinbase', false));

    for (const { id, hex, whex, description, raw, weight } of samples(txFixtures.valid)) {

        test(description, async () => {

            const source = h2r(whex || hex);

            const { read } = asyncReadable(source);

            const result = parseIOScript(await readTransaction(read)());

            expect(result.hash).toEqual(id);
            expect(result.version).toEqual(raw.version);
            expect(result.weight).toEqual(weight);



            type Ins = { index: number, script: string, hash: string, witness?: string[] };

            // @ts-ignore
            raw.ins.forEach(({ index, script, hash, witness }: Ins, i: number) => {

                const input = result.inputs[i];

                expect(input.script).toEqual(script || '');
                expect(input.vOut).toEqual(index);
                expect(input.txId).toEqual(reverseID(hash));

                if (input.witness) {
                    expect(input.witness).toEqual(witness);
                }

            })



            type Outs = { value: number, script: string };

            raw.outs.forEach(({ value, script }: Outs, i: number) => {

                const output = result.outputs[i];

                expect(output.script).toEqual(script);
                expect(Number(output.value)).toEqual(value);

            })

        });

    }

});



describe('reader', () => {

    for (const { hex, description } of blockFixtures.valid) {

        test(description, async () => {

            const stream = reader(h2r(hex.padEnd(80 * 2 + 2, '0')));

            for await (const { hash } of stream) {
                expect(hash.length).toBe(64);
            }

        });

    }

});

