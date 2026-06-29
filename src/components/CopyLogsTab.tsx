import { LogTable, type LogColumn } from './LogTable';
import type { CopyLog } from '@/types';
import { formatBytes, formatDate, humanizeTime } from '@/utils/utils';
import { useMemo } from 'react';

interface CopyLogsTabProps {
    logs: CopyLog[];
}

export function CopyLogsTab({ logs }: CopyLogsTabProps) {
    const columns = useMemo<Array<LogColumn<CopyLog>>>(
        () => [
            {
                key: 'createdAt',
                label: 'Дата',
                render: (value) => formatDate(String(value)),
            },
            { key: 'copiedDir', label: 'Директория' },
            { key: 'filesCopied', label: 'Файлов' },
            {
                key: 'bytesCopied',
                label: 'Размер',
                render: (value) => formatBytes(String(value)),
            },
            {
                key: 'totalTime',
                label: 'Время',
                render: (value) => humanizeTime(Number(value)),
            },
        ],
        []
    );

    return <LogTable data={logs} columns={columns} />;
}
