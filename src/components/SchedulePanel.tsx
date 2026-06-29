import { Badge } from '@/components/ui/badge';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import type { JobStatus, ScheduleSnapshot } from '@/types';
import { formatDateInTimeZone } from '@/utils/utils';
import { CalendarClockIcon, Clock3Icon } from 'lucide-react';

interface SchedulePanelProps {
    schedule: ScheduleSnapshot | null;
}

const STATUS_LABELS: Record<JobStatus, string> = {
    queued: 'В очереди',
    running: 'Выполняется',
    success: 'Готово',
    failed: 'Ошибка',
    interrupted: 'Прервано',
};

function statusVariant(status: JobStatus) {
    if (status === 'failed' || status === 'interrupted') return 'destructive';
    if (status === 'running') return 'default';
    return status === 'success' ? 'secondary' : 'outline';
}

export function SchedulePanel({ schedule }: SchedulePanelProps) {
    if (!schedule || schedule.tasks.length === 0) {
        return (
            <Empty className="mt-3 min-h-72 border">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <CalendarClockIcon />
                    </EmptyMedia>
                    <EmptyTitle>Расписание недоступно</EmptyTitle>
                    <EmptyDescription>
                        Сервер пока не вернул зарегистрированные cron-задачи.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    return (
        <div className="flex flex-col gap-4 pt-3">
            <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock3Icon />
                    Часовой пояс расписания
                </div>
                <code className="text-xs text-muted-foreground">
                    {schedule.timezone}
                </code>
            </div>

            <div className="flex flex-col divide-y rounded-lg border">
                {schedule.tasks.map((task) => {
                    const latestTimestamp = task.latestRun
                        ? task.latestRun.finishedAt ??
                          task.latestRun.startedAt ??
                          task.latestRun.queuedAt
                        : null;

                    return (
                        <article
                            key={task.id}
                            className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-medium">
                                        {task.name}
                                    </h3>
                                    {task.latestRun?.status === 'running' ||
                                    task.latestRun?.status === 'queued' ? (
                                        <Badge
                                            variant={statusVariant(
                                                task.latestRun.status
                                            )}
                                        >
                                            {STATUS_LABELS[task.latestRun.status]}
                                        </Badge>
                                    ) : null}
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {task.description}
                                </p>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">
                                        {task.scheduleLabel}
                                    </Badge>
                                    <code className="rounded bg-muted px-2 py-1 text-xs">
                                        {task.cronExpression}
                                    </code>
                                </div>
                            </div>

                            <dl className="grid shrink-0 grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:w-[27rem]">
                                <div className="rounded-md bg-muted/50 p-2">
                                    <dt className="text-muted-foreground">
                                        Следующий запуск
                                    </dt>
                                    <dd className="mt-1 font-medium">
                                        {task.nextRun
                                            ? formatDateInTimeZone(
                                                  task.nextRun,
                                                  schedule.timezone
                                              )
                                            : 'Не запланирован'}
                                    </dd>
                                </div>
                                <div className="rounded-md bg-muted/50 p-2">
                                    <dt className="text-muted-foreground">
                                        Последний запуск
                                    </dt>
                                    <dd className="mt-1 flex flex-wrap items-center gap-2 font-medium">
                                        <span>
                                            {latestTimestamp
                                                ? formatDateInTimeZone(
                                                      latestTimestamp,
                                                      schedule.timezone
                                                  )
                                                : 'Ещё не запускалась'}
                                        </span>
                                        {task.latestRun ? (
                                            <Badge
                                                variant={statusVariant(
                                                    task.latestRun.status
                                                )}
                                            >
                                                {STATUS_LABELS[
                                                    task.latestRun.status
                                                ]}
                                            </Badge>
                                        ) : null}
                                    </dd>
                                </div>
                            </dl>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
