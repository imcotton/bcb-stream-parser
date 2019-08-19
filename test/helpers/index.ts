import { Readable } from 'stream';

import { script, address } from 'bitcoinjs-lib';

import * as R from 'ramda';

import { reverseBuffer } from '../../lib/utils';





export function h2b (hex: string) {
    return Buffer.from(hex, 'hex');
}



export function b2h (buffer: Buffer) {
    return buffer.toString('hex');
}


export function h2r (hex: string) {

    const readable = new Readable({
        read () {
        },
    });

    readable.push(h2b(hex));
    readable.push(null);

    return readable;

}



export const reverseID = R.memoizeWith(R.identity, R.compose(
    b2h,
    reverseBuffer,
    h2b,
)) as (hex: string) => string;



export const log = R.tap(console.log);



export const toASM = R.memoizeWith(R.identity,
    R.compose(
        R.ifElse(({ length }) => length > 0, script.toASM, R.always('')),
        h2b,
    ),
) as (hex: string) => string;



export const toAddress = R.memoizeWith(R.identity,
    R.compose(
        address.fromOutputScript,
        h2b,
    ),
) as (hex: string) => string;

