import { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Header } from './components/Header';
import { SettingsDialog } from './components/SettingsDialog';

export function App() {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [configRevision, setConfigRevision] = useState(0);

    return (
        <div className="min-h-screen bg-background">
            <Header onSettingsClick={() => setSettingsOpen(true)} />
            <Dashboard configRevision={configRevision} />
            <SettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                onConfigUpdate={() => {
                    setConfigRevision((previous) => previous + 1);
                }}
            />
        </div>
    );
}

export default App;
