// @ts-check

// @ts-ignore
import pkg from './package.json';

import * as R from 'ramda';





const { OUT = './dist' } = process.env;

export const logs = R.tap(console.log);
export const path = R.compose(R.replace(/\/\/+/g, '/'), R.join('/'));
export const dist = R.compose(path, R.prepend(OUT), R.of, R.trim);
export const list = R.compose(R.filter(Boolean), R.split(/[,|;]|\s+/g), R.trim);

export const extendsBuiltin = R.compose(list, R.concat(`
    | http | https | net | crypto | stream | buffer |
    | util | os | events | url | fs |
`));



export default {

    input: dist('index.js'),

    external: extendsBuiltin(' ramda | proxy-bind | async-readable '),

    output: [
        {
            file: dist(pkg.main),
            format: 'cjs',
            preferConst: true,
        },
        {
            file: dist(pkg.module),
            format: 'esm',
        },
    ],

};

