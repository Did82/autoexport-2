import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDateNDaysAgo } from '../server/utils/utils';

let root = '';
let baseUrl = '';
let server: ReturnType<typeof Bun.spawn> | null = null;
let srcPath = '';
let destPath = '';

async function waitForServer(url: string): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
            const response = await fetch(`${url}/api/live`);
            if (response.ok) return;
        } catch {
            // Server is still starting.
        }
        await Bun.sleep(50);
    }
    throw new Error('Test server did not start');
}

beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'autoexport-api-'));
    srcPath = join(root, 'src');
    destPath = join(root, 'dest');
    const configPath = join(root, 'config.json');
    await mkdir(srcPath);
    await mkdir(destPath);
    await writeFile(
        configPath,
        JSON.stringify({
            src: srcPath,
            dest: destPath,
            limit: 63,
            cleanupDays: 90,
        })
    );

    const port = 41_000 + Math.floor(Math.random() * 2_000);
    baseUrl = `http://127.0.0.1:${port}`;
    server = Bun.spawn(['bun', 'server/index.ts'], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            NODE_ENV: 'production',
            PORT: String(port),
            CONFIG_PATH: configPath,
            DATABASE_PATH: join(root, 'autoexport.db'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
    });

    await waitForServer(baseUrl);
});

afterAll(async () => {
    server?.kill();
    if (server) await server.exited;
    if (root) await rm(root, { recursive: true, force: true });
});

describe('configuration API', () => {
    test('separates liveness from storage readiness', async () => {
        expect((await fetch(`${baseUrl}/api/live`)).status).toBe(200);
        expect((await fetch(`${baseUrl}/api/ready`)).status).toBe(503);

        const registered = await fetch(`${baseUrl}/api/mounts/register`, {
            method: 'POST',
        });
        expect(registered.status).toBe(200);
        expect((await fetch(`${baseUrl}/api/ready`)).status).toBe(200);

        const markerPath = join(destPath, '.autoexport-mount-id');
        const marker = await Bun.file(markerPath).text();
        await writeFile(markerPath, `${Bun.randomUUIDv7()}\n`);

        const mismatched = await fetch(`${baseUrl}/api/ready`);
        expect(mismatched.status).toBe(503);
        const body = (await mismatched.json()) as {
            checks: { mounts: Array<{ status: string }> };
        };
        expect(body.checks.mounts.some((mount) => mount.status === 'mismatch')).toBe(
            true
        );

        await writeFile(markerPath, marker);
        expect((await fetch(`${baseUrl}/api/ready`)).status).toBe(200);
    });

    test('returns migrated independent limits', async () => {
        const response = await fetch(`${baseUrl}/api/config`);
        const config = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(config.srcLimit).toBe(63);
        expect(config.destLimit).toBe(63);
        expect(config.limit).toBeUndefined();
    });

    test('awaits persistence and returns the complete updated config', async () => {
        const response = await fetch(`${baseUrl}/api/config`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ srcLimit: 60, destLimit: 81 }),
        });
        const config = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(config.srcLimit).toBe(60);
        expect(config.destLimit).toBe(81);

        const reread = (await (
            await fetch(`${baseUrl}/api/config`)
        ).json()) as Record<string, unknown>;
        expect(reread.srcLimit).toBe(60);
        expect(reread.destLimit).toBe(81);
    });

    test('does not persist configuration when mount registration fails', async () => {
        const before = (await (
            await fetch(`${baseUrl}/api/config`)
        ).json()) as Record<string, unknown>;
        const invalidSource = join(root, 'invalid-source');
        await mkdir(invalidSource);
        await writeFile(join(invalidSource, '.autoexport-mount-id'), 'bad\n');

        const response = await fetch(`${baseUrl}/api/config`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ src: invalidSource }),
        });
        const after = (await (
            await fetch(`${baseUrl}/api/config`)
        ).json()) as Record<string, unknown>;

        expect(response.status).toBe(400);
        expect(after).toEqual(before);
        expect((await fetch(`${baseUrl}/api/ready`)).status).toBe(200);
    });

    test('rejects unknown config fields and removed endpoints', async () => {
        const invalid = await fetch(`${baseUrl}/api/config`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ surprise: true }),
        });
        const removed = await fetch(`${baseUrl}/api/dirs?path=/tmp`);

        expect(invalid.status).toBe(400);
        expect(removed.status).toBe(404);
    });

    test('returns the persistent job feed', async () => {
        const response = await fetch(`${baseUrl}/api/jobs`);
        expect(response.status).toBe(200);
        expect(Array.isArray(await response.json())).toBe(true);
    });

    test('lists only real dated source directories in chronological order', async () => {
        await Promise.all([
            mkdir(join(srcPath, '20260101')),
            mkdir(join(srcPath, '20260102')),
            mkdir(join(srcPath, '20260103')),
            mkdir(join(srcPath, 'manual-notes')),
        ]);

        const response = await fetch(`${baseUrl}/api/source-directories`);
        const body = (await response.json()) as { directories: string[] };

        expect(response.status).toBe(200);
        expect(body.directories).toEqual([
            '20260101',
            '20260102',
            '20260103',
        ]);
    });

    test('returns all registered schedules with timezone and next run', async () => {
        const response = await fetch(`${baseUrl}/api/schedules`);
        const body = (await response.json()) as {
            timezone: string;
            tasks: Array<{
                id: string;
                cronExpression: string;
                nextRun: string | null;
            }>;
        };

        expect(response.status).toBe(200);
        expect(body.timezone).toBe('Europe/Minsk');
        expect(body.tasks.map((task) => task.id)).toEqual([
            'copy-current',
            'copy-yesterday',
            'space-control-src',
            'space-control-dest',
            'cleanup-logs',
            'quarantine-maintenance',
        ]);
        expect(body.tasks.every((task) => Boolean(task.cronExpression))).toBe(
            true
        );
        expect(
            body.tasks.every(
                (task) =>
                    task.nextRun !== null &&
                    Date.parse(task.nextRun) > Date.now()
            )
        ).toBe(true);
    });

    test('copies a manual batch, continues after an item failure, and stores progress', async () => {
        await Promise.all([
            writeFile(join(srcPath, '20260101', 'first.txt'), 'first'),
            writeFile(join(srcPath, '20260102', 'second.txt'), 'second'),
            writeFile(join(srcPath, '20260103', 'third.txt'), 'third'),
        ]);
        await writeFile(join(destPath, '20260102'), 'blocks directory creation');

        const response = await fetch(`${baseUrl}/api/jobs/copy-directories`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                directories: [
                    '20260103',
                    '20260101',
                    '20260102',
                    '20260101',
                ],
            }),
        });
        const accepted = (await response.json()) as {
            jobId: string;
            directoryCount: number;
        };

        expect(response.status).toBe(202);
        expect(accepted.directoryCount).toBe(3);

        let completedJob:
            | {
                  id: string;
                  status: string;
                  trigger: string;
                  totalItems: number;
                  processedItems: number;
                  successfulItems: number;
                  failedItems: number;
                  currentItem: string | null;
              }
            | undefined;
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const jobs = (await (
                await fetch(`${baseUrl}/api/jobs`)
            ).json()) as Array<NonNullable<typeof completedJob>>;
            completedJob = jobs.find((job) => job.id === accepted.jobId);
            if (
                completedJob?.status === 'failed' ||
                completedJob?.status === 'success'
            ) {
                break;
            }
            await Bun.sleep(20);
        }

        expect(completedJob?.status).toBe('failed');
        expect(completedJob?.trigger).toBe('manual');
        expect(completedJob?.totalItems).toBe(3);
        expect(completedJob?.processedItems).toBe(3);
        expect(completedJob?.successfulItems).toBe(2);
        expect(completedJob?.failedItems).toBe(1);
        expect(completedJob?.currentItem).toBeNull();
        expect(await Bun.file(join(destPath, '20260103', 'third.txt')).text()).toBe(
            'third'
        );
    });

    test('rejects invalid or missing manual copy directories', async () => {
        const invalid = await fetch(`${baseUrl}/api/jobs/copy-directories`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ directories: ['20260230'] }),
        });
        const missing = await fetch(`${baseUrl}/api/jobs/copy-directories`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ directories: ['20260104'] }),
        });
        const empty = await fetch(`${baseUrl}/api/jobs/copy-directories`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ directories: [] }),
        });

        expect(invalid.status).toBe(400);
        expect(missing.status).toBe(400);
        expect(empty.status).toBe(400);
    });

    test('queues a manual synchronization for the current day', async () => {
        const response = await fetch(`${baseUrl}/api/jobs/copy-today`, {
            method: 'POST',
        });
        const accepted = (await response.json()) as { name: string };
        const expectedName = `copy-current-${getDateNDaysAgo(0)}`;

        expect(response.status).toBe(202);
        expect(accepted.name).toBe(expectedName);

        let completed = false;
        for (let attempt = 0; attempt < 50; attempt += 1) {
            const jobs = (await (
                await fetch(`${baseUrl}/api/jobs`)
            ).json()) as Array<{ name: string; status: string }>;
            if (
                jobs.some(
                    (job) =>
                        job.name === expectedName && job.status === 'success'
                )
            ) {
                completed = true;
                break;
            }
            await Bun.sleep(20);
        }

        expect(completed).toBe(true);
    });
});
