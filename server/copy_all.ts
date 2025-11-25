#!/usr/bin/env bun

import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getConfig } from './libs/config';
import { copyDirectory } from './services/copy.service';
import { validateAndNormalizePath } from './utils/securityUtils';
import { humanizeTime } from './utils/utils';

// Simple spinner implementation
class Spinner {
    private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private currentFrame = 0;
    private interval: Timer | null = null;
    private message = '';

    start(message: string) {
        this.message = message;
        this.interval = setInterval(() => {
            process.stdout.write(
                `\r${this.frames[this.currentFrame]} ${this.message}`
            );
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        }, 100);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        process.stdout.write('\r' + ' '.repeat(50) + '\r');
    }

    succeed(message: string) {
        this.stop();
        console.log(`✓ ${message}`);
    }

    fail(message: string) {
        this.stop();
        console.log(`✗ ${message}`);
    }
}

async function copyAll() {
    // Read config from file (not DB)
    const config = getConfig();

    // Validate paths
    const srcPath = validateAndNormalizePath(config.src);
    const destPath = validateAndNormalizePath(config.dest);

    // Read all directories from src
    const dirs = readdirSync(srcPath)
        .filter((dir) => {
            const fullPath = join(srcPath, dir);
            return statSync(fullPath).isDirectory() && /^\d{8}$/.test(dir);
        })
        .sort();

    if (dirs.length === 0) {
        console.log('No directories to copy');
        return;
    }

    console.log(`Found ${dirs.length} directories to copy\n`);

    const spinner = new Spinner();
    let completed = 0;
    let failed = 0;
    const startTime = Date.now();

    // Copy directories sequentially
    for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        if (!dir) continue;

        const index = i + 1;
        const copyStartTime = Date.now();

        spinner.start(`[${index}/${dirs.length}] Copying ${dir} folder`);

        try {
            await copyDirectory(dir);
            const copyTime = Date.now() - copyStartTime;
            const timeStr = humanizeTime(copyTime);
            completed++;
            spinner.succeed(
                `[${index}/${dirs.length}] Copied ${dir} folder (${timeStr})`
            );
        } catch (error) {
            const copyTime = Date.now() - copyStartTime;
            const timeStr = humanizeTime(copyTime);
            failed++;
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            spinner.fail(
                `[${index}/${dirs.length}] Failed to copy ${dir} folder (${timeStr}): ${errorMsg}`
            );
        }
    }

    spinner.stop();

    const totalTime = Date.now() - startTime;
    const minutes = Math.floor(totalTime / 60000);
    const seconds = Math.floor((totalTime % 60000) / 1000);

    console.log('\n=== Summary ===');
    console.log(`Total: ${dirs.length}`);
    console.log(`Completed: ${completed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Time: ${minutes}m ${seconds}s`);

    // Explicitly exit the process
    process.exit(failed > 0 ? 1 : 0);
}

// Handle SIGINT/SIGTERM
let isShuttingDown = false;

process.on('SIGINT', () => {
    if (isShuttingDown) {
        process.exit(1);
    }
    isShuttingDown = true;
    console.log('\n\nShutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    if (isShuttingDown) {
        process.exit(1);
    }
    isShuttingDown = true;
    console.log('\n\nShutting down gracefully...');
    process.exit(0);
});

// Run
copyAll().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
