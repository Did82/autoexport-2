'use client';

import { LogTable } from './LogTable';
import { formatDate } from '@/utils/utils';
import type { ErrorLog } from '@/types';

interface ErrorLogsTabProps {
    logs: ErrorLog[];
}

export function ErrorLogsTab({ logs }: ErrorLogsTabProps) {
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
                    key: 'targetDir',
                    label: 'Целевая директория',
                },
                {
                    key: 'errorMsg',
                    label: 'Ошибка',
                },
            ]}
        />
    );
}

