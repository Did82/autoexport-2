import { serve } from 'bun';
import index from '../src/index.html';
import { APP_TIMEZONE, getConfig } from './libs/config';
import { isRsyncAvailable } from './libs/copy';
import { checkDatabase, dbHelpers, initSchema } from './libs/db';
import {
    getConfigService,
    persistConfigService,
    prepareConfigUpdate,
} from './services/config.service';
import { copyDirectory } from './services/copy.service';
import {
    enqueueFileJob,
    LEASE_DURATION_MS,
    markInterruptedJobsOnStartup,
} from './services/job-queue.service';
import {
    getSourceDirectories,
    queueManualCopyDirectories,
} from './services/manual-copy.service';
import {
    assertMountReady,
    commitMountRegistration,
    getMountStatuses,
    prepareMountRegistration,
    registerConfiguredMounts,
} from './services/mount.service';
import {
    getScheduleSnapshot,
    setupCronJobs,
} from './services/schedule.service';
import { getDateNDaysAgo, getDiskUsage } from './utils/utils';

export { setupCronJobs } from './services/schedule.service';

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
        const rsync = isRsyncAvailable() ? 'ok' : 'missing';
        const ready =
            database === 'ok' &&
            rsync === 'ok' &&
            mounts.every((mount) => mount.status === 'ok');
        return Response.json(
            {
                status: ready ? 'ok' : 'not_ready',
                checks: { database, rsync, mounts },
            },
            { status: ready ? 200 : 503 }
        );
    } catch (error) {
        return Response.json(
            {
                status: 'not_ready',
                checks: {
                    database,
                    rsync: isRsyncAvailable() ? 'ok' : 'missing',
                    mounts: [],
                },
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

                const previousConfig = getConfigService();
                const candidate = prepareConfigUpdate(await request.json());
                const identities = await prepareMountRegistration(candidate);
                let persisted = false;

                try {
                    const config = await persistConfigService(candidate);
                    persisted = true;
                    commitMountRegistration(identities);
                    return Response.json(config);
                } catch (error) {
                    if (persisted) {
                        try {
                            await persistConfigService(previousConfig);
                        } catch (rollbackError) {
                            console.error(
                                '[config:rollback-error]',
                                rollbackError
                            );
                            throw new Error(
                                `Configuration update failed and rollback was unsuccessful: ${String(error)}`
                            );
                        }
                    }
                    throw error;
                }
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

    '/api/jobs/copy-today': {
        POST: () => {
            try {
                const today = getDateNDaysAgo(0);
                const name = `copy-current-${today}`;
                enqueueFileJob(name, () => copyDirectory(today), {
                    dedupeKey: `manual-copy-today:${today}`,
                    trigger: 'manual',
                }).catch(() => undefined);
                return Response.json(
                    { status: 'queued', name },
                    { status: 202 }
                );
            } catch (error) {
                return errorResponse(error);
            }
        },
    },

    '/api/jobs/copy-directories': {
        POST: async (request: Request) => {
            try {
                const contentType = request.headers.get('content-type') ?? '';
                if (!contentType.includes('application/json')) {
                    return errorResponse(
                        new Error('Content-Type must be application/json'),
                        415
                    );
                }

                const payload = await request.json();
                if (
                    !payload ||
                    typeof payload !== 'object' ||
                    Array.isArray(payload) ||
                    Object.keys(payload).some((key) => key !== 'directories')
                ) {
                    return errorResponse(new Error('Invalid request body'), 400);
                }

                const job = await queueManualCopyDirectories(
                    (payload as { directories?: unknown }).directories
                );
                job.promise.catch(() => undefined);
                return Response.json(
                    {
                        status: 'queued',
                        jobId: job.id,
                        directoryCount: job.directoryCount,
                        coalesced: job.coalesced,
                    },
                    { status: 202 }
                );
            } catch (error) {
                return errorResponse(error, 400);
            }
        },
    },

    '/api/source-directories': {
        GET: async () => {
            try {
                return Response.json({
                    directories: await getSourceDirectories(),
                });
            } catch (error) {
                return errorResponse(error);
            }
        },
    },

    '/api/schedules': {
        GET: () => {
            try {
                return Response.json(getScheduleSnapshot());
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
