import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    watchFile,
    writeFileSync,
} from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CONFIG_SCHEMA_VERSION = 2 as const;
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Europe/Minsk';

export interface Config {
    schemaVersion: typeof CONFIG_SCHEMA_VERSION;
    src: string;
    dest: string;
    srcLimit: number;
    destLimit: number;
    cleanupDays: number;
    quarantineDays: number;
}

interface LegacyConfig extends Partial<Config> {
    limit?: number;
}

const CONFIG_PATH = path.resolve(
    process.env.CONFIG_PATH || path.join(process.cwd(), 'config.json')
);

let configCache: Config | null = null;
let watchingConfig = false;

function envInteger(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined) return fallback;

    const value = Number(raw);
    return Number.isInteger(value) ? value : fallback;
}

export function getDefaultConfig(): Config {
    const legacyLimit = envInteger('DISK_LIMIT', 78);

    return {
        schemaVersion: CONFIG_SCHEMA_VERSION,
        src: process.env.SRC_PATH || '/tmp/src',
        dest: process.env.DEST_PATH || '/tmp/dest',
        srcLimit: envInteger('SRC_DISK_LIMIT', legacyLimit),
        destLimit: envInteger('DEST_DISK_LIMIT', legacyLimit),
        cleanupDays: envInteger('CLEANUP_DAYS', 90),
        quarantineDays: envInteger('QUARANTINE_DAYS', 7),
    };
}

function assertIntegerInRange(
    value: unknown,
    field: string,
    min: number,
    max: number
): asserts value is number {
    if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
        throw new Error(`${field} must be an integer between ${min} and ${max}`);
    }
}

export function normalizeConfig(raw: unknown): Config {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Config must be a JSON object');
    }

    const value = raw as LegacyConfig;
    const defaults = getDefaultConfig();
    const legacyLimit = value.limit;
    const config: Config = {
        schemaVersion: CONFIG_SCHEMA_VERSION,
        src: value.src ?? defaults.src,
        dest: value.dest ?? defaults.dest,
        srcLimit: value.srcLimit ?? legacyLimit ?? defaults.srcLimit,
        destLimit: value.destLimit ?? legacyLimit ?? defaults.destLimit,
        cleanupDays: value.cleanupDays ?? defaults.cleanupDays,
        quarantineDays: value.quarantineDays ?? defaults.quarantineDays,
    };

    if (typeof config.src !== 'string' || !config.src.trim()) {
        throw new Error('src must be a non-empty string');
    }
    if (typeof config.dest !== 'string' || !config.dest.trim()) {
        throw new Error('dest must be a non-empty string');
    }

    assertIntegerInRange(config.srcLimit, 'srcLimit', 1, 100);
    assertIntegerInRange(config.destLimit, 'destLimit', 1, 100);
    assertIntegerInRange(config.cleanupDays, 'cleanupDays', 1, 365);
    assertIntegerInRange(config.quarantineDays, 'quarantineDays', 1, 30);

    return config;
}

function serialize(config: Config): string {
    return `${JSON.stringify(config, null, 2)}\n`;
}

function writeConfigAtomicSync(config: Config): void {
    mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    const temporaryPath = `${CONFIG_PATH}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, serialize(config), { mode: 0o600 });
    renameSync(temporaryPath, CONFIG_PATH);
}

async function writeConfigAtomic(config: Config): Promise<void> {
    await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    const temporaryPath = `${CONFIG_PATH}.${process.pid}.tmp`;
    await writeFile(temporaryPath, serialize(config), { mode: 0o600 });
    await rename(temporaryPath, CONFIG_PATH);
}

function loadConfig(): Config {
    if (!existsSync(CONFIG_PATH)) {
        const defaults = normalizeConfig(getDefaultConfig());
        writeConfigAtomicSync(defaults);
        return defaults;
    }

    const parsed: unknown = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    const normalized = normalizeConfig(parsed);

    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        writeConfigAtomicSync(normalized);
    }

    return normalized;
}

export function getConfig(): Config {
    if (!configCache) {
        configCache = loadConfig();
    }

    if (!watchingConfig) {
        watchFile(CONFIG_PATH, { interval: 1000 }, () => {
            configCache = null;
        });
        watchingConfig = true;
    }

    return configCache;
}

export async function updateConfig(newConfig: Config): Promise<Config> {
    const normalized = normalizeConfig(newConfig);
    await writeConfigAtomic(normalized);
    configCache = normalized;
    return normalized;
}
