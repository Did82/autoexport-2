import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/DatePicker';
import { useEffect, useMemo, useState } from 'react';

export interface LogColumn<T> {
    key: keyof T;
    label: string;
    render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface LogTableProps<T> {
    data: T[];
    columns: Array<LogColumn<T>>;
    pageSize?: number;
}

export function LogTable<T extends { id?: string }>({
    data,
    columns,
    pageSize = 25,
}: LogTableProps<T>) {
    const [page, setPage] = useState(1);
    const [sortKey, setSortKey] = useState<keyof T | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [filterDir, setFilterDir] = useState('');
    const [filterDate, setFilterDate] = useState('');

    const filteredData = useMemo(() => {
        let result = [...data];

        if (filterDir) {
            const directoryKey = columns.find((column) =>
                String(column.key).toLowerCase().includes('dir')
            )?.key;
            if (directoryKey) {
                const query = filterDir.toLowerCase();
                result = result.filter((row) =>
                    String(row[directoryKey]).toLowerCase().includes(query)
                );
            }
        }

        if (filterDate) {
            const dateKey = columns.find(
                (column) => column.key === 'createdAt'
            )?.key;
            if (dateKey) {
                result = result.filter((row) =>
                    String(row[dateKey]).startsWith(filterDate)
                );
            }
        }

        if (sortKey) {
            result.sort((left, right) => {
                const leftValue = left[sortKey];
                const rightValue = right[sortKey];
                const comparison =
                    leftValue < rightValue
                        ? -1
                        : leftValue > rightValue
                          ? 1
                          : 0;
                return sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [columns, data, filterDate, filterDir, sortDirection, sortKey]);

    const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const paginatedData = filteredData.slice(
        (safePage - 1) * pageSize,
        safePage * pageSize
    );

    useEffect(() => {
        if (page !== safePage) setPage(safePage);
    }, [page, safePage]);

    const handleSort = (key: keyof T) => {
        if (sortKey === key) {
            setSortDirection((direction) =>
                direction === 'asc' ? 'desc' : 'asc'
            );
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Input
                    type="search"
                    placeholder="Фильтр по директории"
                    value={filterDir}
                    onChange={(event) => {
                        setFilterDir(event.target.value);
                        setPage(1);
                    }}
                    className="sm:max-w-xs"
                />
                <div className="sm:w-[250px]">
                    <DatePicker
                        value={filterDate}
                        onChange={(value) => {
                            setFilterDate(value);
                            setPage(1);
                        }}
                        placeholder="Фильтр по дате"
                    />
                </div>
                {filterDir || filterDate ? (
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
                ) : null}
            </div>

            <div className="overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            {columns.map((column) => (
                                <th
                                    key={String(column.key)}
                                    className="px-4 py-2 text-left font-medium"
                                    aria-sort={
                                        sortKey === column.key
                                            ? sortDirection === 'asc'
                                                ? 'ascending'
                                                : 'descending'
                                            : 'none'
                                    }
                                >
                                    <button
                                        type="button"
                                        className="flex items-center gap-2 whitespace-nowrap hover:text-primary"
                                        onClick={() => handleSort(column.key)}
                                    >
                                        {column.label}
                                        {sortKey === column.key ? (
                                            <span aria-hidden="true">
                                                {sortDirection === 'asc'
                                                    ? '↑'
                                                    : '↓'}
                                            </span>
                                        ) : null}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.length > 0 ? (
                            paginatedData.map((row, rowIndex) => (
                                <tr
                                    key={row.id ?? `${safePage}-${rowIndex}`}
                                    className="border-b last:border-0 hover:bg-muted/50"
                                >
                                    {columns.map((column) => (
                                        <td
                                            key={String(column.key)}
                                            className="max-w-md px-4 py-2 align-top"
                                        >
                                            {column.render
                                                ? column.render(
                                                      row[column.key],
                                                      row
                                                  )
                                                : String(
                                                      row[column.key] ?? ''
                                                  )}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-4 py-10 text-center text-muted-foreground"
                                >
                                    Записей не найдено
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <div className="text-sm text-muted-foreground">
                    Показано {paginatedData.length} из {filteredData.length}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            setPage((current) => Math.max(1, current - 1))
                        }
                        disabled={safePage === 1}
                    >
                        Назад
                    </Button>
                    <span className="px-2 text-sm">
                        {safePage} из {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            setPage((current) =>
                                Math.min(totalPages, current + 1)
                            )
                        }
                        disabled={safePage >= totalPages}
                    >
                        Вперёд
                    </Button>
                </div>
            </div>
        </div>
    );
}
