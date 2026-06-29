import { lstat } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { assertPathWithinRoot } from './securityUtils';

export async function deleteDir(root: string, candidate: string): Promise<void> {
    const safePath = assertPathWithinRoot(root, candidate);
    const stats = await lstat(safePath);

    if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error(`Refusing to delete a non-directory path: ${safePath}`);
    }

    await rm(safePath, { recursive: true, force: false });
}
