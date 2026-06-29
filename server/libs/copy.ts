import { $ } from 'bun';
import { existsSync, statSync } from 'node:fs';

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

    if (!existsSync(srcPath) || !statSync(srcPath).isDirectory()) {
        throw new Error(`Source directory does not exist: ${srcPath}`);
    }

    const result = await $`rsync -a --stats --no-owner --no-group ${srcPath} ${destPath}`
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
    if (!existsSync(srcPath) || !existsSync(destPath)) {
        return { synced: false, changes: ['source or destination is missing'] };
    }

    const outputFormat = '--out-format=%i|%n';
    const result =
        await $`rsync -a --dry-run --itemize-changes --no-owner --no-group ${outputFormat} ${srcPath} ${destPath}`
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
