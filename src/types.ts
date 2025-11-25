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
    src: string;
    dest: string;
    limit: number;
    cleanupDays: number;
}

