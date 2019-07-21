import { createHash } from 'crypto';





export function thunkLooping <T> (thunk: () => Promise<T>) {

    return Object.freeze({

        async array (size: number) {

            const list = [];

            while (size--) {
                list.push(await thunk());
            }

            return list;

        },

        async * generator (size: number) {

            while (size--) {
                yield thunk();
            }

        },

    });

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



export function reverseBuffer (buffer: Buffer) {
    return buffer.reverse();
}

