'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';

interface DatePickerProps {
    value?: string;
    onChange: (value: string) => void;
    placeholder?: string;
    side?: 'top' | 'bottom';
}

export function DatePicker({
    value,
    onChange,
    placeholder = 'Выберите дату',
    side = 'bottom',
}: DatePickerProps) {
    const [open, setOpen] = useState(false);
    const date = value ? new Date(value) : undefined;

    const handleSelect = (selectedDate: Date | undefined) => {
        if (selectedDate) {
            const formattedDate = format(selectedDate, 'yyyy-MM-dd');
            onChange(formattedDate);
            setOpen(false);
        } else {
            onChange('');
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        'w-full justify-start text-left font-normal',
                        !date && 'text-muted-foreground'
                    )}
                >
                    <CalendarIcon data-icon="inline-start" />
                    {date ? (
                        format(date, 'dd.MM.yyyy', { locale: ru })
                    ) : (
                        <span>{placeholder}</span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-auto overflow-hidden p-0"
                align="start"
                side={side}
            >
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleSelect}
                    initialFocus
                    locale={ru}
                />
                {date ? (
                    <div className="border-t p-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                                onChange('');
                                setOpen(false);
                            }}
                        >
                            Очистить
                        </Button>
                    </div>
                ) : null}
            </PopoverContent>
        </Popover>
    );
}
