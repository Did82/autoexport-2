import { $ } from 'bun';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP_TIMEZONE } from '../libs/config';

export const QUARANTINE_DIR_NAME = '.autoexport-quarantine';
const DATE_DIRECTORY_PATTERN = /^\d{8}$/;

export function getDateNDaysAgo(
    daysAgo: number,
    timeZone = APP_TIMEZONE
): string {
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));

    return `${values.get('year')}${values.get('month')}${values.get('day')}`;
}

export function isValidDateDirectory(name: string): boolean {
    if (!DATE_DIRECTORY_PATTERN.test(name)) return false;

    const year = Number(name.slice(0, 4));
    const month = Number(name.slice(4, 6));
    const day = Number(name.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

function isRealDirectory(fullPath: string): boolean {
    try {
        const stats = lstatSync(fullPath);
        return stats.isDirectory() && !stats.isSymbolicLink();
    } catch {
        return false;
    }
}

export function getDatedDirectories(root: string): string[] {
    if (!existsSync(root)) return [];

    return readdirSync(root)
        .filter(
            (name) =>
                isValidDateDirectory(name) &&
                isRealDirectory(join(root, name))
        )
        .sort();
}

export function getInvalidDirectories(root: string): string[] {
    if (!existsSync(root)) return [];

    return readdirSync(root)
        .filter(
            (name) =>
                name !== QUARANTINE_DIR_NAME &&
                !isValidDateDirectory(name) &&
                isRealDirectory(join(root, name))
        )
        .sort();
}

export interface DiskUsage {
    free: number;
    used: number;
    total: number;
    percentage: number;
    oldestFolder?: string;
    newestFolder?: string;
}

export async function getDiskUsage(root: string): Promise<DiskUsage> {
    if (!existsSync(root)) {
        throw new Error(`Path does not exist: ${root}`);
    }

    const result = await $`df -Pk ${root}`
        .env({ ...process.env, LC_ALL: 'C', LANG: 'C' })
        .quiet()
        .nothrow();
    if (result.exitCode !== 0) {
        throw new Error(result.stderr.toString().trim() || 'df failed');
    }

    const lines = result.stdout.toString().trim().split('\n');
    const dataLine = lines.at(-1);
    if (!dataLine) {
        throw new Error('Invalid df output');
    }

    const info = dataLine.trim().split(/\s+/);
    const totalRaw = info[1];
    const usedRaw = info[2];
    const freeRaw = info[3];
    if (!totalRaw || !usedRaw || !freeRaw) {
        throw new Error('Invalid df output format');
    }

    const totalKb = Number(totalRaw);
    const usedKb = Number(usedRaw);
    const freeKb = Number(freeRaw);

    if (![totalKb, usedKb, freeKb].every(Number.isFinite)) {
        throw new Error('Invalid df output format');
    }

    const total = totalKb * 1024;
    const used = usedKb * 1024;
    const free = freeKb * 1024;
    const percentage = total > 0 ? Math.floor((used / total) * 100) : 0;
    const directories = getDatedDirectories(root);

    return {
        free,
        used,
        total,
        percentage,
        oldestFolder: directories.at(0),
        newestFolder: directories.at(-1),
    };
}

export function getOldestDate(dates: string[]): string {
    return dates.reduce(
        (oldest, current) => (current < oldest ? current : oldest),
        dates[0] ?? ''
    );
}

export function getNewestDate(dates: string[]): string {
    return dates.reduce(
        (newest, current) => (current > newest ? current : newest),
        dates[0] ?? ''
    );
}

export function humanizeTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;

    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
        return remainingSeconds > 0
            ? `${minutes}m ${remainingSeconds}s`
            : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours < 24) {
        return [
            `${hours}h`,
            remainingMinutes > 0 ? `${remainingMinutes}m` : '',
            remainingSeconds > 0 ? `${remainingSeconds}s` : '',
        ]
            .filter(Boolean)
            .join(' ');
    }

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return [
        `${days}d`,
        remainingHours > 0 ? `${remainingHours}h` : '',
        remainingMinutes > 0 ? `${remainingMinutes}m` : '',
        remainingSeconds > 0 ? `${remainingSeconds}s` : '',
    ]
        .filter(Boolean)
        .join(' ');
}
