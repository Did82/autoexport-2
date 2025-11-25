import { useState, useMemo } from 'react';
import { formatDate, formatBytes, humanizeTime } from '@/utils/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/DatePicker';

interface LogTableProps<T> {
    data: T[];
    columns: Array<{
        key: keyof T;
        label: string;
        render?: (value: any, row: T) => React.ReactNode;
    }>;
    pageSize?: number;
}

export function LogTable<T extends Record<string, any>>({
    data,
    columns,
    pageSize = 25,
}: LogTableProps<T>) {
    const [page, setPage] = useState(1);
    const [sortKey, setSortKey] = useState<keyof T | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [filterDir, setFilterDir] = useState<string>('');
    const [filterDate, setFilterDate] = useState<string>('');

    // Filter data
    const filteredData = useMemo(() => {
        let result = [...data];

        if (filterDir) {
            result = result.filter(row => {
                const dirKey = columns.find(c => c.key.toString().includes('Dir'))?.key;
                if (!dirKey) return true;
                return String(row[dirKey]).toLowerCase().includes(filterDir.toLowerCase());
            });
        }

        if (filterDate) {
            result = result.filter(row => {
                const dateKey = columns.find(c => c.key.toString().includes('createdAt'))?.key;
                if (!dateKey) return true;
                return String(row[dateKey]).startsWith(filterDate);
            });
        }

        // Sort
        if (sortKey) {
            result.sort((a, b) => {
                const aVal = a[sortKey];
                const bVal = b[sortKey];
                const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                return sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [data, filterDir, filterDate, sortKey, sortDirection, columns]);

    // Paginate
    const totalPages = Math.ceil(filteredData.length / pageSize);
    const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize);

    const handleSort = (key: keyof T) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-4">
                <Input
                    type="text"
                    placeholder="Фильтр по директории..."
                    value={filterDir}
                    onChange={e => {
                        setFilterDir(e.target.value);
                        setPage(1);
                    }}
                    className="max-w-xs"
                />
                <div className="w-[250px]">
                    <DatePicker
                        value={filterDate}
                        onChange={value => {
                            setFilterDate(value);
                            setPage(1);
                        }}
                        placeholder="Фильтр по дате"
                    />
                </div>
                {(filterDir || filterDate) && (
                    <Button
                        variant="outline"
                        onClick={() => {
                            setFilterDir('');
                            setFilterDate('');
                            setPage(1);
                        }}
                    >
                        Сбросить
                    </Button>
                )}
            </div>

            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="border-b">
                            {columns.map(column => (
                                <th
                                    key={String(column.key)}
                                    className="px-4 py-2 text-left cursor-pointer hover:bg-muted"
                                    onClick={() => handleSort(column.key)}
                                >
                                    <div className="flex items-center gap-2">
                                        {column.label}
                                        {sortKey === column.key && (
                                            <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((row, idx) => (
                            <tr key={idx} className="border-b hover:bg-muted/50">
                                {columns.map(column => (
                                    <td key={String(column.key)} className="px-4 py-2">
                                        {column.render
                                            ? column.render(row[column.key], row)
                                            : String(row[column.key] ?? '')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                    Показано {paginatedData.length} из {filteredData.length}
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
                        Назад
                    </Button>
                    <div className="flex items-center px-3 text-sm">
                        Страница {page} из {totalPages || 1}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                    >
                        Вперед
                    </Button>
                </div>
            </div>
        </div>
    );
}

