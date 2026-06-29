'use client';

import { LogTable } from './LogTable';
import { formatDate, formatBytes, humanizeTime } from '@/utils/utils';
import type { CopyLog } from '@/types';

interface CopyLogsTabProps {
    logs: CopyLog[];
}

export function CopyLogsTab({ logs }: CopyLogsTabProps) {
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
                    key: 'copiedDir',
                    label: 'Директория',
                },
                {
                    key: 'filesCopied',
                    label: 'Файлов',
                },
                {
                    key: 'bytesCopied',
                    label: 'Размер',
                    render: value => formatBytes(value),
                },
                {
                    key: 'totalTime',
                    label: 'Время',
                    render: value => humanizeTime(value),
                },
            ]}
        />
    );
}

