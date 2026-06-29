'use client';

import { LogTable } from './LogTable';
import { formatDate, humanizeTime } from '@/utils/utils';
import type { DeleteLog } from '@/types';

interface DeleteLogsTabProps {
    logs: DeleteLog[];
}

export function DeleteLogsTab({ logs }: DeleteLogsTabProps) {
    return (
        <LogTable
            data={logs}
            columns={[
                {
                    key: 'createdAt',
                    label: 'Дата',
                    render: value => formatDate(value),
                },
                {
                    key: 'deletedDir',
                    label: 'Удаленная директория',
                },
                {
                    key: 'totalTime',
                    label: 'Время',
                    render: value => humanizeTime(value),
                },
                {
                    key: 'percentageAfterDelete',
                    label: 'Использование после удаления',
                    render: value => `${value}%`,
                },
            ]}
        />
    );
}

