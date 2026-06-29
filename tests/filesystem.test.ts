import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyFiles, verifyFiles } from '../server/libs/copy';
import { deleteDir } from '../server/utils/delete';
import { getDiskUsage } from '../server/utils/utils';
import {
    assertPathWithinRoot,
    validateManagedRoots,
} from '../server/utils/securityUtils';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'autoexport-test-'));
    temporaryDirectories.push(directory);
    return directory;
}

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) =>
            rm(directory, { recursive: true, force: true })
        )
    );
});

describe('managed path safety', () => {
    test('reads disk usage for a real directory', async () => {
        const root = await temporaryDirectory();
        const usage = await getDiskUsage(root);

        expect(usage.total).toBeGreaterThan(0);
        expect(usage.percentage).toBeGreaterThanOrEqual(0);
    });

    test('rejects nested roots and paths outside a root', async () => {
        const root = await temporaryDirectory();
        const src = join(root, 'src');
        const nestedDest = join(src, 'dest');
        await mkdir(nestedDest, { recursive: true });

        expect(() => validateManagedRoots(src, nestedDest)).toThrow('non-nested');
        expect(() => assertPathWithinRoot(src, root)).toThrow('managed root');
    });

    test('deletes only a real child directory', async () => {
        const root = await temporaryDirectory();
        const child = join(root, '20240101');
        await mkdir(child);
        await writeFile(join(child, 'file.txt'), 'data');

        await deleteDir(root, child);
        expect(() => assertPathWithinRoot(root, root)).toThrow();
    });

    test('rejects a symlink as a managed root', async () => {
        const root = await temporaryDirectory();
        const real = join(root, 'real');
        const link = join(root, 'link');
        const dest = join(root, 'dest');
        await mkdir(real);
        await mkdir(dest);
        await symlink(real, link);

        expect(() => validateManagedRoots(link, dest)).toThrow('Symbolic links');
    });
});

describe('rsync verification', () => {
    test('detects whether source changes are present at destination', async () => {
        if (!Bun.which('rsync')) return;

        const root = await temporaryDirectory();
        const src = join(root, 'src');
        const dest = join(root, 'dest');
        await mkdir(src);
        await mkdir(dest);
        await writeFile(join(src, 'sample.txt'), 'first');

        await copyFiles({ src, dest });
        expect((await verifyFiles({ src, dest })).synced).toBe(true);

        await writeFile(join(src, 'sample.txt'), 'changed content');
        expect((await verifyFiles({ src, dest })).synced).toBe(false);
    });
});
