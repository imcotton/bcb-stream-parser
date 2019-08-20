import * as R from 'ramda';

import { asyncReadable } from 'async-readable';
import { bufferPond } from "buffer-pond";

import { h2b, h2r, toASM, reverseID } from './helpers';

import { readHeader, readTransaction, parseCoinbase } from '../lib/parser';

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



describe('coinbase', () => {

    const sum = R.compose(
        R.sum,
        R.pluck('value') as (list: Array<{ value: number }>) => number[],
    );

    const samples = R.filter(R.propEq('coinbase', true));

    for (const { hex, description, raw } of samples(txFixtures.valid)) {

        test(description, async () => {

            const source = h2r(hex);
            const { read } = asyncReadable(source);

            const tx = await readTransaction(read)();
            const coinbase = parseCoinbase(tx);

            expect(coinbase).not.toBeUndefined();

            const value = sum(raw.outs);

            if (coinbase) {
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

