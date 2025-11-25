import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DiskUsageCard } from './DiskUsageCard';
import { CopyLogsTab } from './CopyLogsTab';
import { DeleteLogsTab } from './DeleteLogsTab';
import { ErrorLogsTab } from './ErrorLogsTab';
import { fetchAPI } from '@/utils/api';
import type { CopyLog, DeleteLog, ErrorLog, DiskUsage, Config } from '@/types';

export function Dashboard() {
    const [spaceData, setSpaceData] = useState<{
        srcDiskUsage: DiskUsage;
        targetDiskUsage: DiskUsage;
    } | null>(null);
    const [config, setConfig] = useState<Config | null>(null);
    const [copyLogs, setCopyLogs] = useState<CopyLog[]>([]);
    const [deleteLogs, setDeleteLogs] = useState<DeleteLog[]>([]);
    const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        // Don't show loading spinner on auto-refresh
        const isInitialLoad = spaceData === null;
        if (isInitialLoad) {
            setLoading(true);
        }
        
        try {
            const [space, configData, copy, del, errors] = await Promise.all([
                fetchAPI<{ srcDiskUsage: DiskUsage; targetDiskUsage: DiskUsage }>('/api/space'),
                fetchAPI<Config>('/api/config'),
                fetchAPI<CopyLog[]>('/api/copy'),
                fetchAPI<DeleteLog[]>('/api/delete'),
                fetchAPI<ErrorLog[]>('/api/errors'),
            ]);

            setSpaceData(space);
            setConfig(configData);
            setCopyLogs(copy);
            setDeleteLogs(del);
            setErrorLogs(errors);
        } catch (error) {
            console.error('Failed to load data:', error);
            // Don't throw error to prevent page reload
        } finally {
            if (isInitialLoad) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(() => {
            loadData().catch((error) => {
                console.error('Auto-refresh error:', error);
                // Don't reload page on error, just log it
            });
        }, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="text-center">Загрузка...</div>
            </div>
        );
    }

    if (!spaceData || !config) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="text-center text-destructive">Ошибка загрузки данных</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <DiskUsageCard title="Сервер" diskUsage={spaceData.srcDiskUsage} limit={config.limit} />
                <DiskUsageCard title="Хранилище" diskUsage={spaceData.targetDiskUsage} limit={config.limit} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Логи</CardTitle>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="copy">
                        <TabsList>
                            <TabsTrigger value="copy">Копирование ({copyLogs.length})</TabsTrigger>
                            <TabsTrigger value="delete">Удаление ({deleteLogs.length})</TabsTrigger>
                            <TabsTrigger value="errors">Ошибки ({errorLogs.length})</TabsTrigger>
                        </TabsList>
                        <TabsContent value="copy">
                            <CopyLogsTab logs={copyLogs} />
                        </TabsContent>
                        <TabsContent value="delete">
                            <DeleteLogsTab logs={deleteLogs} />
                        </TabsContent>
                        <TabsContent value="errors">
                            <ErrorLogsTab logs={errorLogs} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

        </div>
    );
}

