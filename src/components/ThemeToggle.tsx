import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

function readTheme(): Theme {
    const stored = localStorage.getItem('theme');
    return stored === 'light' || stored === 'dark' || stored === 'system'
        ? stored
        : 'system';
}

function applyTheme(theme: Theme): void {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    const resolved =
        theme === 'system'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light'
            : theme;
    root.classList.add(resolved);
}

export function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>(readTheme);

    useEffect(() => {
        applyTheme(theme);
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if (theme === 'system') applyTheme('system');
        };
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    const selectTheme = (nextTheme: Theme) => {
        localStorage.setItem('theme', nextTheme);
        setTheme(nextTheme);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                    <SunIcon className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <MoonIcon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="sr-only">Переключить тему</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => selectTheme('light')}>
                        <SunIcon data-icon="inline-start" />
                        Светлая
                        {theme === 'light' ? (
                            <CheckIcon data-icon="inline-end" className="ml-auto" />
                        ) : null}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => selectTheme('dark')}>
                        <MoonIcon data-icon="inline-start" />
                        Тёмная
                        {theme === 'dark' ? (
                            <CheckIcon data-icon="inline-end" className="ml-auto" />
                        ) : null}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => selectTheme('system')}>
                        <MonitorIcon data-icon="inline-start" />
                        Системная
                        {theme === 'system' ? (
                            <CheckIcon data-icon="inline-end" className="ml-auto" />
                        ) : null}
                    </DropdownMenuItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
