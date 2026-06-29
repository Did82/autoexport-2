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

export function Dashboard({ configRevision }: DashboardProps) {
    const [spaceData, setSpaceData] = useState<SpaceData | null>(null);
    const [config, setConfig] = useState<Config | null>(null);
    const [copyLogs, setCopyLogs] = useState<CopyLog[]>([]);
    const [deleteLogs, setDeleteLogs] = useState<DeleteLog[]>([]);
    const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
    const [jobs, setJobs] = useState<JobRun[]>([]);
    const [mounts, setMounts] = useState<MountStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(false);

    const loadData = useCallback(async (showLoading = false) => {
        if (showLoading) setLoading(true);
        setError(null);

        try {
            const [space, configData, copy, maintenance, errors, jobRuns, mountStatuses] =
                await Promise.all([
                    fetchAPI<SpaceData>('/api/space'),
                    fetchAPI<Config>('/api/config'),
                    fetchAPI<CopyLog[]>('/api/copy'),
                    fetchAPI<DeleteLog[]>('/api/delete'),
                    fetchAPI<ErrorLog[]>('/api/errors'),
                    fetchAPI<JobRun[]>('/api/jobs'),
                    fetchAPI<MountStatus[]>('/api/mounts'),
                ]);

            setSpaceData(space);
            setConfig(configData);
            setCopyLogs(copy);
            setDeleteLogs(maintenance);
            setErrorLogs(errors);
            setJobs(jobRuns);
            setMounts(mountStatuses);
        } catch (loadError) {
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : 'Не удалось загрузить данные'
            );
        } finally {
            if (showLoading) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData(true);
    }, [loadData]);

    useEffect(() => {
        if (configRevision > 0) void loadData();
    }, [configRevision, loadData]);

    useEffect(() => {
        if (!autoRefresh) return;
        const interval = window.setInterval(() => void loadData(), 30_000);
        return () => window.clearInterval(interval);
    }, [autoRefresh, loadData]);

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

            <AutomationStatusCard jobs={jobs} mounts={mounts} />

            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                    <CardTitle>Журнал операций</CardTitle>
                    <Field orientation="horizontal" className="w-auto">
                        <FieldLabel htmlFor="auto-refresh">
                            Автообновление
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
