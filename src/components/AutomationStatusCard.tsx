import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs';
import type {
    JobRun,
    JobStatus,
    MountStatus,
    ScheduleSnapshot,
} from '@/types';
import { formatDate } from '@/utils/utils';
import { AlertCircleIcon, LoaderCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { ManualCopyPanel } from './ManualCopyPanel';
import { SchedulePanel } from './SchedulePanel';

interface AutomationStatusCardProps {
    jobs: JobRun[];
    mounts: MountStatus[];
    schedule: ScheduleSnapshot | null;
    onJobQueued: () => void;
}

const JOB_LABELS: Record<JobStatus, string> = {
    queued: 'В очереди',
    running: 'Выполняется',
    success: 'Готово',
    failed: 'Ошибка',
    interrupted: 'Прервано',
};

const MOUNT_LABELS: Record<MountStatus['status'], string> = {
    ok: 'Проверено',
    unverified: 'Не зарегистрировано',
    unavailable: 'Недоступно',
    mismatch: 'Другой диск',
};

function jobBadgeVariant(status: JobStatus) {
    if (status === 'failed' || status === 'interrupted') return 'destructive';
    if (status === 'running') return 'default';
    return status === 'success' ? 'secondary' : 'outline';
}

function jobTimestamp(job: JobRun): string {
    return job.finishedAt ?? job.startedAt ?? job.queuedAt;
}

function jobProgress(job: JobRun): number {
    if (!job.totalItems) return 0;
    return Math.min(
        100,
        Math.round(((job.processedItems ?? 0) / job.totalItems) * 100)
    );
}

export function AutomationStatusCard({
    jobs,
    mounts,
    schedule,
    onJobQueued,
}: AutomationStatusCardProps) {
    const [activeTab, setActiveTab] = useState('jobs');
    const unavailable = mounts.filter((mount) => mount.status !== 'ok');
    const storageReady =
        mounts.length === 2 && mounts.every((mount) => mount.status === 'ok');
    const activeJobs = jobs.filter(
        (job) => job.status === 'queued' || job.status === 'running'
    );

    const handleJobQueued = () => {
        setActiveTab('jobs');
        onJobQueued();
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Состояние автоматики</CardTitle>
                <CardDescription>
                    Подключения, очередь, ручное копирование и расписание
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {unavailable.length > 0 ? (
                    <Alert variant="destructive">
                        <AlertCircleIcon />
                        <AlertTitle>Файловые операции остановлены</AlertTitle>
                        <AlertDescription>
                            Откройте настройки и сохраните их после подключения
                            нужных дисков.
                        </AlertDescription>
                    </Alert>
                ) : null}

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="w-full max-w-full justify-start overflow-x-auto sm:w-auto">
                        <TabsTrigger value="jobs">Задания</TabsTrigger>
                        <TabsTrigger value="manual">Ручной запуск</TabsTrigger>
                        <TabsTrigger value="schedule">Расписание</TabsTrigger>
                    </TabsList>

                    <TabsContent value="jobs" className="flex flex-col gap-5 pt-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {mounts.map((mount) => (
                                <div
                                    key={mount.target}
                                    className="flex min-w-0 items-start justify-between gap-3 rounded-lg border p-3"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium">
                                            {mount.target === 'src'
                                                ? 'Источник'
                                                : 'Хранилище'}
                                        </p>
                                        <p
                                            className="truncate text-xs text-muted-foreground"
                                            title={mount.root}
                                        >
                                            {mount.root}
                                        </p>
                                    </div>
                                    <Badge
                                        variant={
                                            mount.status === 'ok'
                                                ? 'secondary'
                                                : 'destructive'
                                        }
                                    >
                                        {MOUNT_LABELS[mount.status]}
                                    </Badge>
                                </div>
                            ))}
                        </div>

                        <Separator />

                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium">Задания</p>
                                {activeJobs.length > 0 ? (
                                    <Badge>
                                        <LoaderCircleIcon className="animate-spin" />
                                        Активно: {activeJobs.length}
                                    </Badge>
                                ) : (
                                    <Badge variant="outline">
                                        Очередь свободна
                                    </Badge>
                                )}
                            </div>

                            {jobs.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Запусков пока не было.
                                </p>
                            ) : (
                                <div className="flex flex-col divide-y rounded-lg border">
                                    {jobs.slice(0, 5).map((job) => (
                                        <div
                                            key={job.id}
                                            className="flex flex-col gap-3 p-3"
                                        >
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium">
                                                        {job.name}
                                                    </p>
                                                    <p
                                                        className="truncate text-xs text-muted-foreground"
                                                        title={job.error ?? undefined}
                                                    >
                                                        {formatDate(
                                                            jobTimestamp(job)
                                                        )}
                                                        {job.error
                                                            ? ` · ${job.error}`
                                                            : ''}
                                                    </p>
                                                </div>
                                                <Badge
                                                    variant={jobBadgeVariant(
                                                        job.status
                                                    )}
                                                >
                                                    {job.stale
                                                        ? 'Нет heartbeat'
                                                        : JOB_LABELS[job.status]}
                                                </Badge>
                                            </div>

                                            {job.totalItems !== null ? (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                                        <span>
                                                            Обработано{' '}
                                                            {job.processedItems ?? 0}{' '}
                                                            из {job.totalItems}
                                                        </span>
                                                        <span>
                                                            Успешно:{' '}
                                                            {job.successfulItems ?? 0}
                                                            {' · '}Ошибок:{' '}
                                                            {job.failedItems ?? 0}
                                                        </span>
                                                    </div>
                                                    <Progress
                                                        value={jobProgress(job)}
                                                        aria-label={`Прогресс задания: ${job.processedItems ?? 0} из ${job.totalItems}`}
                                                    />
                                                    {job.currentItem ? (
                                                        <p className="text-xs text-muted-foreground">
                                                            Сейчас: {job.currentItem}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="manual">
                        <ManualCopyPanel
                            active={activeTab === 'manual'}
                            storageReady={storageReady}
                            onQueued={handleJobQueued}
                        />
                    </TabsContent>

                    <TabsContent value="schedule">
                        <SchedulePanel schedule={schedule} />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
