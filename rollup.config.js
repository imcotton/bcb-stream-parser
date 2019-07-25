// @ts-check

// @ts-ignore
import pkg from './package.json';

import * as R from 'ramda';





const { OUT = './dist' } = process.env;

export const logs = R.tap(console.log);
export const path = R.compose(R.replace(/\/\/+/g, '/'), R.join('/'));
export const dist = R.compose(path, R.prepend(OUT), R.of, R.trim);
export const list = R.compose(R.filter(Boolean), R.split(/[,|;]|\s+/g), R.trim);

export const suffix = R.useWith(R.replace('.js'), [ R.concat('.'), R.identity ]);

export const extendsBuiltin = R.compose(list, R.concat(`
    | http | https | net | crypto | stream | buffer |
    | util | os | events | url | fs |
`));



export function construct (input = '', cjs = suffix('cjs', input), mjs = suffix('mjs', input)) {

    return {

        input: dist(input),

        external: extendsBuiltin(' ramda | proxy-bind | async-readable | buffer-pond '),

        output: [
            {
                file: dist(cjs),
                format: 'cjs',
                preferConst: true,
            },
            {
                file: dist(mjs),
                format: 'esm',
            },
        ],

    };

}



export default [

    construct('index.js', pkg.main, pkg.module),
    construct('parser.js', 'parser.js'),

];

