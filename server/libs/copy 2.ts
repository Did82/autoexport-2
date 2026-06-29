import { $ } from 'bun';
import { existsSync, statSync } from 'fs';

export interface CopyResult {
    filesCopied: number;
    bytesCopied: string;
    totalTime: number;
}

export async function copyFiles({
    src,
    dest,
}: {
    src: string;
    dest: string;
}): Promise<CopyResult> {
    const startTime = Date.now();

    // Normalize paths
    const srcPath = src.endsWith('/') ? src : `${src}/`;
    const destPath = dest.endsWith('/') ? dest.slice(0, -1) : dest;

    // Check if source exists
    if (!existsSync(srcPath)) {
        throw new Error(`Source directory does not exist: ${srcPath}`);
    }

    // Check if source is a directory
    const srcStat = statSync(srcPath);
    if (!srcStat.isDirectory()) {
        throw new Error(`Source is not a directory: ${srcPath}`);
    }

    // Create destination directory if it doesn't exist
    if (!existsSync(destPath)) {
        // Use Bun's shell to create directory (more efficient than fs/promises)
        await $`mkdir -p ${destPath}`.quiet();
    }

    // Run rsync with stats output (stats go to stderr)
    // Note: --stats output goes to stderr, so we need to capture it
    // Use .quiet() to suppress normal output, but stderr with --stats will still be captured
    const result =
        await $`rsync -a --stats --no-owner --no-group ${srcPath} ${destPath}`.quiet();

    const totalTime = Date.now() - startTime;

    // Parse statistics from output (rsync outputs stats to stderr)
    const stderrOutput = result.stderr.toString();
    const stdoutOutput = result.stdout.toString();
    const output = stderrOutput + stdoutOutput;
    const outputLower = output.toLowerCase();

    // Find "Number of files transferred: X" or "Number of regular files transferred: X"
    let filesMatch = outputLower.match(
        /number of (?:regular )?files transferred:\s*(\d+)/i
    );
    if (!filesMatch) {
        filesMatch = outputLower.match(/number of files:\s*(\d+)/i);
    }
    const filesCopied =
        filesMatch && filesMatch[1] ? parseInt(filesMatch[1], 10) : 0;

    // Find "Total transferred file size: X bytes" (may have commas or spaces)
    // Also check for "Total file size: X bytes" as fallback
    let bytesMatch = outputLower.match(
        /total transferred file size:\s*([\d,\s]+)\s*bytes/i
    );
    if (!bytesMatch) {
        bytesMatch = outputLower.match(
            /total file size:\s*([\d,\s]+)\s*bytes/i
        );
    }
    // Also try without "bytes" keyword
    if (!bytesMatch) {
        bytesMatch = outputLower.match(
            /total transferred file size:\s*([\d,\s]+)/i
        );
    }

    let bytesCopied = '0';
    if (bytesMatch && bytesMatch[1]) {
        // Remove commas and spaces, convert to string for large numbers
        const cleaned = bytesMatch[1].replace(/[,\s]/g, '');
        if (cleaned) {
            bytesCopied = cleaned;
        }
    }

    // Debug: log output if bytes are 0 but files were copied (only in verbose mode)
    // Suppressed in normal operation to avoid cluttering output

    // If rsync failed but we have stats, return them
    if (result.exitCode !== 0 && filesCopied === 0 && bytesCopied === '0') {
        throw new Error(`rsync failed: ${stderrOutput}`);
    }

    return {
        filesCopied,
        bytesCopied,
        totalTime,
    };
}
