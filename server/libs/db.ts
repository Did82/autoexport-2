import { Database } from 'bun:sqlite';

let db: Database | null = null;

export function getDb(): Database {
    if (!db) {
        db = new Database('autoexport.db');
        initSchema();
    }
    return db;
}

export function initSchema() {
    const database = getDb();

    // Enable WAL mode for better performance
    database.run('PRAGMA journal_mode = WAL');

    // CopyLog table
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

    // DeleteLog table
    database.run(`
        CREATE TABLE IF NOT EXISTS DeleteLog (
            id TEXT PRIMARY KEY,
            createdAt TEXT NOT NULL,
            deletedDir TEXT NOT NULL,
            totalTime INTEGER NOT NULL,
            percentageAfterDelete INTEGER NOT NULL
        )
    `);

    // ErrorLog table
    database.run(`
        CREATE TABLE IF NOT EXISTS ErrorLog (
            id TEXT PRIMARY KEY,
            createdAt TEXT NOT NULL,
            errorMsg TEXT NOT NULL,
            targetDir TEXT NOT NULL
        )
    `);

    // Create indexes for performance
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_copy_created ON CopyLog(createdAt);
        CREATE INDEX IF NOT EXISTS idx_delete_created ON DeleteLog(createdAt);
        CREATE INDEX IF NOT EXISTS idx_error_created ON ErrorLog(createdAt);
    `);
}

// Prepared statements
const insertCopyLogStmt = () => {
    const database = getDb();
    return database.prepare(`
        INSERT INTO CopyLog (id, createdAt, copiedDir, filesCopied, totalTime, bytesCopied)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
};

const insertDeleteLogStmt = () => {
    const database = getDb();
    return database.prepare(`
        INSERT INTO DeleteLog (id, createdAt, deletedDir, totalTime, percentageAfterDelete)
        VALUES (?, ?, ?, ?, ?)
    `);
};

const insertErrorLogStmt = () => {
    const database = getDb();
    return database.prepare(`
        INSERT INTO ErrorLog (id, createdAt, errorMsg, targetDir)
        VALUES (?, ?, ?, ?)
    `);
};

export const dbHelpers = {
    insertCopyLog(data: {
        id: string;
        createdAt: string;
        copiedDir: string;
        filesCopied: number;
        totalTime: number;
        bytesCopied: string;
    }) {
        const stmt = insertCopyLogStmt();
        stmt.run(
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
    }) {
        const stmt = insertDeleteLogStmt();
        stmt.run(
            data.id,
            data.createdAt,
            data.deletedDir,
            data.totalTime,
            data.percentageAfterDelete
        );
    },

    insertErrorLog(data: {
        id: string;
        createdAt: string;
        errorMsg: string;
        targetDir: string;
    }) {
        const stmt = insertErrorLogStmt();
        stmt.run(data.id, data.createdAt, data.errorMsg, data.targetDir);
    },

    getCopyLogs() {
        const database = getDb();
        return database
            .prepare('SELECT * FROM CopyLog ORDER BY createdAt DESC')
            .all();
    },

    getDeleteLogs() {
        const database = getDb();
        return database
            .prepare('SELECT * FROM DeleteLog ORDER BY createdAt DESC')
            .all();
    },

    getErrorLogs() {
        const database = getDb();
        return database
            .prepare('SELECT * FROM ErrorLog ORDER BY createdAt DESC')
            .all();
    },

    deleteOldLogs(cutoffDate: string) {
        const database = getDb();
        const stmt1 = database.prepare(
            'DELETE FROM CopyLog WHERE createdAt < ?'
        );
        const stmt2 = database.prepare(
            'DELETE FROM DeleteLog WHERE createdAt < ?'
        );
        const stmt3 = database.prepare(
            'DELETE FROM ErrorLog WHERE createdAt < ?'
        );

        stmt1.run(cutoffDate);
        stmt2.run(cutoffDate);
        stmt3.run(cutoffDate);
    },
};
