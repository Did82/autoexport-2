import type { ErrorLog } from '@/types';
import { formatDate } from '@/utils/utils';
import { useMemo } from 'react';
import { LogTable, type LogColumn } from './LogTable';

interface ErrorLogsTabProps {
    logs: ErrorLog[];
}

export function ErrorLogsTab({ logs }: ErrorLogsTabProps) {
    const columns = useMemo<Array<LogColumn<ErrorLog>>>(
        () => [
            {
                key: 'createdAt',
                label: 'Дата',
                render: (value) => formatDate(String(value)),
            },
            { key: 'targetDir', label: 'Целевой путь' },
            { key: 'errorMsg', label: 'Ошибка' },
        ],
        []
    );

    return <LogTable data={logs} columns={columns} />;
}
