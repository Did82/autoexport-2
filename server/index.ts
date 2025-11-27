import { serve } from 'bun';
import { Cron } from 'croner';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import index from '../public/index.html';
import { getConfig } from './libs/config';
import { dbHelpers, initSchema } from './libs/db';
import { cleanupOldLogs } from './services/cleanup.service';
import {
    getConfigService,
    updateConfigService,
} from './services/config.service';
import { copyDirectory } from './services/copy.service';
import {
    deleteRedundantDirectories,
    spaceControlService,
} from './services/delete.service';
import { validateAndNormalizePath } from './utils/securityUtils';
import { getDateNDaysAgo, getDiskUsage } from './utils/utils';

// Initialize database
try {
    initSchema();
} catch (error) {
    console.error('Failed to initialize database:', error);
}

// Initialize config (don't validate paths at startup)
try {
    getConfig();
} catch (error) {
    console.error('Failed to load config:', error);
}

// API Routes
const routes = {
    // Get config
    '/api/config': {
        GET: () => {
            try {
                const config = getConfigService();
                return Response.json(config);
            } catch (error) {
                return Response.json(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    { status: 500 }
                );
            }
        },
        POST: async (req: Request) => {
            try {
                const body = await req.json();
                const updated = updateConfigService(body);
                return Response.json(updated);
            } catch (error) {
                return Response.json(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    { status: 400 }
                );
            }
        },
    },

    // Get disk space usage
    '/api/space': {
        GET: async () => {
            try {
                const config = getConfig();
                const [srcDiskUsage, targetDiskUsage] = await Promise.all([
                    getDiskUsage(config.src).catch((err) => ({
                        free: 0,
                        used: 0,
                        total: 0,
                        percentage: 0,
                        oldestFolder: undefined,
                        newestFolder: undefined,
                        error: err instanceof Error ? err.message : String(err),
                    })),
                    getDiskUsage(config.dest).catch((err) => ({
                        free: 0,
                        used: 0,
                        total: 0,
                        percentage: 0,
                        oldestFolder: undefined,
                        newestFolder: undefined,
                        error: err instanceof Error ? err.message : String(err),
                    })),
                ]);
                return Response.json({
                    srcDiskUsage,
                    targetDiskUsage,
                });
            } catch (error) {
                return Response.json(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    { status: 500 }
                );
            }
        },
    },

    // Get copy logs
    '/api/copy': {
        GET: () => {
            try {
                const logs = dbHelpers.getCopyLogs();
                return Response.json(logs);
            } catch (error) {
                return Response.json(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    { status: 500 }
                );
            }
        },
    },

    // Get delete logs
    '/api/delete': {
        GET: () => {
            try {
                const logs = dbHelpers.getDeleteLogs();
                return Response.json(logs);
            } catch (error) {
                return Response.json(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    { status: 500 }
                );
            }
        },
    },

    // Get error logs
    '/api/errors': {
        GET: () => {
            try {
                const logs = dbHelpers.getErrorLogs();
                return Response.json(logs);
            } catch (error) {
                return Response.json(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    { status: 500 }
                );
            }
        },
    },

    // Get directories
    '/api/dirs': {
        GET: async (req: Request) => {
            try {
                const url = new URL(req.url);
                const pathParam = url.searchParams.get('path');

                if (!pathParam) {
                    return Response.json(
                        { error: 'path parameter is required' },
                        { status: 400 }
                    );
                }

                // Validate path (must be absolute and exist)
                const path = validateAndNormalizePath(pathParam);

                // Read directories
                const dirs = readdirSync(path)
                    .filter((dir) => {
                        const fullPath = join(path, dir);
                        return statSync(fullPath).isDirectory();
                    })
                    .sort();

                return Response.json(dirs);
            } catch (error) {
                return Response.json(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    { status: 400 }
                );
            }
        },
    },
};

// Cron jobs
const setupCronJobs = () => {
    // Every 3 minutes for testing: copy current day
    // new Cron('*/3 * * * *', () => {
    //     const today = getDateNDaysAgo(0);
    //     copyDirectory(today).catch((error) => {
    //         console.error(`Error copying ${today}:`, error);
    //     });
    // });
    // Every hour: copy current day
    new Cron('0 * * * *', () => {
        const today = getDateNDaysAgo(0);
        copyDirectory(today).catch((error) => {
            console.error(`Error copying ${today}:`, error);
        });
    });

    // Every day at 22:00: copy yesterday
    new Cron('0 22 * * *', () => {
        const yesterday = getDateNDaysAgo(1);
        copyDirectory(yesterday).catch((error) => {
            console.error(`Error copying ${yesterday}:`, error);
        });
    });

    // Every day at 03:00 (Europe/Moscow): control source disk space
    new Cron('0 3 * * *', { timezone: 'Europe/Moscow' }, () => {
        const config = getConfig();
        spaceControlService('src', config.limit).catch((error) => {
            console.error('Error controlling source disk space:', error);
        });
    });

    // Every day at 04:00: control destination disk space
    new Cron('0 4 * * *', () => {
        const config = getConfig();
        spaceControlService('dest', config.limit).catch((error) => {
            console.error('Error controlling destination disk space:', error);
        });
    });

    // Every day at 05:00: cleanup old logs
    new Cron('0 5 * * *', () => {
        cleanupOldLogs().catch((error) => {
            console.error('Error cleaning up logs:', error);
        });
    });

    // Every day at 06:00: delete redundant directories
    new Cron('0 6 * * *', () => {
        Promise.all([
            deleteRedundantDirectories('src'),
            deleteRedundantDirectories('dest'),
        ]).catch((error) => {
            console.error('Error deleting redundant directories:', error);
        });
    });
};

// Setup cron jobs
setupCronJobs();

// Start server
const server = serve({
    port: parseInt(process.env.PORT || '3001', 10),
    routes: {
        // API routes first
        ...routes,
        // Health check (after API routes)
        '/api/health': () => Response.json({ status: 'ok' }),
        // SPA fallback - must be last
        '/*': index,
    },
    development: process.env.NODE_ENV !== 'production' && {
        hmr: true,
        console: true,
    },
});

console.log(`🚀 AutoExport server running at ${server.url}`);
