import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
});
