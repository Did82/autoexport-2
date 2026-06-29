import { $ } from 'bun';
import { existsSync, statSync } from 'node:fs';

function positiveIntegerFromEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= 30 && value <= 86_400
        ? value
        : fallback;
}

export const RSYNC_IO_TIMEOUT_SECONDS = positiveIntegerFromEnv(
    'RSYNC_TIMEOUT_SECONDS',
    600
);

export function isRsyncAvailable(): boolean {
    return Boolean(Bun.which('rsync'));
}

function assertRsyncAvailable(): void {
    if (!isRsyncAvailable()) {
        throw new Error('rsync is not installed or is not available in PATH');
    }
}

export interface CopyResult {
    filesCopied: number;
    bytesCopied: string;
    totalTime: number;
}

function normalizeCopyPaths(src: string, dest: string): {
    srcPath: string;
    destPath: string;
} {
    return {
        srcPath: src.endsWith('/') ? src : `${src}/`,
        destPath: dest.endsWith('/') ? dest.slice(0, -1) : dest,
    };
}

export async function copyFiles({
    src,
    dest,
}: {
    src: string;
    dest: string;
}): Promise<CopyResult> {
    const startTime = Date.now();
    const { srcPath, destPath } = normalizeCopyPaths(src, dest);
    assertRsyncAvailable();

    if (!existsSync(srcPath) || !statSync(srcPath).isDirectory()) {
        throw new Error(`Source directory does not exist: ${srcPath}`);
    }

    const result = await $`rsync -a --stats --no-owner --no-group --timeout=${RSYNC_IO_TIMEOUT_SECONDS} ${srcPath} ${destPath}`
        .env({ ...process.env, LC_ALL: 'C', LANG: 'C' })
        .quiet()
        .nothrow();
    const stderr = result.stderr.toString();
    const output = `${stderr}\n${result.stdout.toString()}`;

    if (result.exitCode !== 0) {
        throw new Error(`rsync failed: ${stderr.trim() || `exit ${result.exitCode}`}`);
    }

    const filesMatch =
        output.match(/number of (?:regular )?files transferred:\s*(\d+)/i) ??
        output.match(/number of files:\s*(\d+)/i);
    const bytesMatch =
        output.match(/total transferred file size:\s*([\d,\s]+)(?:\s*bytes)?/i) ??
        output.match(/total file size:\s*([\d,\s]+)(?:\s*bytes)?/i);

    return {
        filesCopied: filesMatch?.[1] ? Number(filesMatch[1]) : 0,
        bytesCopied: bytesMatch?.[1]
            ? bytesMatch[1].replace(/[,\s]/g, '') || '0'
            : '0',
        totalTime: Date.now() - startTime,
    };
}

export async function verifyFiles({
    src,
    dest,
}: {
    src: string;
    dest: string;
}): Promise<{ synced: boolean; changes: string[] }> {
    const { srcPath, destPath } = normalizeCopyPaths(src, dest);
    assertRsyncAvailable();
    if (!existsSync(srcPath) || !existsSync(destPath)) {
        return { synced: false, changes: ['source or destination is missing'] };
    }

    const outputFormat = '--out-format=%i|%n';
    const result =
        await $`rsync -a --dry-run --itemize-changes --no-owner --no-group --timeout=${RSYNC_IO_TIMEOUT_SECONDS} ${outputFormat} ${srcPath} ${destPath}`
            .env({ ...process.env, LC_ALL: 'C', LANG: 'C' })
            .quiet()
            .nothrow();
    if (result.exitCode !== 0) {
        throw new Error(
            `rsync verification failed: ${result.stderr.toString().trim()}`
        );
    }

    const changes = result.stdout
        .toString()
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    return { synced: changes.length === 0, changes };
}
