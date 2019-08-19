import * as R from 'ramda';

import { asyncReadable } from 'async-readable';
import { bufferPond } from "buffer-pond";

import { h2b, h2r, toASM, reverseID } from './helpers';

import { readHeader, readTransaction } from '../lib/parser';

import txFixtures from './fixtures/transaction.json';
import blockFixtures from './fixtures/block.json';





describe('readHeader', () => {

    for (const { id, hex } of R.take(5, blockFixtures.valid)) {

        test(`reading ${ R.take(20, id) }`, async () => {

            const { feed, read } = bufferPond();

            feed(h2b(R.take(80 * 2, hex)));

            const { hash } = await readHeader(read)(false);

            expect(hash).toEqual(id);

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

        test(description + id, async () => {

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

