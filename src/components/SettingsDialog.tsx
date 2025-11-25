'use client';

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { fetchAPI } from '@/utils/api';
import type { Config } from '@/types';

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfigUpdate?: () => void;
}

export function SettingsDialog({ open, onOpenChange, onConfigUpdate }: SettingsDialogProps) {
    const [config, setConfig] = useState<Config>({
        src: '',
        dest: '',
        limit: 78,
        cleanupDays: 90,
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setError(null);
            loadConfig();
        }
    }, [open]);

    const loadConfig = async () => {
        try {
            const data = await fetchAPI<Config>('/api/config');
            setConfig(data);
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    };


    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const updated = await fetchAPI<Config>('/api/config', {
                method: 'POST',
                body: JSON.stringify(config),
            });
            setConfig(updated); // Обновить локальное состояние с ответом сервера
            onConfigUpdate?.();
            onOpenChange(false);
        } catch (error) {
            console.error('Failed to save config:', error);
            const errorMessage = error instanceof Error ? error.message : 'Ошибка при сохранении конфигурации';
            setError(errorMessage);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Настройки</DialogTitle>
                    <DialogDescription>Настройте параметры системы экспорта</DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {error && (
                        <div className="p-3 bg-destructive/10 border border-destructive rounded-md text-destructive text-sm">
                            {error}
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="src">Исходная директория</Label>
                        <Input
                            id="src"
                            value={config.src}
                            onChange={e => setConfig({ ...config, src: e.target.value })}
                            placeholder="/mnt/ftp"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="dest">Целевая директория</Label>
                        <Input
                            id="dest"
                            value={config.dest}
                            onChange={e => setConfig({ ...config, dest: e.target.value })}
                            placeholder="/mnt/smb"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="limit">Лимит использования диска: {config.limit}%</Label>
                        <Slider
                            id="limit"
                            min={0}
                            max={100}
                            value={[config.limit]}
                            onValueChange={([value]) => setConfig({ ...config, limit: value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="cleanupDays">Дней хранения логов: {config.cleanupDays}</Label>
                        <Slider
                            id="cleanupDays"
                            min={0}
                            max={365}
                            value={[config.cleanupDays]}
                            onValueChange={([value]) => setConfig({ ...config, cleanupDays: value })}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Отмена
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? 'Сохранение...' : 'Сохранить'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

