import { $ } from 'bun';

export async function deleteDir(path: string): Promise<void> {
    await $`rm -rf ${path}`.quiet();
}

