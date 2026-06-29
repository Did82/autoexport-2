import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type MaintenanceAction =
    | 'threshold_delete'
    | 'quarantine_move'
    | 'quarantine_delete'
    | 'blocked_delete';

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

    deleteOldLogs(cutoffDate: string): void {
        const database = getDb();
        const remove = database.transaction((date: string) => {
            database.prepare('DELETE FROM CopyLog WHERE createdAt < ?').run(date);
            database.prepare('DELETE FROM DeleteLog WHERE createdAt < ?').run(date);
            database.prepare('DELETE FROM ErrorLog WHERE createdAt < ?').run(date);
        });
        remove(cutoffDate);
    },
};
