import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { deleteDir } from '../utils/delete';
import { getDiskUsage, getFilteredDirectories, getOldestDate } from '../utils/utils';
import { dbHelpers } from '../libs/db';
import { getConfig } from '../libs/config';

export async function spaceControlService(target: 'src' | 'dest', limit: number): Promise<void> {
    const config = getConfig();
    const path = target === 'src' ? config.src : config.dest;
    
    let diskUsage = await getDiskUsage(path);
    
    if (diskUsage.percentage <= limit) {
        return; // No action needed
    }
    
    while (diskUsage.percentage > limit) {
        // Read directories
        const dirs = readdirSync(path)
            .filter(dir => {
                const fullPath = join(path, dir);
                return statSync(fullPath).isDirectory() && /^\d{8}$/.test(dir);
            })
            .sort();
        
        if (dirs.length === 0) {
            break; // No more directories to delete
        }
        
        // Find oldest directory
        const oldestDir = getOldestDate(dirs);
        const oldestPath = join(path, oldestDir);
        
        const startTime = Date.now();
        
        // Delete directory
        await deleteDir(oldestPath);
        
        const totalTime = Date.now() - startTime;
        
        // Get new disk usage
        diskUsage = await getDiskUsage(path);
        
        // Create DeleteLog entry
        dbHelpers.insertDeleteLog({
            id: Bun.randomUUIDv7(),
            createdAt: new Date().toISOString(),
            deletedDir: oldestPath,
            totalTime,
            percentageAfterDelete: diskUsage.percentage,
        });
    }
}

export async function deleteRedundantDirectories(target: 'src' | 'dest'): Promise<void> {
    const config = getConfig();
    const path = target === 'src' ? config.src : config.dest;
    
    const redundantDirs = getFilteredDirectories(path);
    
    for (const dir of redundantDirs) {
        const dirPath = join(path, dir);
        const startTime = Date.now();
        
        try {
            await deleteDir(dirPath);
            
            const diskUsage = await getDiskUsage(path);
            
            // Create DeleteLog entry
            dbHelpers.insertDeleteLog({
                id: Bun.randomUUIDv7(),
                createdAt: new Date().toISOString(),
                deletedDir: dirPath,
                totalTime: Date.now() - startTime,
                percentageAfterDelete: diskUsage.percentage,
            });
        } catch (error) {
            // Create ErrorLog entry
            dbHelpers.insertErrorLog({
                id: Bun.randomUUIDv7(),
                createdAt: new Date().toISOString(),
                errorMsg: error instanceof Error ? error.message : String(error),
                targetDir: dirPath,
            });
        }
    }
}

