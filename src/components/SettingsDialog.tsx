import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import type { Config } from '@/types';
import { fetchAPI } from '@/utils/api';
import { AlertCircleIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfigUpdate?: () => void;
}

const DEFAULT_CONFIG: Config = {
    schemaVersion: 2,
    src: '',
    dest: '',
    srcLimit: 78,
    destLimit: 78,
    cleanupDays: 90,
    quarantineDays: 7,
};

function firstValue(values: number[], fallback: number): number {
    return values[0] ?? fallback;
}

export function SettingsDialog({
    open,
    onOpenChange,
    onConfigUpdate,
}: SettingsDialogProps) {
    const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;

        let active = true;
        setLoading(true);
        setError(null);
        fetchAPI<Config>('/api/config')
            .then((data) => {
                if (active) setConfig(data);
            })
            .catch((loadError) => {
                if (active) {
                    setError(
                        loadError instanceof Error
                            ? loadError.message
                            : 'Не удалось загрузить настройки'
                    );
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [open]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const updated = await fetchAPI<Config>('/api/config', {
                method: 'POST',
                body: JSON.stringify(config),
            });
            setConfig(updated);
            onConfigUpdate?.();
            onOpenChange(false);
        } catch (saveError) {
            setError(
                saveError instanceof Error
                    ? saveError.message
                    : 'Не удалось сохранить настройки'
            );
        } finally {
            setSaving(false);
        }
    };

    const disabled = loading || saving;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Настройки</DialogTitle>
                    <DialogDescription>
                        Пути, независимые лимиты дисков и сроки хранения. При
                        сохранении подключённые хранилища регистрируются по
                        защитному маркеру.
                    </DialogDescription>
                </DialogHeader>

                {error ? (
                    <Alert variant="destructive">
                        <AlertCircleIcon />
                        <AlertTitle>Ошибка настроек</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <FieldGroup>
                    <Field data-disabled={disabled || undefined}>
                        <FieldLabel htmlFor="src">
                            Исходная директория
                        </FieldLabel>
                        <Input
                            id="src"
                            value={config.src}
                            disabled={disabled}
                            onChange={(event) =>
                                setConfig((current) => ({
                                    ...current,
                                    src: event.target.value,
                                }))
                            }
                            placeholder="/mnt/ftp"
                        />
                        <FieldDescription>
                            Путь должен быть подключён и доступен для записи.
                        </FieldDescription>
                    </Field>

                    <Field data-disabled={disabled || undefined}>
                        <FieldLabel htmlFor="dest">
                            Целевая директория
                        </FieldLabel>
                        <Input
                            id="dest"
                            value={config.dest}
                            disabled={disabled}
                            onChange={(event) =>
                                setConfig((current) => ({
                                    ...current,
                                    dest: event.target.value,
                                }))
                            }
                            placeholder="/mnt/smb"
                        />
                        <FieldDescription>
                            Путь должен быть подключён и доступен для записи.
                        </FieldDescription>
                    </Field>

                    <Field data-disabled={disabled || undefined}>
                        <FieldLabel htmlFor="src-limit">
                            Лимит сервера: {config.srcLimit}%
                        </FieldLabel>
                        <Slider
                            id="src-limit"
                            aria-label="Лимит сервера"
                            min={1}
                            max={100}
                            value={[config.srcLimit]}
                            disabled={disabled}
                            onValueChange={(values) =>
                                setConfig((current) => ({
                                    ...current,
                                    srcLimit: firstValue(
                                        values,
                                        current.srcLimit
                                    ),
                                }))
                            }
                        />
                        <FieldDescription>
                            Очистка источника запускается только после проверки
                            копии.
                        </FieldDescription>
                    </Field>

                    <Field data-disabled={disabled || undefined}>
                        <FieldLabel htmlFor="dest-limit">
                            Лимит хранилища: {config.destLimit}%
                        </FieldLabel>
                        <Slider
                            id="dest-limit"
                            aria-label="Лимит хранилища"
                            min={1}
                            max={100}
                            value={[config.destLimit]}
                            disabled={disabled}
                            onValueChange={(values) =>
                                setConfig((current) => ({
                                    ...current,
                                    destLimit: firstValue(
                                        values,
                                        current.destLimit
                                    ),
                                }))
                            }
                        />
                    </Field>

                    <Field data-disabled={disabled || undefined}>
                        <FieldLabel htmlFor="cleanup-days">
                            Хранение журналов: {config.cleanupDays} дней
                        </FieldLabel>
                        <Slider
                            id="cleanup-days"
                            aria-label="Хранение журналов"
                            min={1}
                            max={365}
                            value={[config.cleanupDays]}
                            disabled={disabled}
                            onValueChange={(values) =>
                                setConfig((current) => ({
                                    ...current,
                                    cleanupDays: firstValue(
                                        values,
                                        current.cleanupDays
                                    ),
                                }))
                            }
                        />
                    </Field>

                    <Field data-disabled={disabled || undefined}>
                        <FieldLabel htmlFor="quarantine-days">
                            Карантин: {config.quarantineDays} дней
                        </FieldLabel>
                        <Slider
                            id="quarantine-days"
                            aria-label="Срок карантина"
                            min={1}
                            max={30}
                            value={[config.quarantineDays]}
                            disabled={disabled}
                            onValueChange={(values) =>
                                setConfig((current) => ({
                                    ...current,
                                    quarantineDays: firstValue(
                                        values,
                                        current.quarantineDays
                                    ),
                                }))
                            }
                        />
                        <FieldDescription>
                            Нестандартные папки удаляются только после карантина.
                        </FieldDescription>
                    </Field>
                </FieldGroup>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                    >
                        Отмена
                    </Button>
                    <Button onClick={handleSave} disabled={disabled}>
                        {saving ? (
                            <LoaderCircleIcon
                                data-icon="inline-start"
                                className="animate-spin"
                            />
                        ) : null}
                        {saving ? 'Сохранение' : 'Сохранить'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
