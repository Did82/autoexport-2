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
import { fetchAPI } from '@/utils/api';
import { AlertCircleIcon, LoaderCircleIcon } from 'lucide-react';
import { useState } from 'react';

interface ManualCopyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onQueued: () => void;
}

export function ManualCopyDialog({
    open,
    onOpenChange,
    onQueued,
}: ManualCopyDialogProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleOpenChange = (nextOpen: boolean) => {
        if (submitting) return;
        setError(null);
        onOpenChange(nextOpen);
    };

    const handleStart = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await fetchAPI('/api/jobs/copy-today', { method: 'POST' });
            onOpenChange(false);
            onQueued();
        } catch (startError) {
            setError(
                startError instanceof Error
                    ? startError.message
                    : 'Не удалось поставить синхронизацию в очередь'
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Синхронизировать текущий день?</DialogTitle>
                    <DialogDescription>
                        Задание попадёт в общую очередь и не будет пересекаться с
                        плановым копированием или очисткой.
                    </DialogDescription>
                </DialogHeader>

                {error ? (
                    <Alert variant="destructive">
                        <AlertCircleIcon />
                        <AlertTitle>Запуск не выполнен</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <DialogFooter>
                    <Button
                        variant="outline"
                        disabled={submitting}
                        onClick={() => handleOpenChange(false)}
                    >
                        Отмена
                    </Button>
                    <Button disabled={submitting} onClick={handleStart}>
                        {submitting ? (
                            <LoaderCircleIcon
                                data-icon="inline-start"
                                className="animate-spin"
                            />
                        ) : null}
                        {submitting ? 'Постановка в очередь' : 'Запустить'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
