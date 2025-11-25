import { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Header } from './components/Header';
import { SettingsDialog } from './components/SettingsDialog';
import './styles/components.css';

export function App() {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    return (
        <div className="min-h-screen bg-background">
            <Header onSettingsClick={() => setSettingsOpen(true)} />
            <Dashboard key={refreshTrigger} />
            <SettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                onConfigUpdate={() => {
                    // Only refresh when config is actually updated
                    setRefreshTrigger((prev) => prev + 1);
                }}
            />
        </div>
    );
}

export default App;
