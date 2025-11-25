import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
    onSettingsClick: () => void;
}

export function Header({ onSettingsClick }: HeaderProps) {
    return (
        <header className="border-b bg-background">
            <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                <h1 className="text-2xl font-bold">AutoExport</h1>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <Button variant="outline" onClick={onSettingsClick}>
                        <Settings className="mr-2 h-4 w-4" />
                        Настройки
                    </Button>
                </div>
            </div>
        </header>
    );
}
