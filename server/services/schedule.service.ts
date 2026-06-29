import { Cron } from 'croner';
import { APP_TIMEZONE, getConfig } from '../libs/config';
import { dbHelpers, type JobRun } from '../libs/db';
import { getDateNDaysAgo } from '../utils/utils';
import { cleanupOldLogs } from './cleanup.service';
import { copyDirectory } from './copy.service';
import { spaceControlService } from './delete.service';
import { enqueueFileJob } from './job-queue.service';
import {
    cleanupQuarantine,
    quarantineInvalidDirectories,
} from './quarantine.service';

interface ScheduledJob {
    name: string;
    task: () => Promise<void>;
}

export interface ScheduleDefinition {
    id: string;
    name: string;
    description: string;
    cronExpression: string;
    scheduleLabel: string;
    createJob: () => ScheduledJob;
}

export interface ScheduleLatestRun {
    id: string;
    status: JobRun['status'];
    queuedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
}

export interface ScheduleTaskSnapshot {
    id: string;
    name: string;
    description: string;
    cronExpression: string;
    scheduleLabel: string;
    nextRun: string | null;
    latestRun: ScheduleLatestRun | null;
}

export interface ScheduleSnapshot {
    timezone: string;
    tasks: ScheduleTaskSnapshot[];
}

export const SCHEDULE_DEFINITIONS: ScheduleDefinition[] = [
    {
        id: 'copy-current',
        name: 'Синхронизация текущего дня',
        description: 'Дополняет копию папки текущей даты в хранилище.',
        cronExpression: '0 * * * *',
        scheduleLabel: 'В начале каждого часа',
        createJob: () => {
            const today = getDateNDaysAgo(0);
            return {
                name: `copy-current-${today}`,
                task: () => copyDirectory(today),
            };
        },
    },
    {
        id: 'copy-yesterday',
        name: 'Финальная копия вчерашнего дня',
        description: 'Завершает синхронизацию папки предыдущей даты.',
        cronExpression: '0 22 * * *',
        scheduleLabel: 'Ежедневно в 22:00',
        createJob: () => {
            const yesterday = getDateNDaysAgo(1);
            return {
                name: `copy-yesterday-${yesterday}`,
                task: () => copyDirectory(yesterday),
            };
        },
    },
    {
        id: 'space-control-src',
        name: 'Контроль места источника',
        description: 'Освобождает место на сервере при превышении лимита.',
        cronExpression: '0 3 * * *',
        scheduleLabel: 'Ежедневно в 03:00',
        createJob: () => ({
            name: 'space-control-src',
            task: async () => {
                const config = getConfig();
                await spaceControlService('src', config.srcLimit);
            },
        }),
    },
    {
        id: 'space-control-dest',
        name: 'Контроль места хранилища',
        description: 'Освобождает место в хранилище при превышении лимита.',
        cronExpression: '0 4 * * *',
        scheduleLabel: 'Ежедневно в 04:00',
        createJob: () => ({
            name: 'space-control-dest',
            task: async () => {
                const config = getConfig();
                await spaceControlService('dest', config.destLimit);
            },
        }),
    },
    {
        id: 'cleanup-logs',
        name: 'Очистка журналов',
        description: 'Удаляет записи старше настроенного срока хранения.',
        cronExpression: '0 5 * * *',
        scheduleLabel: 'Ежедневно в 05:00',
        createJob: () => ({
            name: 'cleanup-logs',
            task: cleanupOldLogs,
        }),
    },
    {
        id: 'quarantine-maintenance',
        name: 'Обслуживание карантина',
        description: 'Перемещает нестандартные папки и очищает карантин.',
        cronExpression: '0 6 * * *',
        scheduleLabel: 'Ежедневно в 06:00',
        createJob: () => ({
            name: 'quarantine-maintenance',
            task: async () => {
                await quarantineInvalidDirectories('src');
                await quarantineInvalidDirectories('dest');
                await cleanupQuarantine('src');
                await cleanupQuarantine('dest');
            },
        }),
    },
];

let cronJobs: Cron[] = [];
const cronJobsById = new Map<string, Cron>();

function enqueueScheduledJob(definition: ScheduleDefinition): void {
    const job = definition.createJob();
    enqueueFileJob(job.name, job.task, {
        dedupeKey: job.name,
        trigger: 'cron',
        scheduleId: definition.id,
    }).catch(() => undefined);
}

export function setupCronJobs(): Cron[] {
    for (const job of cronJobs) job.stop();
    cronJobs = [];
    cronJobsById.clear();

    for (const definition of SCHEDULE_DEFINITIONS) {
        const job = new Cron(
            definition.cronExpression,
            {
                name: `autoexport-${definition.id}`,
                timezone: APP_TIMEZONE,
                unref: true,
            },
            () => enqueueScheduledJob(definition)
        );
        cronJobs.push(job);
        cronJobsById.set(definition.id, job);
    }

    return [...cronJobs];
}

function latestRun(scheduleId: string): ScheduleLatestRun | null {
    const job = dbHelpers.getLatestScheduleJob(scheduleId);
    if (!job) return null;
    return {
        id: job.id,
        status: job.status,
        queuedAt: job.queuedAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
    };
}

export function getScheduleSnapshot(): ScheduleSnapshot {
    return {
        timezone: APP_TIMEZONE,
        tasks: SCHEDULE_DEFINITIONS.map((definition) => {
            const parser =
                cronJobsById.get(definition.id) ??
                new Cron(definition.cronExpression, {
                    timezone: APP_TIMEZONE,
                    paused: true,
                });
            return {
                id: definition.id,
                name: definition.name,
                description: definition.description,
                cronExpression: definition.cronExpression,
                scheduleLabel: definition.scheduleLabel,
                nextRun: parser.nextRun()?.toISOString() ?? null,
                latestRun: latestRun(definition.id),
            };
        }),
    };
}
