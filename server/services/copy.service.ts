import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { copyFiles } from '../libs/copy';
import { dbHelpers } from '../libs/db';
import { getConfig } from '../libs/config';
import { isValidDateDirectory } from '../utils/utils';

export async function copyDirectory(dirName: string): Promise<void> {
    if (!isValidDateDirectory(dirName)) {
        throw new Error(`Invalid directory name: ${dirName}`);
    }
    const config = getConfig();
    const srcPath = join(config.src, dirName);
    const destPath = join(config.dest, dirName);
    
    // Check if source directory exists
    if (!existsSync(srcPath)) {
        // Directory doesn't exist - exit without error
        return;
    }
    
    // Check if it's a directory
    const stat = statSync(srcPath);
    if (!stat.isDirectory()) {
        // Not a directory - exit
        return;
    }
    
    try {
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
