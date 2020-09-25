/// <reference lib="es2018.asynciterable" />

import BN from 'bn.js';

import { bond, mirror } from 'proxy-bind';

import { toTransform } from 'buffer-pond';
import { Read, toReadableStream, AsyncReadable } from 'async-readable';

import { PromiseType } from 'utility-types';

import { apply, compose, identity, head, not, thunkify, o, concat } from 'ramda';

import {
    mapIter, toHex, copy, blockHash, reverseBuffer, bufferCounter,
    loopGenerator, loopArray, readBlockHeight,
} from './utils';





type AII <T> = AsyncIterableIterator<T>;
type PT <T extends Promise<any>> = PromiseType<T>;
type RT <T extends (...args: any) => any> = ReturnType<T>;



export function readCompactSize (read: Read) {

    return async function () {

        const size = (await read(1)).readUInt8(0);

        switch (size) {
        case 0xFD: return (await read(2)).readUInt16LE(0);
        case 0xFE: return (await read(4)).readUInt32LE(0);
        case 0xFF: return new BN(await read(8), 'le').toNumber();
        default: return size;
        }

    };

}



export function readVarHex (read: Read) {

    const compactSizeThunk = readCompactSize(read);

    return async function () {

        const len = await compactSizeThunk();

        if (len < 1) {
            return '';
        }

        return toHex(await read(len));

    };

}



export function readInput (read: Read) {

    const varStrThunk = readVarHex(read);

    return async function () {

        const head = await read(36);

        const txId = toHex(reverseBuffer(copy(head.subarray(0, 32) as Buffer)));
        const vOut = head.readInt32LE(32);

        const script = await varStrThunk();
        const sequence = toHex(await read(4), '0x');

        return {
            txId,
            vOut,
            sequence,
            script,
        };

    };

}



export function readOutput (read: Read) {

    const varStrThunk = readVarHex(read);

    return async function () {

        const value = concat('0x', new BN(await read(8), 'le').toString(16));
        const script = await varStrThunk();

        return {
            value,
            script,
        };

    };

}



export function readWitness (read: Read) {

    const compactSizeThunk = readCompactSize(read);
    const loopStr = loopArray(readVarHex(read));

    return async function () {
        return loopStr(await compactSizeThunk());
    };

}



export type Transaction = PT<RT<RT<typeof readTransaction>>>;

export function readTransaction (readOrigin: Read) {

    const [ acc, { read } ] = mirror(bufferCounter(readOrigin));

    const compactSizeThunk = readCompactSize(read);

    const loopInput = loopArray(readInput(read));
    const loopOutput = loopArray(readOutput(read));
    const loopWitness = loopArray(readWitness(read));

    return async function () {

        const version = (await read(4)).readUInt32LE(0);

        let hasWitness = false;
        let inputLen = await compactSizeThunk();

        if (inputLen === 0x00) {  // witness marker
            const flag = (await read(1)).readUInt8(0);

            if (flag === 0x01) {  // witness flag
                acc.pop(2);
                hasWitness = true;
                inputLen = await compactSizeThunk();
            }
        }

        const { map: mapInputs } = bond(await loopInput(inputLen));

        const outputs = await loopOutput(await compactSizeThunk());

        let inputsWithWitness;

        if (hasWitness === true) {
            acc.flag(true);

            const by = (
                (list) => (i: number) => list[i]
            )(await loopWitness(inputLen));

            inputsWithWitness = mapInputs(
                (base, index) => ({ ...base, witness: by(index) }),
            );

            acc.flag(false);
        }

        const lockTime = toHex(await read(4), '0x');

        const base = {
            type: 'TX' as 'TX',

            version,
            outputs,
            lockTime,

            ...acc.count(),
        };

        acc.reset();

        if (hasWitness === true && inputsWithWitness !== undefined) {

            return {
                ...base,

                hasWitness: true as true,
                inputs: inputsWithWitness,
            };

        } else {

            return {
                ...base,

                hasWitness: false as false,
                inputs: mapInputs(identity),
            };

        }

    };

}



export function parseCoinbase (transaction: Transaction) {

    const { hash, inputs: [ input ], outputs } = transaction;

    const { txId, vOut, script } = input;

    if (not(/^0{64}$/.test(txId) && vOut === -1)) {
        return;
    }

    const height = readBlockHeight(script);

    const value = concat('0x', outputs
        .map(({ value }) => new BN(value.substr(2), 16))
        .reduce((a, b) => a.iadd(b))
        .toString(16)
    );

    return {
        type: 'COINBASE' as 'COINBASE',

        height,
        value,
        hash,
        script,
    };

}



export function readHeader (read: Read) {

    const pointer = (i: number) => (step: number) => (i += step, [ i - step, i ]);

    const compactSizeThunk = readCompactSize(read);

    return async function (readTxCount: boolean) {

        const chunk = await read(80);
        const { readUInt32LE, subarray } = bond(chunk);

        const hash = blockHash(chunk);

        const p = pointer(0);

        const bytesHex = compose(
            toHex,
            reverseBuffer,
            apply(subarray as typeof chunk.slice),
            p,
        );
        const uint32LE = thunkify(compose(readUInt32LE, head, p))(4);

        return {
            type: 'HEADER' as 'HEADER',

            version: uint32LE(),
            prev: bytesHex(32),
            root: bytesHex(32),
            time: uint32LE(),
            bits: uint32LE(),
            nonce: uint32LE(),

            hash,
            txCount: readTxCount ? await compactSizeThunk() : 0,
        };

    };

}



export const transformer = toTransform(parser);
export const reader = toReadableStream(parser);

export type Parser = RT<typeof parser> extends AII<infer U> ? U : never;

export async function* parser ({ read }: AsyncReadable) {

    const header = await readHeader(read)(true);

    yield { ...header } as const;

    const { txCount } = header;

    const loop = o(
        mapIter(<T> (tx: T, i: number) => ({ i, tx })),
        loopGenerator(readTransaction(read)),
    );

    for await (const { i, tx } of loop(txCount)) {

        if (i === 0) {
            const coinbase = parseCoinbase(tx);

            if (coinbase) {
                yield { ...coinbase } as const;
            }
        }

        yield { ...tx } as const;

    }

}

