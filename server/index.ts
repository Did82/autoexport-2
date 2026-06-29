import { serve } from 'bun';
import { Cron } from 'croner';
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
import {
    enqueueFileJob,
    LEASE_DURATION_MS,
    markInterruptedJobsOnStartup,
} from './services/job-queue.service';
import {
    assertMountReady,
    getMountStatuses,
    registerConfiguredMounts,
} from './services/mount.service';
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

async function readinessResponse(): Promise<Response> {
    let database: 'ok' | 'error' = 'error';
    try {
        database = checkDatabase() ? 'ok' : 'error';
    } catch {
        database = 'error';
    }

    try {
        const mounts = await getMountStatuses();
        const ready =
            database === 'ok' && mounts.every((mount) => mount.status === 'ok');
        return Response.json(
            {
                status: ready ? 'ok' : 'not_ready',
                checks: { database, mounts },
            },
            { status: ready ? 200 : 503 }
        );
    } catch (error) {
        return Response.json(
            {
                status: 'not_ready',
                checks: { database, mounts: [] },
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 503 }
        );
    }
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

                const config = await updateConfigService(await request.json());
                await registerConfiguredMounts(config);
                return Response.json(config);
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
                const guardedUsage = async (target: 'src' | 'dest', root: string) => {
                    await assertMountReady(target, config);
                    return getDiskUsage(root);
                };
                const [srcDiskUsage, targetDiskUsage] = await Promise.all([
                    guardedUsage('src', config.src).catch(emptyUsage),
                    guardedUsage('dest', config.dest).catch(emptyUsage),
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

    '/api/jobs': {
        GET: () => {
            try {
                const staleBefore = Date.now() - LEASE_DURATION_MS * 2;
                return Response.json(
                    dbHelpers.getRecentJobs(50).map((job) => ({
                        ...job,
                        stale:
                            job.status === 'running' &&
                            Date.parse(job.heartbeatAt ?? job.startedAt ?? '') <
                                staleBefore,
                    }))
                );
            } catch (error) {
                return errorResponse(error);
            }
        },
    },

    '/api/mounts': {
        GET: async () => {
            try {
                return Response.json(await getMountStatuses());
            } catch (error) {
                return errorResponse(error);
            }
        },
    },

    '/api/mounts/register': {
        POST: async () => {
            try {
                return Response.json(await registerConfiguredMounts());
            } catch (error) {
                return errorResponse(error, 400);
            }
        },
    },

    '/api/live': {
        GET: () => Response.json({ status: 'ok' }),
    },

    '/api/ready': {
        GET: readinessResponse,
    },

    '/api/health': {
        GET: readinessResponse,
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
            scheduled('cleanup-logs', cleanupOldLogs);
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
    const interruptedJobs = markInterruptedJobsOnStartup();
    if (interruptedJobs > 0) {
        console.warn(`[job:recovered] marked ${interruptedJobs} job(s) interrupted`);
    }
    setupCronJobs();
    const server = startServer();
    console.log(
        `AutoExport running at ${server.url} (timezone: ${APP_TIMEZONE})`
    );
}
