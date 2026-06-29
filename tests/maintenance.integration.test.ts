import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
    access,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDateNDaysAgo } from '../server/utils/utils';

const temporaryDirectories: string[] = [];

async function createEnvironment() {
    const root = await mkdtemp(join(tmpdir(), 'autoexport-maintenance-'));
    temporaryDirectories.push(root);
    const src = join(root, 'src');
    const dest = join(root, 'dest');
    const configPath = join(root, 'config.json');
    const databasePath = join(root, 'autoexport.db');
    await mkdir(src);
    await mkdir(dest);
    await writeFile(
        configPath,
        JSON.stringify({
            schemaVersion: 2,
            src,
            dest,
            srcLimit: 50,
            destLimit: 80,
            cleanupDays: 90,
            quarantineDays: 1,
        })
    );
    return { root, src, dest, configPath, databasePath };
}

async function runIsolated(
    code: string,
    environment: { configPath: string; databasePath: string }
): Promise<void> {
    const mountModuleUrl = pathToFileURL(
        join(process.cwd(), 'server/services/mount.service.ts')
    ).href;
    const registeredCode = `
        const { registerConfiguredMounts } = await import(${JSON.stringify(mountModuleUrl)});
        await registerConfiguredMounts();
        ${code}
    `;
    const processHandle = Bun.spawn(['bun', '-e', registeredCode], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            CONFIG_PATH: environment.configPath,
            DATABASE_PATH: environment.databasePath,
        },
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const exitCode = await processHandle.exited;
    if (exitCode !== 0) {
        throw new Error(await new Response(processHandle.stderr).text());
    }
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) =>
            rm(directory, { recursive: true, force: true })
        )
    );
});

describe('safe maintenance workflow', () => {
    test('copies and verifies an old source directory before deletion', async () => {
        if (!Bun.which('rsync')) return;

        const environment = await createEnvironment();
        const oldDirectory = join(environment.src, '20200101');
        const todayDirectory = join(environment.src, getDateNDaysAgo(0));
        await mkdir(oldDirectory);
        await mkdir(todayDirectory);
        await writeFile(join(oldDirectory, 'export.dat'), 'important data');

        const moduleUrl = pathToFileURL(
            join(process.cwd(), 'server/services/delete.service.ts')
        ).href;
        await runIsolated(
            `
                const { spaceControlService } = await import(${JSON.stringify(moduleUrl)});
                let calls = 0;
                await spaceControlService('src', 50, {
                    getUsage: async () => ({
                        free: 0, used: 0, total: 1,
                        percentage: calls++ === 0 ? 90 : 40,
                    }),
                });
                process.exit(0);
            `,
            environment
        );

        expect(await pathExists(oldDirectory)).toBe(false);
        expect(await pathExists(join(environment.dest, '20200101', 'export.dat'))).toBe(
            true
        );
        expect(await pathExists(todayDirectory)).toBe(true);

        const database = new Database(environment.databasePath);
        const log = database
            .query("SELECT action, target FROM DeleteLog WHERE action = 'threshold_delete'")
            .get() as { action: string; target: string } | null;
        database.close();
        expect(log).toEqual({ action: 'threshold_delete', target: 'src' });
    });

    test('moves an invalid directory to quarantine and removes it after retention', async () => {
        const environment = await createEnvironment();
        const invalidDirectory = join(environment.src, 'manual-notes');
        await mkdir(invalidDirectory);
        await writeFile(join(invalidDirectory, 'note.txt'), 'recoverable');

        const moduleUrl = pathToFileURL(
            join(process.cwd(), 'server/services/quarantine.service.ts')
        ).href;
        await runIsolated(
            `
                const { quarantineInvalidDirectories } = await import(${JSON.stringify(moduleUrl)});
                await quarantineInvalidDirectories('src');
                process.exit(0);
            `,
            environment
        );

        const quarantineRoot = join(
            environment.src,
            '.autoexport-quarantine'
        );
        const [entry] = await readdir(quarantineRoot);
        expect(entry).toBeDefined();
        expect(await pathExists(invalidDirectory)).toBe(false);

        const metadataPath = join(quarantineRoot, entry!, 'metadata.json');
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
            quarantinedAt: string;
        };
        metadata.quarantinedAt = new Date(
            Date.now() - 2 * 24 * 60 * 60 * 1000
        ).toISOString();
        await writeFile(metadataPath, JSON.stringify(metadata));

        await runIsolated(
            `
                const { cleanupQuarantine } = await import(${JSON.stringify(moduleUrl)});
                await cleanupQuarantine('src');
                process.exit(0);
            `,
            environment
        );

        expect(await readdir(quarantineRoot)).toEqual([]);
    });
});
