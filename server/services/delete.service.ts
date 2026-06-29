import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getConfig } from '../libs/config';
import { verifyFiles } from '../libs/copy';
import { dbHelpers } from '../libs/db';
import { deleteDir } from '../utils/delete';
import {
    getDatedDirectories,
    getDateNDaysAgo,
    getDiskUsage,
} from '../utils/utils';
import { copyDirectory } from './copy.service';

type StorageTarget = 'src' | 'dest';

interface SpaceControlDependencies {
    getUsage?: typeof getDiskUsage;
}

function addError(error: unknown, targetDir: string): void {
    dbHelpers.insertErrorLog({
        id: Bun.randomUUIDv7(),
        createdAt: new Date().toISOString(),
        errorMsg: error instanceof Error ? error.message : String(error),
        targetDir,
    });
}

function addBlockedLog(
    target: StorageTarget,
    path: string,
    percentage: number,
    message: string
): void {
    dbHelpers.insertDeleteLog({
        id: Bun.randomUUIDv7(),
        createdAt: new Date().toISOString(),
        deletedDir: path,
        totalTime: 0,
        percentageAfterDelete: percentage,
        action: 'blocked_delete',
        target,
        message,
    });
}

async function verifySourceCanBeDeleted(directory: string): Promise<void> {
    const config = getConfig();
    const srcPath = join(config.src, directory);
    const destPath = join(config.dest, directory);

    await copyDirectory(directory);
    const verification = await verifyFiles({ src: srcPath, dest: destPath });
    if (!verification.synced) {
        const preview = verification.changes.slice(0, 5).join(', ');
        throw new Error(
            `Source verification failed for ${directory}${preview ? `: ${preview}` : ''}`
        );
    }
}

export async function spaceControlService(
    target: StorageTarget,
    limit: number,
    dependencies: SpaceControlDependencies = {}
): Promise<void> {
    const config = getConfig();
    const root = target === 'src' ? config.src : config.dest;
    const readDiskUsage = dependencies.getUsage ?? getDiskUsage;
    let diskUsage = await readDiskUsage(root);

    if (diskUsage.percentage <= limit) return;

    while (diskUsage.percentage > limit) {
        const today = getDateNDaysAgo(0);
        const candidates = getDatedDirectories(root).filter(
            (directory) => directory !== today
        );
        const oldest = candidates.at(0);

        if (!oldest) {
            addBlockedLog(
                target,
                root,
                diskUsage.percentage,
                `Usage is above ${limit}%, but no safe dated directory can be removed`
            );
            return;
        }

        const candidatePath = join(root, oldest);
        const startedAt = Date.now();

        try {
            if (target === 'src') {
                await verifySourceCanBeDeleted(oldest);
            }

            await deleteDir(root, candidatePath);
            diskUsage = await readDiskUsage(root);
            dbHelpers.insertDeleteLog({
                id: Bun.randomUUIDv7(),
                createdAt: new Date().toISOString(),
                deletedDir: candidatePath,
                totalTime: Date.now() - startedAt,
                percentageAfterDelete: diskUsage.percentage,
                action: 'threshold_delete',
                target,
                message:
                    target === 'src'
                        ? 'Deleted after final rsync and dry-run verification'
                        : `Deleted to satisfy ${limit}% destination limit`,
            });
        } catch (error) {
            addError(error, candidatePath);
            addBlockedLog(
                target,
                candidatePath,
                diskUsage.percentage,
                error instanceof Error ? error.message : String(error)
            );
            throw error;
        }

        if (existsSync(candidatePath)) {
            throw new Error(`Directory still exists after deletion: ${candidatePath}`);
        }
    }
}
