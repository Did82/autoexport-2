import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root = '';
let baseUrl = '';
let server: ReturnType<typeof Bun.spawn> | null = null;

async function waitForServer(url: string): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
            const response = await fetch(`${url}/api/health`);
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
    const src = join(root, 'src');
    const dest = join(root, 'dest');
    const configPath = join(root, 'config.json');
    await mkdir(src);
    await mkdir(dest);
    await writeFile(
        configPath,
        JSON.stringify({ src, dest, limit: 63, cleanupDays: 90 })
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
});
