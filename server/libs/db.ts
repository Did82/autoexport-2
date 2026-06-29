import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type MaintenanceAction =
    | 'threshold_delete'
    | 'quarantine_move'
    | 'quarantine_delete'
    | 'blocked_delete';

export type StorageTarget = 'src' | 'dest';
export type JobStatus =
    | 'queued'
    | 'running'
    | 'success'
    | 'failed'
    | 'interrupted';

export interface JobRun {
    id: string;
    name: string;
    status: JobStatus;
    queuedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    heartbeatAt: string | null;
    error: string | null;
}

export interface MountIdentity {
    target: StorageTarget;
    root: string;
    markerId: string;
    registeredAt: string;
}

let db: Database | null = null;

const DATABASE_PATH = path.resolve(
    process.env.DATABASE_PATH || path.join(process.cwd(), 'autoexport.db')
);

function ensureColumn(
    database: Database,
    table: string,
    column: string,
    definition: string
): void {
    const columns = database
        .query(`PRAGMA table_info(${table})`)
        .all() as Array<{ name: string }>;

    if (!columns.some((item) => item.name === column)) {
        database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

function configureDatabase(database: Database): void {
    database.run('PRAGMA journal_mode = WAL');
    database.run('PRAGMA foreign_keys = ON');
    database.run('PRAGMA busy_timeout = 5000');

    database.run(`
        CREATE TABLE IF NOT EXISTS CopyLog (
            id TEXT PRIMARY KEY,
            createdAt TEXT NOT NULL,
            copiedDir TEXT NOT NULL,
            filesCopied INTEGER NOT NULL,
            totalTime INTEGER NOT NULL,
            bytesCopied TEXT NOT NULL
        )
    `);
    database.run(`
        CREATE TABLE IF NOT EXISTS DeleteLog (
            id TEXT PRIMARY KEY,
            createdAt TEXT NOT NULL,
            deletedDir TEXT NOT NULL,
            totalTime INTEGER NOT NULL,
            percentageAfterDelete INTEGER NOT NULL
        )
    `);
    database.run(`
        CREATE TABLE IF NOT EXISTS ErrorLog (
            id TEXT PRIMARY KEY,
            createdAt TEXT NOT NULL,
            errorMsg TEXT NOT NULL,
            targetDir TEXT NOT NULL
        )
    `);
    database.run(`
        CREATE TABLE IF NOT EXISTS JobRun (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL,
            queuedAt TEXT NOT NULL,
            startedAt TEXT,
            finishedAt TEXT,
            heartbeatAt TEXT,
            error TEXT
        )
    `);
    database.run(`
        CREATE TABLE IF NOT EXISTS OperationLease (
            name TEXT PRIMARY KEY,
            ownerId TEXT NOT NULL,
            acquiredAt TEXT NOT NULL,
            heartbeatAt TEXT NOT NULL,
            expiresAt TEXT NOT NULL
        )
    `);
    database.run(`
        CREATE TABLE IF NOT EXISTS MountIdentity (
            target TEXT PRIMARY KEY,
            root TEXT NOT NULL,
            markerId TEXT NOT NULL,
            registeredAt TEXT NOT NULL
        )
    `);

    ensureColumn(
        database,
        'DeleteLog',
        'action',
        "TEXT NOT NULL DEFAULT 'threshold_delete'"
    );
    ensureColumn(
        database,
        'DeleteLog',
        'target',
        "TEXT NOT NULL DEFAULT 'unknown'"
    );
    ensureColumn(database, 'DeleteLog', 'message', 'TEXT');

    database.run(
        'CREATE INDEX IF NOT EXISTS idx_copy_created ON CopyLog(createdAt)'
    );
    database.run(
        'CREATE INDEX IF NOT EXISTS idx_delete_created ON DeleteLog(createdAt)'
    );
    database.run(
        'CREATE INDEX IF NOT EXISTS idx_error_created ON ErrorLog(createdAt)'
    );
    database.run(
        'CREATE INDEX IF NOT EXISTS idx_job_queued ON JobRun(queuedAt)'
    );
    database.run(
        'CREATE INDEX IF NOT EXISTS idx_job_status ON JobRun(status)'
    );
}

export function getDb(): Database {
    if (!db) {
        mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
        db = new Database(DATABASE_PATH, { create: true });
        configureDatabase(db);
    }
    return db;
}

export function initSchema(): void {
    getDb();
}

export function checkDatabase(): boolean {
    const row = getDb().query('SELECT 1 AS ok').get() as { ok: number } | null;
    return row?.ok === 1;
}

export const dbHelpers = {
    insertCopyLog(data: {
        id: string;
        createdAt: string;
        copiedDir: string;
        filesCopied: number;
        totalTime: number;
        bytesCopied: string;
    }): void {
        getDb()
            .prepare(`
                INSERT INTO CopyLog
                    (id, createdAt, copiedDir, filesCopied, totalTime, bytesCopied)
                VALUES (?, ?, ?, ?, ?, ?)
            `)
            .run(
                data.id,
                data.createdAt,
                data.copiedDir,
                data.filesCopied,
                data.totalTime,
                data.bytesCopied
            );
    },

    insertDeleteLog(data: {
        id: string;
        createdAt: string;
        deletedDir: string;
        totalTime: number;
        percentageAfterDelete: number;
        action: MaintenanceAction;
        target: 'src' | 'dest' | 'unknown';
        message?: string;
    }): void {
        getDb()
            .prepare(`
                INSERT INTO DeleteLog
                    (id, createdAt, deletedDir, totalTime, percentageAfterDelete, action, target, message)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
                data.id,
                data.createdAt,
                data.deletedDir,
                data.totalTime,
                data.percentageAfterDelete,
                data.action,
                data.target,
                data.message ?? null
            );
    },

    insertErrorLog(data: {
        id: string;
        createdAt: string;
        errorMsg: string;
        targetDir: string;
    }): void {
        getDb()
            .prepare(`
                INSERT INTO ErrorLog (id, createdAt, errorMsg, targetDir)
                VALUES (?, ?, ?, ?)
            `)
            .run(data.id, data.createdAt, data.errorMsg, data.targetDir);
    },

    getCopyLogs() {
        return getDb()
            .prepare('SELECT * FROM CopyLog ORDER BY createdAt DESC')
            .all();
    },

    getDeleteLogs() {
        return getDb()
            .prepare('SELECT * FROM DeleteLog ORDER BY createdAt DESC')
            .all();
    },

    getErrorLogs() {
        return getDb()
            .prepare('SELECT * FROM ErrorLog ORDER BY createdAt DESC')
            .all();
    },

    createJobRun(data: { id: string; name: string; queuedAt: string }): void {
        getDb()
            .prepare(`
                INSERT INTO JobRun (id, name, status, queuedAt)
                VALUES (?, ?, 'queued', ?)
            `)
            .run(data.id, data.name, data.queuedAt);
    },

    markJobRunning(id: string, timestamp: string): void {
        getDb()
            .prepare(`
                UPDATE JobRun
                SET status = 'running', startedAt = ?, heartbeatAt = ?
                WHERE id = ?
            `)
            .run(timestamp, timestamp, id);
    },

    heartbeatJob(id: string, timestamp: string): void {
        getDb()
            .prepare(`
                UPDATE JobRun SET heartbeatAt = ?
                WHERE id = ? AND status = 'running'
            `)
            .run(timestamp, id);
    },

    finishJob(
        id: string,
        status: Extract<JobStatus, 'success' | 'failed' | 'interrupted'>,
        timestamp: string,
        error?: string
    ): void {
        getDb()
            .prepare(`
                UPDATE JobRun
                SET status = ?, finishedAt = ?, heartbeatAt = ?, error = ?
                WHERE id = ?
            `)
            .run(status, timestamp, timestamp, error ?? null, id);
    },

    getRecentJobs(limit = 50): JobRun[] {
        const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
        return getDb()
            .prepare('SELECT * FROM JobRun ORDER BY queuedAt DESC LIMIT ?')
            .all(safeLimit) as JobRun[];
    },

    markAbandonedJobs(cutoff: string, timestamp: string): number {
        const result = getDb()
            .prepare(`
                UPDATE JobRun
                SET status = 'interrupted', finishedAt = ?,
                    error = 'Process stopped before the job completed'
                WHERE status IN ('queued', 'running')
                  AND COALESCE(heartbeatAt, queuedAt) < ?
            `)
            .run(timestamp, cutoff);
        return result.changes;
    },

    acquireLease(data: {
        name: string;
        ownerId: string;
        now: string;
        expiresAt: string;
    }): boolean {
        const database = getDb();
        const acquire = database.transaction(() => {
            database
                .prepare('DELETE FROM OperationLease WHERE name = ? AND expiresAt <= ?')
                .run(data.name, data.now);
            const result = database
                .prepare(`
                    INSERT OR IGNORE INTO OperationLease
                        (name, ownerId, acquiredAt, heartbeatAt, expiresAt)
                    VALUES (?, ?, ?, ?, ?)
                `)
                .run(
                    data.name,
                    data.ownerId,
                    data.now,
                    data.now,
                    data.expiresAt
                );
            return result.changes === 1;
        });
        return acquire();
    },

    heartbeatLease(data: {
        name: string;
        ownerId: string;
        now: string;
        expiresAt: string;
    }): boolean {
        const result = getDb()
            .prepare(`
                UPDATE OperationLease
                SET heartbeatAt = ?, expiresAt = ?
                WHERE name = ? AND ownerId = ?
            `)
            .run(data.now, data.expiresAt, data.name, data.ownerId);
        return result.changes === 1;
    },

    releaseLease(name: string, ownerId: string): void {
        getDb()
            .prepare('DELETE FROM OperationLease WHERE name = ? AND ownerId = ?')
            .run(name, ownerId);
    },

    upsertMountIdentity(data: MountIdentity): void {
        getDb()
            .prepare(`
                INSERT INTO MountIdentity (target, root, markerId, registeredAt)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(target) DO UPDATE SET
                    root = excluded.root,
                    markerId = excluded.markerId,
                    registeredAt = excluded.registeredAt
            `)
            .run(data.target, data.root, data.markerId, data.registeredAt);
    },

    getMountIdentity(target: StorageTarget): MountIdentity | null {
        return (getDb()
            .prepare('SELECT * FROM MountIdentity WHERE target = ?')
            .get(target) ?? null) as MountIdentity | null;
    },

    deleteOldLogs(cutoffDate: string): void {
        const database = getDb();
        const remove = database.transaction((date: string) => {
            database.prepare('DELETE FROM CopyLog WHERE createdAt < ?').run(date);
            database.prepare('DELETE FROM DeleteLog WHERE createdAt < ?').run(date);
            database.prepare('DELETE FROM ErrorLog WHERE createdAt < ?').run(date);
            database.prepare('DELETE FROM JobRun WHERE queuedAt < ?').run(date);
        });
        remove(cutoffDate);
    },
};
