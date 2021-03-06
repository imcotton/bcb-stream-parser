import { createHash } from 'crypto';

import * as R from 'ramda';

import { mirror } from 'proxy-bind';

import { Read } from 'async-readable';





export function loopArray <T> (thunk: () => Promise<T>) {

    return async function (size: number) {

        const list = [];

        while (size--) {
            list.push(await thunk());
        }

        return list;

    };

}



export function loopGenerator <T> (thunk: () => Promise<T>) {

    return async function* (size: number) {

        while (size--) {
            yield thunk();
        }

    };

}



export function mapIter <T, U> (mapper: (t: T, i: number) => U) {

    return async function* (source: AsyncIterable<T>) {
        let index = 0;

        for await (const item of source) {
            yield mapper(item, index++);
        }
    };

}



export function toHex (buffer: Buffer, prefix = '') {
    return prefix + buffer.toString('hex');
}



export function copy (buffer: Buffer) {
    const tmp = Buffer.allocUnsafe(buffer.length);
    buffer.copy(tmp);
    return tmp;
}



export function sha256 (content: Buffer) {
    return createHash('sha256').update(content).digest();
}



export function blockHash (content: Buffer) {
    return toHex(reverseBuffer(sha256(sha256(content))));
}



export function readBlockHeight (script: string) {

    const scriptBuffer = Buffer.from(script, 'hex');
    const bytes = scriptBuffer.readUInt8(0);

    return bytes < 1 ? 0 : scriptBuffer.readUIntLE(1, bytes);

}



export function reverseBuffer (buffer: Buffer) {
    return buffer.reverse() as Buffer;
}



export function bufferCounter (read: Read) {

    const [ chunks, { push } ] = mirror([] as Buffer[]);
    const marker = [] as number[];

    let flag = false;

    const notEmpty = R.complement(R.isEmpty);
    const tee = R.tap(push);
    const concatChunks = () => Buffer.concat(chunks);
    const patchChunksBy = R.forEach(((x) => (i: number) => chunks[i] = x)(Buffer.alloc(0)));
    const markChunksFromBack = (offset: number) => marker.push(chunks.length - 1 - offset);



    return {

        flag (on: boolean) {
            flag = on;
        },

        async read (size: number) {

            const chunk = tee(await read(size));

            if (flag === true) {
                markChunksFromBack(0);
            }

            return chunk;

        },

        pop (n: number) {
            R.times(markChunksFromBack, n);
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

    };

}

