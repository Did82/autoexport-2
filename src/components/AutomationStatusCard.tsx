import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { JobRun, JobStatus, MountStatus } from '@/types';
import { formatDate } from '@/utils/utils';
import { AlertCircleIcon, LoaderCircleIcon } from 'lucide-react';

interface AutomationStatusCardProps {
    jobs: JobRun[];
    mounts: MountStatus[];
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

export function AutomationStatusCard({
    jobs,
    mounts,
}: AutomationStatusCardProps) {
    const unavailable = mounts.filter((mount) => mount.status !== 'ok');
    const activeJobs = jobs.filter(
        (job) => job.status === 'queued' || job.status === 'running'
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>Состояние автоматики</CardTitle>
                <CardDescription>
                    Подключения и последние фоновые задания
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
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
                            <Badge variant="outline">Очередь свободна</Badge>
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
                                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">
                                            {job.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDate(jobTimestamp(job))}
                                            {job.error ? ` · ${job.error}` : ''}
                                        </p>
                                    </div>
                                    <Badge
                                        variant={jobBadgeVariant(job.status)}
                                    >
                                        {job.stale ? 'Нет heartbeat' : JOB_LABELS[job.status]}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
