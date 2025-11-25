import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatBytes } from '@/utils/utils';
import type { DiskUsage } from '@/types';

interface DiskUsageCardProps {
    title: string;
    diskUsage: DiskUsage;
    limit: number;
}

export function DiskUsageCard({ title, diskUsage, limit }: DiskUsageCardProps) {
    const isOverLimit = diskUsage.percentage > limit;

    if (diskUsage.error) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-destructive">Ошибка: {diskUsage.error}</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <div className="flex justify-between text-sm mb-2">
                        <span>Использовано</span>
                        <span className={isOverLimit ? 'text-destructive font-semibold' : ''}>
                            {diskUsage.percentage}%
                        </span>
                    </div>
                    <Progress value={diskUsage.percentage} className="h-2" />
                    {isOverLimit && (
                        <p className="text-xs text-destructive mt-1">
                            Превышен лимит {limit}%
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                        <div className="text-muted-foreground">Свободно</div>
                        <div className="font-semibold">{formatBytes(diskUsage.free)}</div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">Использовано</div>
                        <div className="font-semibold">{formatBytes(diskUsage.used)}</div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">Всего</div>
                        <div className="font-semibold">{formatBytes(diskUsage.total)}</div>
                    </div>
                </div>

                {diskUsage.oldestFolder && diskUsage.newestFolder && (
                    <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t">
                        <div>
                            <div className="text-muted-foreground">Самая старая</div>
                            <div className="font-semibold">{diskUsage.oldestFolder}</div>
                        </div>
                        <div>
                            <div className="text-muted-foreground">Самая новая</div>
                            <div className="font-semibold">{diskUsage.newestFolder}</div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

