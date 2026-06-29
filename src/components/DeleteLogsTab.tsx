import { Badge } from '@/components/ui/badge';
import type { DeleteLog } from '@/types';
import { formatDate, humanizeTime } from '@/utils/utils';
import { useMemo } from 'react';
import { LogTable, type LogColumn } from './LogTable';

interface DeleteLogsTabProps {
    logs: DeleteLog[];
}

const ACTION_LABELS: Record<DeleteLog['action'], string> = {
    threshold_delete: 'Удалено по лимиту',
    quarantine_move: 'В карантин',
    quarantine_delete: 'Удалено из карантина',
    blocked_delete: 'Удаление заблокировано',
};

export function DeleteLogsTab({ logs }: DeleteLogsTabProps) {
    const columns = useMemo<Array<LogColumn<DeleteLog>>>(
        () => [
            {
                key: 'createdAt',
                label: 'Дата',
                render: (value) => formatDate(String(value)),
            },
            {
                key: 'action',
                label: 'Операция',
                render: (value) => {
                    const action = value as DeleteLog['action'];
                    return (
                        <Badge
                            variant={
                                action === 'blocked_delete'
                                    ? 'destructive'
                                    : 'secondary'
                            }
                        >
                            {ACTION_LABELS[action] ?? String(action)}
                        </Badge>
                    );
                },
            },
            {
                key: 'target',
                label: 'Хранилище',
                render: (value) =>
                    value === 'src'
                        ? 'Сервер'
                        : value === 'dest'
                          ? 'Хранилище'
                          : 'Неизвестно',
            },
            { key: 'deletedDir', label: 'Путь' },
            {
                key: 'totalTime',
                label: 'Время',
                render: (value) => humanizeTime(Number(value)),
            },
            {
                key: 'percentageAfterDelete',
                label: 'Диск после операции',
                render: (value) => `${Number(value)}%`,
            },
            {
                key: 'message',
                label: 'Комментарий',
                render: (value) => String(value ?? '—'),
            },
        ],
        []
    );

    return <LogTable data={logs} columns={columns} />;
}
