import { $ } from 'bun';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export function getDateNDaysAgo(n: number): string {
    const date = new Date();
    date.setDate(date.getDate() - n);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}${month}${day}`;
}

export interface DiskUsage {
    free: number;
    used: number;
    total: number;
    percentage: number;
    oldestFolder?: string;
    newestFolder?: string;
}

export async function getDiskUsage(path: string): Promise<DiskUsage> {
    try {
        // Check if path exists first
        if (!existsSync(path)) {
            throw new Error(`Path does not exist: ${path}`);
        }
        
        const result = await $`df -k ${path}`.quiet();
        const output = result.stdout.toString();
        const lines = output.trim().split('\n');
        
        if (lines.length < 2) {
            throw new Error('Invalid df output');
        }
        
        const info = lines[1].split(/\s+/);
        if (info.length < 4) {
            throw new Error('Invalid df output format');
        }
        
        const total = parseInt(info[1], 10) * 1024; // KB to bytes
        const used = parseInt(info[2], 10) * 1024;
        const free = parseInt(info[3], 10) * 1024;
        const percentage = total > 0 ? Math.floor((used / total) * 100) : 0;
        
        // Get directories
        let oldestFolder: string | undefined;
        let newestFolder: string | undefined;
        
        try {
            if (existsSync(path)) {
                const dirs = readdirSync(path)
                    .filter(dir => {
                        try {
                            const fullPath = join(path, dir);
                            return statSync(fullPath).isDirectory() && /^\d{8}$/.test(dir);
                        } catch {
                            return false;
                        }
                    })
                    .sort();
                
                if (dirs.length > 0) {
                    oldestFolder = getOldestDate(dirs);
                    newestFolder = getNewestDate(dirs);
                }
            }
        } catch {
            // Ignore errors reading directories
        }
        
        return {
            free,
            used,
            total,
            percentage,
            oldestFolder,
            newestFolder,
        };
    } catch (error) {
        throw new Error(`Failed to get disk usage: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function getOldestDate(dates: string[]): string {
    if (dates.length === 0) return '';
    return dates.reduce((oldest, current) => (current < oldest ? current : oldest));
}

export function getNewestDate(dates: string[]): string {
    if (dates.length === 0) return '';
    return dates.reduce((newest, current) => (current > newest ? current : newest));
}

export function getFilteredDirectories(path: string): string[] {
    if (!existsSync(path)) return [];
    
    return readdirSync(path).filter(dir => {
        const fullPath = join(path, dir);
        if (!statSync(fullPath).isDirectory()) return false;
        // Return directories NOT in YYYYMMDD format
        return !/^\d{8}$/.test(dir);
    });
}

export function humanizeTime(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
        return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours < 24) {
        const parts: string[] = [`${hours}h`];
        if (remainingMinutes > 0) parts.push(`${remainingMinutes}m`);
        if (remainingSeconds > 0) parts.push(`${remainingSeconds}s`);
        return parts.join(' ');
    }
    
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    const parts: string[] = [`${days}d`];
    if (remainingHours > 0) parts.push(`${remainingHours}h`);
    if (remainingMinutes > 0) parts.push(`${remainingMinutes}m`);
    if (remainingSeconds > 0) parts.push(`${remainingSeconds}s`);
    return parts.join(' ');
}

