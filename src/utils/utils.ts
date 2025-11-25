import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number | string): string {
    const numBytes = typeof bytes === 'string' ? BigInt(bytes) : BigInt(bytes);
    const kb = 1024n;
    const mb = kb * 1024n;
    const gb = mb * 1024n;
    
    if (numBytes >= gb) {
        return `${(Number(numBytes) / Number(gb)).toFixed(2)} GB`;
    }
    if (numBytes >= mb) {
        return `${(Number(numBytes) / Number(mb)).toFixed(2)} MB`;
    }
    if (numBytes >= kb) {
        return `${(Number(numBytes) / Number(kb)).toFixed(2)} KB`;
    }
    return `${numBytes} B`;
}

export function formatDate(date: string): string {
    return format(new Date(date), 'dd.MM.yyyy HH:mm:ss');
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
