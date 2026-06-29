import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export function validateAndNormalizePath(input: string): string {
    if (typeof input !== 'string' || !input.trim()) {
        throw new Error('Path must be a non-empty string');
    }
    if (!isAbsolute(input)) {
        throw new Error('Path must be absolute');
    }

    const absolute = resolve(input);
    if (!existsSync(absolute)) {
        throw new Error(`Path does not exist: ${absolute}`);
    }

    const stats = lstatSync(absolute);
    if (stats.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed: ${absolute}`);
    }
    if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${absolute}`);
    }

    return realpathSync(absolute);
}

function isNestedPath(parent: string, child: string): boolean {
    const pathFromParent = relative(parent, child);
    return (
        pathFromParent !== '' &&
        pathFromParent !== '..' &&
        !pathFromParent.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
        !isAbsolute(pathFromParent)
    );
}

export function validateManagedRoots(src: string, dest: string): {
    src: string;
    dest: string;
} {
    const normalizedSrc = validateAndNormalizePath(src);
    const normalizedDest = validateAndNormalizePath(dest);

    if (
        normalizedSrc === normalizedDest ||
        isNestedPath(normalizedSrc, normalizedDest) ||
        isNestedPath(normalizedDest, normalizedSrc)
    ) {
        throw new Error('Source and destination must be distinct, non-nested directories');
    }

    return { src: normalizedSrc, dest: normalizedDest };
}

export function assertPathWithinRoot(root: string, candidate: string): string {
    const normalizedRoot = resolve(root);
    const normalizedCandidate = resolve(candidate);
    const pathFromRoot = relative(normalizedRoot, normalizedCandidate);

    if (
        pathFromRoot === '' ||
        pathFromRoot === '..' ||
        pathFromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
        isAbsolute(pathFromRoot)
    ) {
        throw new Error(`Refusing to operate outside managed root: ${candidate}`);
    }

    return normalizedCandidate;
}
