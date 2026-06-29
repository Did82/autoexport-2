#!/usr/bin/env bun

import tailwind from 'bun-plugin-tailwind';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const outdir = path.resolve(process.cwd(), 'dist');

await rm(outdir, { recursive: true, force: true });

const startedAt = performance.now();
const result = await Bun.build({
    entrypoints: [path.resolve('server/index.ts')],
    outdir,
    root: process.cwd(),
    target: 'bun',
    minify: true,
    sourcemap: 'linked',
    naming: {
        entry: '[name].[ext]',
        chunk: '[name]-[hash].[ext]',
        asset: '[name]-[hash].[ext]',
    },
    plugins: [tailwind],
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
});

if (!result.success) {
    for (const log of result.logs) {
        console.error(log);
    }
    process.exit(1);
}

const elapsed = (performance.now() - startedAt).toFixed(0);
console.log(`Built ${result.outputs.length} artifacts in ${elapsed}ms`);
