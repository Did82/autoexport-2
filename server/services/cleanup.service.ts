import { dbHelpers } from '../libs/db';
import { getConfig } from '../libs/config';

export async function cleanupOldLogs(): Promise<void> {
    const config = getConfig();
    const cutoffDate = new Date(Date.now() - config.cleanupDays * 24 * 60 * 60 * 1000);
    
    try {
        dbHelpers.deleteOldLogs(cutoffDate.toISOString());
    } catch (error) {
        // Create ErrorLog entry
        dbHelpers.insertErrorLog({
            id: Bun.randomUUIDv7(),
            createdAt: new Date().toISOString(),
            errorMsg: error instanceof Error ? error.message : String(error),
            targetDir: 'cleanup',
        });
        throw error;
    }
}

