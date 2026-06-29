// Shared types for the application

export interface CopyLog {
    id: string;
    createdAt: string;
    copiedDir: string;
    filesCopied: number;
    totalTime: number;
    bytesCopied: string;
}

export interface DeleteLog {
    id: string;
    createdAt: string;
    deletedDir: string;
    totalTime: number;
    percentageAfterDelete: number;
    action:
        | 'threshold_delete'
        | 'quarantine_move'
        | 'quarantine_delete'
        | 'blocked_delete';
    target: 'src' | 'dest' | 'unknown';
    message?: string | null;
}

export interface ErrorLog {
    id: string;
    createdAt: string;
    errorMsg: string;
    targetDir: string;
}

export interface DiskUsage {
    free: number;
    used: number;
    total: number;
    percentage: number;
    oldestFolder?: string;
    newestFolder?: string;
    error?: string;
}

export interface Config {
    schemaVersion: 2;
    src: string;
    dest: string;
    srcLimit: number;
    destLimit: number;
    cleanupDays: number;
    quarantineDays: number;
}
