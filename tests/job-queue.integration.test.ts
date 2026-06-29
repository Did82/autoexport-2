import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temporaryDirectories: string[] = [];
const queueModuleUrl = pathToFileURL(
    join(process.cwd(), 'server/services/job-queue.service.ts')
).href;
const databaseModuleUrl = pathToFileURL(
    join(process.cwd(), 'server/libs/db.ts')
).href;

async function createEnvironment() {
    const root = await mkdtemp(join(tmpdir(), 'autoexport-jobs-'));
    temporaryDirectories.push(root);
    return { root, databasePath: join(root, 'autoexport.db') };
}

function spawnScript(code: string, databasePath: string) {
    return Bun.spawn(['bun', '-e', code], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_PATH: databasePath },
        stdout: 'pipe',
        stderr: 'pipe',
    });
}

async function expectSuccess(processHandle: ReturnType<typeof Bun.spawn>) {
    const exitCode = await processHandle.exited;
    if (exitCode !== 0) {
        const stderr = processHandle.stderr;
        const message =
            stderr && typeof stderr !== 'number'
                ? await new Response(stderr).text()
                : `Process exited with ${exitCode}`;
        throw new Error(message);
    }
}

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) =>
            rm(directory, { recursive: true, force: true })
        )
    );
});

describe('persistent file job queue', () => {
    test('coalesces duplicate in-process jobs and stores one successful run', async () => {
        const environment = await createEnvironment();
        const processHandle = spawnScript(
            `
                const { enqueueFileJob } = await import(${JSON.stringify(queueModuleUrl)});
                let executions = 0;
                const task = async () => {
                    executions += 1;
                    await Bun.sleep(75);
                };
                await Promise.all([
                    enqueueFileJob('same-job', task),
                    enqueueFileJob('same-job', task),
                ]);
                if (executions !== 1) throw new Error('duplicate task executed');
            `,
            environment.databasePath
        );
        await expectSuccess(processHandle);

        const database = new Database(environment.databasePath);
        const jobs = database
            .query('SELECT name, status FROM JobRun')
            .all() as Array<{ name: string; status: string }>;
        database.close();

        expect(jobs).toEqual([{ name: 'same-job', status: 'success' }]);
    });

    test('prevents a second process from acquiring the active lease', async () => {
        const environment = await createEnvironment();
        const readyPath = join(environment.root, 'lease-ready');
        const holder = spawnScript(
            `
                const { dbHelpers } = await import(${JSON.stringify(databaseModuleUrl)});
                const now = new Date().toISOString();
                const acquired = dbHelpers.acquireLease({
                    name: 'filesystem-mutations', ownerId: 'holder', now,
                    expiresAt: new Date(Date.now() + 10_000).toISOString(),
                });
                if (!acquired) throw new Error('holder did not acquire lease');
                await Bun.write(${JSON.stringify(readyPath)}, 'ready');
                await Bun.sleep(1_000);
                dbHelpers.releaseLease('filesystem-mutations', 'holder');
            `,
            environment.databasePath
        );

        for (let attempt = 0; attempt < 50 && !existsSync(readyPath); attempt += 1) {
            await Bun.sleep(20);
        }
        expect(existsSync(readyPath)).toBe(true);

        const contender = spawnScript(
            `
                const { dbHelpers } = await import(${JSON.stringify(databaseModuleUrl)});
                const now = new Date().toISOString();
                const acquired = dbHelpers.acquireLease({
                    name: 'filesystem-mutations', ownerId: 'contender', now,
                    expiresAt: new Date(Date.now() + 10_000).toISOString(),
                });
                if (acquired) throw new Error('contender acquired an active lease');
            `,
            environment.databasePath
        );

        await expectSuccess(contender);
        await expectSuccess(holder);

        const afterRelease = spawnScript(
            `
                const { dbHelpers } = await import(${JSON.stringify(databaseModuleUrl)});
                const now = new Date().toISOString();
                if (!dbHelpers.acquireLease({
                    name: 'filesystem-mutations', ownerId: 'next', now,
                    expiresAt: new Date(Date.now() + 10_000).toISOString(),
                })) throw new Error('released lease could not be acquired');
                dbHelpers.releaseLease('filesystem-mutations', 'next');
            `,
            environment.databasePath
        );
        await expectSuccess(afterRelease);
    });

    test('coalesces matching handles and stores batch progress metadata', async () => {
        const environment = await createEnvironment();
        const processHandle = spawnScript(
            `
                const { enqueueFileJobWithHandle } = await import(${JSON.stringify(queueModuleUrl)});
                let executions = 0;
                const task = async (context) => {
                    executions += 1;
                    context.updateProgress({
                        processedItems: 1,
                        successfulItems: 1,
                        failedItems: 0,
                        currentItem: '20260102',
                    });
                    await Bun.sleep(50);
                    context.updateProgress({
                        processedItems: 2,
                        successfulItems: 2,
                        failedItems: 0,
                        currentItem: null,
                    });
                };
                const first = enqueueFileJobWithHandle('manual batch', task, {
                    dedupeKey: 'same-selection',
                    trigger: 'manual',
                    totalItems: 2,
                });
                const second = enqueueFileJobWithHandle('manual batch', task, {
                    dedupeKey: 'same-selection',
                    trigger: 'manual',
                    totalItems: 2,
                });
                if (!second.coalesced || first.id !== second.id) {
                    throw new Error('matching job was not coalesced');
                }
                await Promise.all([first.promise, second.promise]);
                if (executions !== 1) throw new Error('batch executed twice');
            `,
            environment.databasePath
        );
        await expectSuccess(processHandle);

        const database = new Database(environment.databasePath);
        const job = database
            .query(`
                SELECT status, trigger, totalItems, processedItems,
                       successfulItems, failedItems, currentItem
                FROM JobRun
            `)
            .get() as Record<string, unknown>;
        database.close();

        expect(job).toEqual({
            status: 'success',
            trigger: 'manual',
            totalItems: 2,
            processedItems: 2,
            successfulItems: 2,
            failedItems: 0,
            currentItem: null,
        });
    });

    test('migrates legacy JobRun rows without losing history', async () => {
        const environment = await createEnvironment();
        const legacyDatabase = new Database(environment.databasePath, {
            create: true,
        });
        legacyDatabase.run(`
            CREATE TABLE JobRun (
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
        legacyDatabase
            .prepare(`
                INSERT INTO JobRun (id, name, status, queuedAt)
                VALUES ('legacy', 'old-job', 'success', '2025-01-01T00:00:00.000Z')
            `)
            .run();
        legacyDatabase.close();

        const processHandle = spawnScript(
            `
                const { getDb } = await import(${JSON.stringify(databaseModuleUrl)});
                getDb();
            `,
            environment.databasePath
        );
        await expectSuccess(processHandle);

        const database = new Database(environment.databasePath);
        const columns = database
            .query('PRAGMA table_info(JobRun)')
            .all() as Array<{ name: string }>;
        const job = database
            .query(`
                SELECT id, name, trigger, totalItems, processedItems
                FROM JobRun WHERE id = 'legacy'
            `)
            .get() as Record<string, unknown>;
        database.close();

        expect(columns.map((column) => column.name)).toContain('scheduleId');
        expect(columns.map((column) => column.name)).toContain('currentItem');
        expect(job).toEqual({
            id: 'legacy',
            name: 'old-job',
            trigger: 'unknown',
            totalItems: null,
            processedItems: null,
        });
    });
});
