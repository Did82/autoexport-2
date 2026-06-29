import { lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfig } from '../libs/config';
import { dbHelpers } from '../libs/db';
import { deleteDir } from '../utils/delete';
import {
    getDiskUsage,
    getInvalidDirectories,
    QUARANTINE_DIR_NAME,
} from '../utils/utils';
import { assertMountReady } from './mount.service';

type StorageTarget = 'src' | 'dest';

interface QuarantineMetadata {
    originalName: string;
    originalPath: string;
    quarantinedAt: string;
    target: StorageTarget;
}

function getRoot(target: StorageTarget): string {
    const config = getConfig();
    return target === 'src' ? config.src : config.dest;
}

async function getPercentage(root: string): Promise<number> {
    try {
        return (await getDiskUsage(root)).percentage;
    } catch {
        return 0;
    }
}

function addError(error: unknown, targetDir: string): void {
    dbHelpers.insertErrorLog({
        id: Bun.randomUUIDv7(),
        createdAt: new Date().toISOString(),
        errorMsg: error instanceof Error ? error.message : String(error),
        targetDir,
    });
}

export async function quarantineInvalidDirectories(
    target: StorageTarget
): Promise<void> {
    const root = getRoot(target);
    await assertMountReady(target);
    const quarantineRoot = join(root, QUARANTINE_DIR_NAME);
    await mkdir(quarantineRoot, { recursive: true, mode: 0o700 });

    for (const name of getInvalidDirectories(root)) {
        const originalPath = join(root, name);
        const entryPath = join(quarantineRoot, Bun.randomUUIDv7());
        const payloadPath = join(entryPath, 'payload');
        const metadata: QuarantineMetadata = {
            originalName: name,
            originalPath,
            quarantinedAt: new Date().toISOString(),
            target,
        };
        const startedAt = Date.now();

        try {
            await mkdir(entryPath, { mode: 0o700 });
            await writeFile(
                join(entryPath, 'metadata.json'),
                `${JSON.stringify(metadata, null, 2)}\n`,
                { mode: 0o600 }
            );
            await rename(originalPath, payloadPath);

            dbHelpers.insertDeleteLog({
                id: Bun.randomUUIDv7(),
                createdAt: new Date().toISOString(),
                deletedDir: originalPath,
                totalTime: Date.now() - startedAt,
                percentageAfterDelete: await getPercentage(root),
                action: 'quarantine_move',
                target,
                message: `Moved to ${entryPath}`,
            });
        } catch (error) {
            addError(error, originalPath);
        }
    }
}

export async function cleanupQuarantine(target: StorageTarget): Promise<void> {
    const config = getConfig();
    const root = getRoot(target);
    await assertMountReady(target, config);
    const quarantineRoot = join(root, QUARANTINE_DIR_NAME);

    let entries: string[];
    try {
        entries = await readdir(quarantineRoot);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
    }

    const retentionMs = config.quarantineDays * 24 * 60 * 60 * 1000;
    for (const entry of entries) {
        const entryPath = join(quarantineRoot, entry);
        const startedAt = Date.now();

        try {
            const stats = await lstat(entryPath);
            if (!stats.isDirectory() || stats.isSymbolicLink()) continue;

            const metadata = JSON.parse(
                await readFile(join(entryPath, 'metadata.json'), 'utf8')
            ) as QuarantineMetadata;
            const quarantinedAt = new Date(metadata.quarantinedAt).getTime();
            if (!Number.isFinite(quarantinedAt)) {
                throw new Error(`Invalid quarantine metadata: ${entryPath}`);
            }
            if (Date.now() - quarantinedAt < retentionMs) continue;

            await deleteDir(quarantineRoot, entryPath);
            dbHelpers.insertDeleteLog({
                id: Bun.randomUUIDv7(),
                createdAt: new Date().toISOString(),
                deletedDir: metadata.originalPath,
                totalTime: Date.now() - startedAt,
                percentageAfterDelete: await getPercentage(root),
                action: 'quarantine_delete',
                target,
                message: `Deleted after ${config.quarantineDays} days in quarantine`,
            });
        } catch (error) {
            addError(error, entryPath);
        }
    }
}
