import { existsSync, readFileSync, watchFile } from 'fs';

export interface Config {
    src: string;
    dest: string;
    limit: number;
    cleanupDays: number;
}

let configCache: Config | null = null;
let configWatcher: ReturnType<typeof watchFile> | null = null;

const CONFIG_PATH = Bun.resolveSync('config.json', process.cwd());

function loadConfig(): Config {
    if (existsSync(CONFIG_PATH)) {
        // Use Bun.file() for reading JSON (more efficient)
        // But since we need sync access, we'll use readFileSync for now
        // and Bun.write() for async writes
        const content = readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(content);
    }
    
    // Default config
    const defaultConfig: Config = {
        src: process.env.SRC_PATH || '/tmp/src',
        dest: process.env.DEST_PATH || '/tmp/dest',
        limit: parseInt(process.env.DISK_LIMIT || '78', 10),
        cleanupDays: parseInt(process.env.CLEANUP_DAYS || '90', 10),
    };
    
    // Create config file if it doesn't exist (use Bun.write for async efficiency)
    Bun.write(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2)).catch(() => {});
    return defaultConfig;
}

export function getConfig(): Config {
    if (!configCache) {
        configCache = loadConfig();
        
        // Watch for changes
        if (!configWatcher) {
            configWatcher = watchFile(CONFIG_PATH, () => {
                configCache = null; // Invalidate cache
            });
        }
    }
    return configCache;
}

export async function updateConfig(newConfig: Partial<Config>): Promise<Config> {
    const current = getConfig();
    const updated: Config = {
        ...current,
        ...newConfig,
    };
    
    // Use Bun.write() instead of writeFileSync (more efficient, async)
    await Bun.write(CONFIG_PATH, JSON.stringify(updated, null, 2));
    configCache = updated; // Update cache
    
    return updated;
}

