import { serve } from 'bun';
import { Cron } from 'croner';
import { existsSync } from 'node:fs';
import index from '../src/index.html';
import { APP_TIMEZONE, getConfig } from './libs/config';
import { checkDatabase, dbHelpers, initSchema } from './libs/db';
import { cleanupOldLogs } from './services/cleanup.service';
import {
    getConfigService,
    updateConfigService,
} from './services/config.service';
import { copyDirectory } from './services/copy.service';
import { spaceControlService } from './services/delete.service';
import { enqueueFileJob } from './services/job-queue.service';
import {
    cleanupQuarantine,
    quarantineInvalidDirectories,
} from './services/quarantine.service';
import { getDateNDaysAgo, getDiskUsage } from './utils/utils';

function errorResponse(error: unknown, status = 500): Response {
    return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status }
    );
}

export const routes = {
    '/api/config': {
        GET: () => {
            try {
                return Response.json(getConfigService());
            } catch (error) {
                return errorResponse(error);
            }
        },
        POST: async (request: Request) => {
            try {
                const contentType = request.headers.get('content-type') ?? '';
                if (!contentType.includes('application/json')) {
                    return errorResponse(
                        new Error('Content-Type must be application/json'),
                        415
                    );
                }

                return Response.json(
                    await updateConfigService(await request.json())
                );
            } catch (error) {
                return errorResponse(error, 400);
            }
        },
    },

    '/api/space': {
        GET: async () => {
            try {
                const config = getConfig();
                const emptyUsage = (error: unknown) => ({
                    free: 0,
                    used: 0,
                    total: 0,
                    percentage: 0,
                    error: error instanceof Error ? error.message : String(error),
                });
                const [srcDiskUsage, targetDiskUsage] = await Promise.all([
                    getDiskUsage(config.src).catch(emptyUsage),
                    getDiskUsage(config.dest).catch(emptyUsage),
                ]);

                return Response.json({ srcDiskUsage, targetDiskUsage });
            } catch (error) {
                return errorResponse(error);
            }
        },
    },

    '/api/copy': {
        GET: () => {
            try {
                return Response.json(dbHelpers.getCopyLogs());
            } catch (error) {
                return errorResponse(error);
            }
        },
    },

    '/api/delete': {
        GET: () => {
            try {
                return Response.json(dbHelpers.getDeleteLogs());
            } catch (error) {
                return errorResponse(error);
            }
        },
    },

    '/api/errors': {
        GET: () => {
            try {
                return Response.json(dbHelpers.getErrorLogs());
            } catch (error) {
                return errorResponse(error);
            }
        },
    },

    '/api/health': {
        GET: () => {
            try {
                const config = getConfig();
                const checks = {
                    database: checkDatabase() ? 'ok' : 'error',
                    src: existsSync(config.src) ? 'ok' : 'unavailable',
                    dest: existsSync(config.dest) ? 'ok' : 'unavailable',
                };
                const status =
                    checks.database === 'ok' &&
                    checks.src === 'ok' &&
                    checks.dest === 'ok'
                        ? 'ok'
                        : 'degraded';

                return Response.json({ status, checks });
            } catch (error) {
                return errorResponse(error, 503);
            }
        },
    },
};

function scheduled(name: string, task: () => Promise<void>): void {
    enqueueFileJob(name, task).catch(() => undefined);
}

export function setupCronJobs(): Cron[] {
    const options = { timezone: APP_TIMEZONE };

    return [
        new Cron('0 * * * *', options, () => {
            const today = getDateNDaysAgo(0);
            scheduled(`copy-current-${today}`, () => copyDirectory(today));
        }),
        new Cron('0 22 * * *', options, () => {
            const yesterday = getDateNDaysAgo(1);
            scheduled(`copy-yesterday-${yesterday}`, () =>
                copyDirectory(yesterday)
            );
        }),
        new Cron('0 3 * * *', options, () => {
            scheduled('space-control-src', async () => {
                const config = getConfig();
                await spaceControlService('src', config.srcLimit);
            });
        }),
        new Cron('0 4 * * *', options, () => {
            scheduled('space-control-dest', async () => {
                const config = getConfig();
                await spaceControlService('dest', config.destLimit);
            });
        }),
        new Cron('0 5 * * *', options, () => {
            cleanupOldLogs().catch((error) =>
                console.error('[job:error] cleanup-logs', error)
            );
        }),
        new Cron('0 6 * * *', options, () => {
            scheduled('quarantine-maintenance', async () => {
                await quarantineInvalidDirectories('src');
                await quarantineInvalidDirectories('dest');
                await cleanupQuarantine('src');
                await cleanupQuarantine('dest');
            });
        }),
    ];
}

export function startServer(port = Number(process.env.PORT || 3001)) {
    return serve({
        port,
        routes: {
            ...routes,
            '/api/*': () =>
                Response.json({ error: 'API endpoint not found' }, { status: 404 }),
            '/*': index,
        },
        development:
            process.env.NODE_ENV !== 'production'
                ? { hmr: true, console: true }
                : false,
    });
}

if (import.meta.main) {
    initSchema();
    getConfig();
    setupCronJobs();
    const server = startServer();
    console.log(
        `AutoExport running at ${server.url} (timezone: ${APP_TIMEZONE})`
    );
}
