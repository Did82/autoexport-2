import { getConfig } from '../libs/config';
import { getDatedDirectories, isValidDateDirectory } from '../utils/utils';
import { copyDirectory } from './copy.service';
import {
    enqueueFileJobWithHandle,
    type EnqueuedFileJob,
    type JobProgress,
} from './job-queue.service';
import { assertMountReady } from './mount.service';

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function manualJobName(count: number): string {
    if (count === 1) return 'Ручное копирование: 1 папка';
    return `Ручное копирование: ${count} папок`;
}

function normalizeDirectories(
    input: unknown,
    availableDirectories: string[]
): string[] {
    if (!Array.isArray(input) || input.length === 0) {
        throw new Error('directories must be a non-empty array');
    }
    if (!input.every((item) => typeof item === 'string')) {
        throw new Error('Every directory must be a string');
    }

    const directories = [...new Set(input)].sort();
    const available = new Set(availableDirectories);

    for (const directory of directories) {
        if (!isValidDateDirectory(directory)) {
            throw new Error(`Invalid directory name: ${directory}`);
        }
        if (!available.has(directory)) {
            throw new Error(`Source directory does not exist: ${directory}`);
        }
    }

    return directories;
}

export async function getSourceDirectories(): Promise<string[]> {
    const config = getConfig();
    await assertMountReady('src', config);
    return getDatedDirectories(config.src);
}

export async function queueManualCopyDirectories(
    input: unknown
): Promise<EnqueuedFileJob & { directoryCount: number }> {
    const config = getConfig();
    await Promise.all([
        assertMountReady('src', config),
        assertMountReady('dest', config),
    ]);

    const directories = normalizeDirectories(
        input,
        getDatedDirectories(config.src)
    );
    const errors: Array<{ directory: string; message: string }> = [];
    const progress: JobProgress = {
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        currentItem: null,
    };
    const dedupeKey = `manual-copy:${directories.join(',')}`;
    const job = enqueueFileJobWithHandle(
        manualJobName(directories.length),
        async (context) => {
            for (const directory of directories) {
                progress.currentItem = directory;
                context.updateProgress(progress);

                try {
                    await copyDirectory(directory, { requireExisting: true });
                    progress.successfulItems += 1;
                } catch (error) {
                    progress.failedItems += 1;
                    errors.push({ directory, message: describeError(error) });
                } finally {
                    progress.processedItems += 1;
                    progress.currentItem = null;
                    context.updateProgress(progress);
                }
            }

            if (errors.length > 0) {
                const details = errors
                    .slice(0, 5)
                    .map((item) => `${item.directory}: ${item.message}`)
                    .join('; ');
                const remaining = errors.length - 5;
                throw new Error(
                    `Не скопировано ${errors.length} из ${directories.length} папок: ${details}${
                        remaining > 0 ? `; ещё ${remaining}` : ''
                    }`
                );
            }
        },
        {
            dedupeKey,
            trigger: 'manual',
            totalItems: directories.length,
        }
    );

    return { ...job, directoryCount: directories.length };
}
