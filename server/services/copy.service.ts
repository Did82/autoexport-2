import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { copyFiles } from '../libs/copy';
import { dbHelpers } from '../libs/db';
import { getConfig } from '../libs/config';
import { isValidDateDirectory } from '../utils/utils';
import { assertMountReady } from './mount.service';

export async function copyDirectory(
    dirName: string,
    options: { requireExisting?: boolean } = {}
): Promise<void> {
    if (!isValidDateDirectory(dirName)) {
        throw new Error(`Invalid directory name: ${dirName}`);
    }
    const config = getConfig();
    await Promise.all([
        assertMountReady('src', config),
        assertMountReady('dest', config),
    ]);
    const srcPath = join(config.src, dirName);
    const destPath = join(config.dest, dirName);
    
    try {
        if (!existsSync(srcPath)) {
            if (options.requireExisting) {
                throw new Error(`Source directory does not exist: ${srcPath}`);
            }
            return;
        }

        const stat = statSync(srcPath);
        if (!stat.isDirectory()) {
            if (options.requireExisting) {
                throw new Error(`Source path is not a directory: ${srcPath}`);
            }
            return;
        }

        const result = await copyFiles({
            src: srcPath,
            dest: destPath,
        });
        
        // Create CopyLog entry
        dbHelpers.insertCopyLog({
            id: Bun.randomUUIDv7(),
            createdAt: new Date().toISOString(),
            copiedDir: dirName,
            filesCopied: result.filesCopied,
            totalTime: result.totalTime,
            bytesCopied: result.bytesCopied,
        });
    } catch (error) {
        // Create ErrorLog entry
        dbHelpers.insertErrorLog({
            id: Bun.randomUUIDv7(),
            createdAt: new Date().toISOString(),
            errorMsg: error instanceof Error ? error.message : String(error),
            targetDir: srcPath,
        });
        throw error;
    }
}
