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

export type JobStatus =
    | 'queued'
    | 'running'
    | 'success'
    | 'failed'
    | 'interrupted';

export type JobTrigger =
    | 'cron'
    | 'manual'
    | 'cli'
    | 'system'
    | 'unknown';

export interface JobRun {
    id: string;
    name: string;
    status: JobStatus;
    trigger: JobTrigger;
    scheduleId: string | null;
    queuedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    heartbeatAt: string | null;
    error: string | null;
    totalItems: number | null;
    processedItems: number | null;
    successfulItems: number | null;
    failedItems: number | null;
    currentItem: string | null;
    stale: boolean;
}

export interface SourceDirectoriesResponse {
    directories: string[];
}

export interface ScheduleLatestRun {
    id: string;
    status: JobStatus;
    queuedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
}

export interface ScheduleTask {
    id: string;
    name: string;
    description: string;
    cronExpression: string;
    scheduleLabel: string;
    nextRun: string | null;
    latestRun: ScheduleLatestRun | null;
}

export interface ScheduleSnapshot {
    timezone: string;
    tasks: ScheduleTask[];
}

export interface MountStatus {
    target: 'src' | 'dest';
    root: string;
    status: 'ok' | 'unverified' | 'unavailable' | 'mismatch';
    message: string;
    registeredAt?: string;
}
