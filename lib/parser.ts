/// <reference lib="es2018.asynciterable" />

import { bond } from 'proxy-bind';

import { Read, toReadableStream, AsyncReadable } from 'async-readable';

import { PromiseType, Optional } from 'utility-types';

import {
    apply, complement, compose, identity, forEach,
    head, isEmpty, not, tap, thunkify, times,
} from 'ramda';

import {
    thunkLooping, mapIter, toHex, copy,
    blockHash, reverseBuffer,
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
        case 0xFF: return Number((await read(8)).readBigUInt64LE(0));
        default: return size;
        }

    };

}



export function readVerHex (read: Read) {

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

    const verStrThunk = readVerHex(read);

    return async function () {

        const head = await read(36);

        const txId = toHex(reverseBuffer(copy(head.slice(0, 32))));
        const vOut = head.readInt32LE(32);

        const script = await verStrThunk();
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

    const verStrThunk = readVerHex(read);

    return async function () {

        const value = '0x' + (await read(8)).readBigUInt64LE().toString(16);
        const script = await verStrThunk();

        return {
            value,
            script,
        };

    };

}



export function readWitness (read: Read) {

    const compactSizeThunk = readCompactSize(read);
    const verStrThunk = readVerHex(read);
    const loopStr = thunkLooping(async () => await verStrThunk()).array;

    return async function () {
        return await loopStr(await compactSizeThunk());
    };

}



export type Transaction = PT<RT<RT<typeof readTransaction>>>;

export function readTransaction (readOrigin: Read) {

    const acc = bufferCounter(readOrigin);
    const { read } = acc;

    const compactSizeThunk = readCompactSize(read);

    const loopInput = thunkLooping(readInput(read)).array;
    const loopOutput = thunkLooping(readOutput(read)).array;
    const loopWitness = thunkLooping(readWitness(read)).array;

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



export function bufferCounter (read: Read) {

    const chunks = [] as Buffer[];
    const marker = [] as number[];

    let flag = false;

    const notEmpty = complement(isEmpty);
    const mirror = tap(bond(chunks).push);
    const concatChunks = () => Buffer.concat(chunks);
    const patchChunksBy = forEach(((x) => (i: number) => chunks[i] = x)(Buffer.alloc(0)));
    const markChunksFromBack = (offset: number) => marker.push(chunks.length - 1 - offset);



    return Object.freeze({

        flag (on: boolean) {
            flag = on;
        },

        async read (size: number) {

            const chunk = mirror(await read(size));

            if (flag === true) {
                markChunksFromBack(0);
            }

            return chunk;

        },

        pop (n: number) {
            times(markChunksFromBack, n);
        },

        reset () {
            chunks.length = 0;
            marker.length = 0;
            flag = false;
        },

        count () {

            const total = concatChunks();
            const totalBytes = total.length;

            let general = total;
            let generalBytes = totalBytes;

            if (notEmpty(marker)) {
                patchChunksBy(marker);

                general = concatChunks();
                generalBytes = general.length;
            }

            const weight = generalBytes * 3 + totalBytes;
            const hash = blockHash(general);

            return {
                weight,
                hash,
                size: totalBytes,
            };

        },

    });

}



export function parseCoinbase (transaction: Transaction) {

    const { hash, inputs: [ input ], outputs: [ output ] } = transaction;

    const { txId, vOut, script } = input;

    if (not(/^0{64}$/.test(txId) && vOut === -1)) {
        return;
    }

    const scriptBuffer = Buffer.from(script, 'hex');

    const bytes = scriptBuffer.readUInt8(0);
    const height = bytes < 1 ? 0 : scriptBuffer.readUIntLE(1, bytes);

    return {
        type: 'COINBASE' as 'COINBASE',

        height,
        hash,
        script,
        output,
    };

}



export function readHeader (read: Read) {

    const pointer = (i: number) => (step: number) => (i += step, [ i - step, i ]);

    const compactSizeThunk = readCompactSize(read);

    return async function () {

        const chunk = await read(80);
        const { readUInt32LE, slice } = bond(chunk);

        const p = pointer(0);

        const bytesHex = compose(toHex, reverseBuffer, apply(slice), p);
        const uint32LE = thunkify(compose(readUInt32LE, head, p))(4);

        return {
            type: 'HEADER' as 'HEADER',

            version: uint32LE(),
            prev: bytesHex(32),
            root: bytesHex(32),
            time: uint32LE(),
            bits: uint32LE(),
            nonce: uint32LE(),

            hash: blockHash(chunk),

            txCount: await compactSizeThunk(),
        };

    };

}



export const reader = toReadableStream(parser);

export type Parser = RT<typeof parser> extends AII<infer U> ? U : never;

export async function* parser ({ read, off = () => {} }: Optional<AsyncReadable, 'off'>) {

    const header = await readHeader(read)();

    yield { ...header } as const;

    const { txCount } = header;

    const loopTx = thunkLooping(readTransaction(read)).generator;

    const indexed = mapIter(<T> (tx: T, i: number) => ({ i, tx }));

    for await (const { i, tx } of indexed(loopTx(txCount))) {

        if (i === 0) {
            const coinbase = parseCoinbase(tx);

            if (coinbase) {
                yield { ...coinbase } as const;
            }
        }

        yield { ...tx } as const;

    }

    off();

}

