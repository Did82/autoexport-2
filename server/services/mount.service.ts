import { constants } from 'node:fs';
import { access, lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfig, type Config } from '../libs/config';
import {
    dbHelpers,
    type MountIdentity,
    type StorageTarget,
} from '../libs/db';
import {
    validateAndNormalizePath,
    validateManagedRoots,
} from '../utils/securityUtils';

export const MOUNT_MARKER_NAME = '.autoexport-mount-id';

export type MountStatusCode =
    | 'ok'
    | 'unverified'
    | 'unavailable'
    | 'mismatch';

export interface MountStatus {
    target: StorageTarget;
    root: string;
    status: MountStatusCode;
    message: string;
    registeredAt?: string;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function rootFor(target: StorageTarget, config: Config): string {
    return target === 'src' ? config.src : config.dest;
}

function validateMarkerId(value: string, markerPath: string): string {
    const markerId = value.trim();
    if (!/^[a-zA-Z0-9-]{16,128}$/.test(markerId)) {
        throw new Error(`Invalid mount marker: ${markerPath}`);
    }
    return markerId;
}

async function readMarker(markerPath: string): Promise<string> {
    const stats = await lstat(markerPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new Error(`Mount marker is not a regular file: ${markerPath}`);
    }
    return validateMarkerId(await readFile(markerPath, 'utf8'), markerPath);
}

async function createOrReadMarker(root: string): Promise<string> {
    const markerPath = join(root, MOUNT_MARKER_NAME);

    try {
        return await readMarker(markerPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    const markerId = Bun.randomUUIDv7();
    try {
        await writeFile(markerPath, `${markerId}\n`, {
            flag: 'wx',
            mode: 0o600,
        });
        return markerId;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            return readMarker(markerPath);
        }
        throw error;
    }
}

async function registerTarget(
    target: StorageTarget,
    root: string
): Promise<MountIdentity> {
    await access(root, constants.R_OK | constants.W_OK);
    const identity: MountIdentity = {
        target,
        root,
        markerId: await createOrReadMarker(root),
        registeredAt: new Date().toISOString(),
    };
    dbHelpers.upsertMountIdentity(identity);
    return identity;
}

export async function registerConfiguredMounts(
    input: Config = getConfig()
): Promise<MountStatus[]> {
    const roots = validateManagedRoots(input.src, input.dest);
    await Promise.all([
        registerTarget('src', roots.src),
        registerTarget('dest', roots.dest),
    ]);
    return getMountStatuses({ ...input, ...roots });
}

export async function getMountStatus(
    target: StorageTarget,
    input: Config = getConfig()
): Promise<MountStatus> {
    const configuredRoot = rootFor(target, input);
    let root: string;
    try {
        root = validateAndNormalizePath(configuredRoot);
    } catch (error) {
        return {
            target,
            root: configuredRoot,
            status: 'unavailable',
            message: errorMessage(error),
        };
    }
    const identity = dbHelpers.getMountIdentity(target);

    if (!identity || identity.root !== root) {
        return {
            target,
            root: configuredRoot,
            status: 'unverified',
            message: 'Сохраните настройки, чтобы зарегистрировать подключённый диск',
        };
    }

    const markerPath = join(root, MOUNT_MARKER_NAME);
    try {
        await access(root, constants.R_OK | constants.W_OK);
        const markerId = await readMarker(markerPath);
        if (markerId !== identity.markerId) {
            return {
                target,
                root: configuredRoot,
                status: 'mismatch',
                message: 'Маркер диска не совпадает с зарегистрированным',
                registeredAt: identity.registeredAt,
            };
        }

        return {
            target,
            root: configuredRoot,
            status: 'ok',
            message: 'Маркер диска проверен',
            registeredAt: identity.registeredAt,
        };
    } catch (error) {
        return {
            target,
            root: configuredRoot,
            status: 'unavailable',
            message: errorMessage(error),
            registeredAt: identity.registeredAt,
        };
    }
}

export function getMountStatuses(input: Config = getConfig()): Promise<MountStatus[]> {
    return Promise.all([
        getMountStatus('src', input),
        getMountStatus('dest', input),
    ]);
}

export async function assertMountReady(
    target: StorageTarget,
    input: Config = getConfig()
): Promise<void> {
    const status = await getMountStatus(target, input);
    if (status.status !== 'ok') {
        const label = target === 'src' ? 'Источник' : 'Хранилище';
        throw new Error(
            `${label} не готово к работе (${status.status}): ${status.message}`
        );
    }
}
