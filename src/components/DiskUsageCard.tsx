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
import type { DiskUsage } from '@/types';
import { formatBytes } from '@/utils/utils';
import { AlertCircleIcon } from 'lucide-react';

interface DiskUsageCardProps {
    title: string;
    diskUsage: DiskUsage;
    limit: number;
}

export function DiskUsageCard({
    title,
    diskUsage,
    limit,
}: DiskUsageCardProps) {
    const isOverLimit = diskUsage.percentage > limit;

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>Порог очистки: {limit}%</CardDescription>
                    </div>
                    <Badge variant={isOverLimit ? 'destructive' : 'secondary'}>
                        {diskUsage.percentage}%
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {diskUsage.error ? (
                    <Alert variant="destructive">
                        <AlertCircleIcon />
                        <AlertTitle>Диск недоступен</AlertTitle>
                        <AlertDescription>{diskUsage.error}</AlertDescription>
                    </Alert>
                ) : (
                    <>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between gap-4 text-sm">
                                <span>Использовано</span>
                                <span className="font-medium">
                                    {formatBytes(diskUsage.used)} из{' '}
                                    {formatBytes(diskUsage.total)}
                                </span>
                            </div>
                            <Progress value={diskUsage.percentage} />
                            {isOverLimit ? (
                                <p className="text-xs text-destructive">
                                    Лимит превышен; очистка выполнится по расписанию.
                                </p>
                            ) : null}
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                            <div className="flex flex-col gap-1">
                                <span className="text-muted-foreground">
                                    Свободно
                                </span>
                                <span className="font-semibold">
                                    {formatBytes(diskUsage.free)}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-muted-foreground">
                                    Использовано
                                </span>
                                <span className="font-semibold">
                                    {formatBytes(diskUsage.used)}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-muted-foreground">
                                    Всего
                                </span>
                                <span className="font-semibold">
                                    {formatBytes(diskUsage.total)}
                                </span>
                            </div>
                        </div>

                        {diskUsage.oldestFolder && diskUsage.newestFolder ? (
                            <>
                                <Separator />
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground">
                                            Самая старая
                                        </span>
                                        <span className="font-semibold">
                                            {diskUsage.oldestFolder}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground">
                                            Самая новая
                                        </span>
                                        <span className="font-semibold">
                                            {diskUsage.newestFolder}
                                        </span>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
