import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
    Config,
    CopyLog,
    DeleteLog,
    DiskUsage,
    ErrorLog,
    JobRun,
    MountStatus,
    ScheduleSnapshot,
} from '@/types';
import { fetchAPI } from '@/utils/api';
import { AlertCircleIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { CopyLogsTab } from './CopyLogsTab';
import { AutomationStatusCard } from './AutomationStatusCard';
import { DeleteLogsTab } from './DeleteLogsTab';
import { DiskUsageCard } from './DiskUsageCard';
import { ErrorLogsTab } from './ErrorLogsTab';

interface DashboardProps {
    configRevision: number;
}

interface SpaceData {
    srcDiskUsage: DiskUsage;
    targetDiskUsage: DiskUsage;
}

const STATUS_REFRESH_MS = 5_000;
const LOG_REFRESH_MS = 30_000;

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : 'Не удалось загрузить данные';
}

export function Dashboard({ configRevision }: DashboardProps) {
    const [spaceData, setSpaceData] = useState<SpaceData | null>(null);
    const [config, setConfig] = useState<Config | null>(null);
    const [copyLogs, setCopyLogs] = useState<CopyLog[]>([]);
    const [deleteLogs, setDeleteLogs] = useState<DeleteLog[]>([]);
    const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
    const [jobs, setJobs] = useState<JobRun[]>([]);
    const [mounts, setMounts] = useState<MountStatus[]>([]);
    const [schedule, setSchedule] = useState<ScheduleSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(false);

    const reportError = useCallback((loadError: unknown) => {
        if (!isAbortError(loadError)) setError(describeError(loadError));
    }, []);

    const loadConfiguration = useCallback(async (signal?: AbortSignal) => {
        const configData = await fetchAPI<Config>('/api/config', { signal });
        if (!signal?.aborted) setConfig(configData);
    }, []);

    const loadLogs = useCallback(async (signal?: AbortSignal) => {
        const [copy, maintenance, errors] = await Promise.all([
            fetchAPI<CopyLog[]>('/api/copy', { signal }),
            fetchAPI<DeleteLog[]>('/api/delete', { signal }),
            fetchAPI<ErrorLog[]>('/api/errors', { signal }),
        ]);
        if (signal?.aborted) return;
        setCopyLogs(copy);
        setDeleteLogs(maintenance);
        setErrorLogs(errors);
    }, []);

    const loadOperationalData = useCallback(async (signal?: AbortSignal) => {
        const [space, jobRuns, mountStatuses, scheduleSnapshot] = await Promise.all([
            fetchAPI<SpaceData>('/api/space', { signal }),
            fetchAPI<JobRun[]>('/api/jobs', { signal }),
            fetchAPI<MountStatus[]>('/api/mounts', { signal }),
            fetchAPI<ScheduleSnapshot>('/api/schedules', { signal }),
        ]);
        if (signal?.aborted) return;
        setSpaceData(space);
        setJobs(jobRuns);
        setMounts(mountStatuses);
        setSchedule(scheduleSnapshot);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setLoading(true);
        setError(null);

        void Promise.allSettled([
            loadConfiguration(controller.signal),
            loadLogs(controller.signal),
            loadOperationalData(controller.signal),
        ]).then((results) => {
            if (!active) return;
            const rejected = results.find(
                (result): result is PromiseRejectedResult =>
                    result.status === 'rejected' &&
                    !isAbortError(result.reason)
            );
            if (rejected) reportError(rejected.reason);
            setLoading(false);
        });

        return () => {
            active = false;
            controller.abort();
        };
    }, [loadConfiguration, loadLogs, loadOperationalData, reportError]);

    useEffect(() => {
        if (configRevision <= 0) return;
        const controller = new AbortController();
        setError(null);
        void Promise.all([
            loadConfiguration(controller.signal),
            loadOperationalData(controller.signal),
        ]).catch(reportError);
        return () => controller.abort();
    }, [configRevision, loadConfiguration, loadOperationalData, reportError]);

    useEffect(() => {
        let controller: AbortController | null = null;
        const refresh = () => {
            controller?.abort();
            controller = new AbortController();
            void loadOperationalData(controller.signal)
                .then(() => setError(null))
                .catch(reportError);
        };
        const interval = window.setInterval(refresh, STATUS_REFRESH_MS);
        return () => {
            window.clearInterval(interval);
            controller?.abort();
        };
    }, [loadOperationalData, reportError]);

    useEffect(() => {
        if (!autoRefresh) return;
        let controller: AbortController | null = null;
        const refresh = () => {
            controller?.abort();
            controller = new AbortController();
            void loadLogs(controller.signal).catch(reportError);
        };
        refresh();
        const interval = window.setInterval(refresh, LOG_REFRESH_MS);
        return () => {
            window.clearInterval(interval);
            controller?.abort();
        };
    }, [autoRefresh, loadLogs, reportError]);

    const handleJobQueued = useCallback(() => {
        void loadOperationalData().catch(reportError);
    }, [loadOperationalData, reportError]);

    if (loading) {
        return (
            <main className="container mx-auto flex flex-col gap-6 px-4 py-8">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <Skeleton className="h-64" />
                    <Skeleton className="h-64" />
                </div>
                <Skeleton className="h-96" />
            </main>
        );
    }

    if (!spaceData || !config) {
        return (
            <main className="container mx-auto px-4 py-8">
                <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>Данные недоступны</AlertTitle>
                    <AlertDescription>
                        {error ?? 'Сервер вернул неполный ответ'}
                    </AlertDescription>
                </Alert>
            </main>
        );
    }

    return (
        <main className="container mx-auto flex flex-col gap-6 px-4 py-8">
            {error ? (
                <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>Не удалось обновить данные</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : null}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <DiskUsageCard
                    title="Сервер"
                    diskUsage={spaceData.srcDiskUsage}
                    limit={config.srcLimit}
                />
                <DiskUsageCard
                    title="Хранилище"
                    diskUsage={spaceData.targetDiskUsage}
                    limit={config.destLimit}
                />
            </div>

            <AutomationStatusCard
                jobs={jobs}
                mounts={mounts}
                schedule={schedule}
                onJobQueued={handleJobQueued}
            />

            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                    <CardTitle>Журнал операций</CardTitle>
                    <Field orientation="horizontal" className="w-auto">
                        <FieldLabel htmlFor="auto-refresh">
                            Автообновление журналов
                        </FieldLabel>
                        <Switch
                            id="auto-refresh"
                            checked={autoRefresh}
                            onCheckedChange={setAutoRefresh}
                            aria-label="Автоматически обновлять журнал"
                        />
                    </Field>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="copy">
                        <TabsList className="w-full max-w-full justify-start overflow-x-auto sm:w-auto">
                            <TabsTrigger value="copy">
                                Копирование ({copyLogs.length})
                            </TabsTrigger>
                            <TabsTrigger value="delete">
                                Обслуживание ({deleteLogs.length})
                            </TabsTrigger>
                            <TabsTrigger value="errors">
                                Ошибки ({errorLogs.length})
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="copy">
                            <CopyLogsTab logs={copyLogs} />
                        </TabsContent>
                        <TabsContent value="delete">
                            <DeleteLogsTab logs={deleteLogs} />
                        </TabsContent>
                        <TabsContent value="errors">
                            <ErrorLogsTab logs={errorLogs} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </main>
    );
}
