import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    ToggleGroup,
    ToggleGroupItem,
} from '@/components/ui/toggle-group';
import type { SourceDirectoriesResponse } from '@/types';
import { fetchAPI } from '@/utils/api';
import { formatDirectoryDate } from '@/utils/utils';
import {
    AlertCircleIcon,
    FolderSearchIcon,
    InfoIcon,
    ListChecksIcon,
    LoaderCircleIcon,
    PlayIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DatePicker } from './DatePicker';

type SelectionMode = 'list' | 'range';

interface ManualCopyPanelProps {
    active: boolean;
    storageReady: boolean;
    onQueued: () => void;
}

interface QueueResponse {
    status: 'queued';
    jobId: string;
    directoryCount: number;
    coalesced: boolean;
}

function directoryKey(date: string): string {
    return date.replaceAll('-', '');
}

function selectionLabel(count: number): string {
    if (count === 1) return 'Выбрана 1 папка';
    if (count >= 2 && count <= 4) return `Выбрано ${count} папки`;
    return `Выбрано ${count} папок`;
}

export function ManualCopyPanel({
    active,
    storageReady,
    onQueued,
}: ManualCopyPanelProps) {
    const [directories, setDirectories] = useState<string[]>([]);
    const [mode, setMode] = useState<SelectionMode>('list');
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [search, setSearch] = useState('');
    const [rangeStart, setRangeStart] = useState('');
    const [rangeEnd, setRangeEnd] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!active) return;

        const controller = new AbortController();
        setLoading(true);
        setError(null);
        fetchAPI<SourceDirectoriesResponse>('/api/source-directories', {
            signal: controller.signal,
        })
            .then((response) => setDirectories(response.directories))
            .catch((loadError) => {
                if (!controller.signal.aborted) {
                    setError(
                        loadError instanceof Error
                            ? loadError.message
                            : 'Не удалось загрузить папки'
                    );
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [active]);

    const visibleDirectories = useMemo(() => {
        const query = search.trim().toLowerCase();
        return directories
            .toReversed()
            .filter(
                (directory) =>
                    !query ||
                    directory.includes(query) ||
                    formatDirectoryDate(directory).includes(query)
            );
    }, [directories, search]);

    const rangeInvalid = Boolean(
        rangeStart && rangeEnd && rangeStart > rangeEnd
    );
    const rangeDirectories = useMemo(() => {
        if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return [];
        const start = directoryKey(rangeStart);
        const end = directoryKey(rangeEnd);
        return directories.filter(
            (directory) => directory >= start && directory <= end
        );
    }, [directories, rangeEnd, rangeStart]);

    const selectedDirectories = useMemo(
        () =>
            mode === 'list'
                ? [...selected].toSorted()
                : rangeDirectories,
        [mode, rangeDirectories, selected]
    );

    const handleModeChange = (value: string) => {
        if (value !== 'list' && value !== 'range') return;
        setMode(value);
        setSelected(new Set());
        setRangeStart('');
        setRangeEnd('');
        setSearch('');
        setError(null);
    };

    const handleDirectoryChange = (directory: string, checked: boolean) => {
        setSelected((current) => {
            const next = new Set(current);
            if (checked) next.add(directory);
            else next.delete(directory);
            return next;
        });
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await fetchAPI<QueueResponse>('/api/jobs/copy-directories', {
                method: 'POST',
                body: JSON.stringify({ directories: selectedDirectories }),
            });
            setSelected(new Set());
            setRangeStart('');
            setRangeEnd('');
            onQueued();
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : 'Не удалось поставить копирование в очередь'
            );
        } finally {
            setSubmitting(false);
        }
    };

    const disabled =
        loading ||
        submitting ||
        !storageReady ||
        selectedDirectories.length === 0 ||
        rangeInvalid;

    return (
        <div className="flex flex-col gap-5 pt-3">
            {!storageReady ? (
                <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>Хранилища не готовы</AlertTitle>
                    <AlertDescription>
                        Подключите и зарегистрируйте оба диска перед ручным
                        копированием.
                    </AlertDescription>
                </Alert>
            ) : null}

            {error ? (
                <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>Ручной запуск недоступен</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : null}

            <Field>
                <FieldLabel id="copy-mode-label">Способ выбора</FieldLabel>
                <ToggleGroup
                    type="single"
                    value={mode}
                    onValueChange={handleModeChange}
                    variant="outline"
                    aria-labelledby="copy-mode-label"
                    className="w-full sm:w-auto"
                >
                    <ToggleGroupItem value="list" className="flex-1 sm:flex-none">
                        <ListChecksIcon />
                        Из списка
                    </ToggleGroupItem>
                    <ToggleGroupItem value="range" className="flex-1 sm:flex-none">
                        <FolderSearchIcon />
                        Диапазон дат
                    </ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                    В очередь попадут только существующие папки формата
                    YYYYMMDD.
                </FieldDescription>
            </Field>

            {mode === 'list' ? (
                <FieldSet>
                    <FieldLegend variant="label">Папки источника</FieldLegend>
                    <FieldGroup className="gap-3">
                        <Field>
                            <FieldLabel htmlFor="directory-search" className="sr-only">
                                Поиск папки
                            </FieldLabel>
                            <Input
                                id="directory-search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Поиск по дате, например 20260629"
                                disabled={loading || submitting}
                            />
                        </Field>

                        {loading ? (
                            <div className="flex h-72 items-center justify-center rounded-lg border">
                                <LoaderCircleIcon className="animate-spin" />
                                <span className="sr-only">Загрузка папок</span>
                            </div>
                        ) : visibleDirectories.length === 0 ? (
                            <Empty className="h-72 border">
                                <EmptyHeader>
                                    <EmptyMedia variant="icon">
                                        <FolderSearchIcon />
                                    </EmptyMedia>
                                    <EmptyTitle>Папки не найдены</EmptyTitle>
                                    <EmptyDescription>
                                        {directories.length === 0
                                            ? 'В источнике пока нет датированных папок.'
                                            : 'Измените поисковый запрос.'}
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        ) : (
                            <ScrollArea className="h-72 rounded-lg border">
                                <FieldGroup className="gap-0 p-2">
                                    {visibleDirectories.map((directory) => (
                                        <Field
                                            key={directory}
                                            orientation="horizontal"
                                            className="rounded-md px-2 py-2 hover:bg-muted"
                                        >
                                            <Checkbox
                                                id={`directory-${directory}`}
                                                checked={selected.has(directory)}
                                                disabled={submitting}
                                                onCheckedChange={(checked) =>
                                                    handleDirectoryChange(
                                                        directory,
                                                        checked === true
                                                    )
                                                }
                                            />
                                            <FieldLabel
                                                htmlFor={`directory-${directory}`}
                                                className="cursor-pointer font-normal"
                                            >
                                                <span>{formatDirectoryDate(directory)}</span>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {directory}
                                                </span>
                                            </FieldLabel>
                                        </Field>
                                    ))}
                                </FieldGroup>
                            </ScrollArea>
                        )}
                    </FieldGroup>
                </FieldSet>
            ) : (
                <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field data-invalid={rangeInvalid || undefined}>
                        <FieldLabel>Начальная дата</FieldLabel>
                        <DatePicker
                            value={rangeStart}
                            onChange={setRangeStart}
                            placeholder="Начало диапазона"
                            side="top"
                        />
                    </Field>
                    <Field data-invalid={rangeInvalid || undefined}>
                        <FieldLabel>Конечная дата</FieldLabel>
                        <DatePicker
                            value={rangeEnd}
                            onChange={setRangeEnd}
                            placeholder="Конец диапазона"
                            side="top"
                        />
                        {rangeInvalid ? (
                            <FieldDescription>
                                Конечная дата должна быть не раньше начальной.
                            </FieldDescription>
                        ) : null}
                    </Field>
                </FieldGroup>
            )}

            <Alert>
                <InfoIcon />
                <AlertTitle>{selectionLabel(selectedDirectories.length)}</AlertTitle>
                <AlertDescription>
                    {selectedDirectories.length > 0
                        ? `${formatDirectoryDate(selectedDirectories[0] ?? '')} — ${formatDirectoryDate(
                              selectedDirectories.at(-1) ?? ''
                          )}. Папки будут обработаны последовательно.`
                        : 'Выберите одну или несколько папок для постановки в общую очередь.'}
                </AlertDescription>
            </Alert>

            <div className="flex justify-end">
                <Button disabled={disabled} onClick={handleSubmit}>
                    {submitting ? (
                        <LoaderCircleIcon
                            data-icon="inline-start"
                            className="animate-spin"
                        />
                    ) : (
                        <PlayIcon data-icon="inline-start" />
                    )}
                    {submitting
                        ? 'Постановка в очередь'
                        : `Запустить копирование (${selectedDirectories.length})`}
                </Button>
            </div>
        </div>
    );
}
