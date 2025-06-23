import React, { useState, useEffect } from "react";
import { getListenerStats, cleanupAllListeners } from "@/hooks/useFirestoreListener";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Activity, AlertCircle, CheckCircle, RefreshCw, Trash2, Download } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PerformanceStats {
    listeners: Record<string, number>;
    memoryUsage?: number;
    renderCount: number;
    lastUpdate: Date;
    performanceHistory: Array<{
        timestamp: Date;
        memoryUsage?: number;
        listenerCount: number;
    }>;
}

export const PerformanceMonitor: React.FC = () => {
    const { t } = useTranslation();
    const [stats, setStats] = useState<PerformanceStats>({
        listeners: {},
        renderCount: 0,
        lastUpdate: new Date(),
        performanceHistory: [],
    });

    const [autoRefresh, setAutoRefresh] = useState(true);

    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            const listeners = getListenerStats();
            const totalListeners = Object.values(listeners).reduce((sum, count) => sum + count, 0);

            // Get memory usage if available
            let memoryUsage: number | undefined;
            if ('memory' in performance) {
                memoryUsage = (performance as any).memory.usedJSHeapSize / 1048576; // Convert to MB
            }

            setStats(prev => ({
                listeners,
                memoryUsage,
                renderCount: prev.renderCount + 1,
                lastUpdate: new Date(),
                performanceHistory: [
                    ...prev.performanceHistory.slice(-19), // Keep last 20 entries
                    {
                        timestamp: new Date(),
                        memoryUsage,
                        listenerCount: totalListeners,
                    }
                ],
            }));
        }, 2000); // Update every 2 seconds

        return () => clearInterval(interval);
    }, [autoRefresh]);

    const totalListeners = Object.values(stats.listeners).reduce((sum, count) => sum + count, 0);
    const uniqueListeners = Object.keys(stats.listeners).length;

    const handleCleanupListeners = () => {
        if (confirm("This will close all active Firestore listeners. Are you sure?")) {
            cleanupAllListeners();
            // Force a manual refresh of stats
            setTimeout(() => {
                const listeners = getListenerStats();
                setStats(prev => ({
                    ...prev,
                    listeners,
                    lastUpdate: new Date(),
                }));
            }, 1000);
        }
    };

    const handleExportData = () => {
        const exportData = {
            timestamp: new Date().toISOString(),
            currentStats: stats,
            browserInfo: {
                userAgent: navigator.userAgent,
                memory: 'memory' in performance ? (performance as any).memory : 'Not available',
            }
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `performance-report-${new Date().toISOString().slice(0, 19)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-semibold flex items-center gap-2">
                        <Activity className="w-6 h-6" />
                        {t("performance.title", "Performance Monitor")}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("performance.subtitle", "Monitor real-time performance and resource usage")}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                        {autoRefresh ? t("performance.autoRefreshOn", "Auto Refresh On") : t("performance.autoRefreshOff", "Auto Refresh Off")}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportData}
                    >
                        <Download className="w-4 h-4 mr-2" />
                        {t("performance.export", "Export Report")}
                    </Button>
                </div>
            </div>

            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        {totalListeners > 10 ? (
                            <AlertCircle className="w-8 h-8 text-yellow-500" />
                        ) : (
                            <CheckCircle className="w-8 h-8 text-green-500" />
                        )}
                        <div>
                            <p className="text-2xl font-bold">{totalListeners}</p>
                            <p className="text-sm text-muted-foreground">
                                {t("performance.totalListeners", "Total Listeners")} ({uniqueListeners} unique)
                            </p>
                        </div>
                    </div>
                    {totalListeners > 10 && (
                        <p className="text-xs text-yellow-600 mt-2">
                            {t("performance.highListenerWarning", "High number of listeners detected")}
                        </p>
                    )}
                </Card>

                {stats.memoryUsage && (
                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            {stats.memoryUsage > 100 ? (
                                <AlertCircle className="w-8 h-8 text-yellow-500" />
                            ) : (
                                <CheckCircle className="w-8 h-8 text-green-500" />
                            )}
                            <div>
                                <p className="text-2xl font-bold">{stats.memoryUsage.toFixed(1)} MB</p>
                                <p className="text-sm text-muted-foreground">
                                    {t("performance.memoryUsage", "Memory Usage")}
                                </p>
                            </div>
                        </div>
                        {stats.memoryUsage > 100 && (
                            <p className="text-xs text-yellow-600 mt-2">
                                {t("performance.highMemoryWarning", "High memory usage detected")}
                            </p>
                        )}
                    </Card>
                )}

                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <RefreshCw className="w-8 h-8 text-blue-500" />
                        <div>
                            <p className="text-2xl font-bold">{stats.renderCount}</p>
                            <p className="text-sm text-muted-foreground">
                                {t("performance.updates", "Updates")}
                            </p>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        {t("performance.lastUpdate", "Last")} {stats.lastUpdate.toLocaleTimeString()}
                    </p>
                </Card>
            </div>

            {/* Detailed Information */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Active Listeners */}
                <Card className="p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold">
                            {t("performance.activeListeners", "Active Listeners")}
                        </h3>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleCleanupListeners}
                            disabled={totalListeners === 0}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t("performance.cleanup", "Cleanup All")}
                        </Button>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {Object.entries(stats.listeners).length === 0 ? (
                            <p className="text-muted-foreground text-center py-4">
                                {t("performance.noListeners", "No active listeners")}
                            </p>
                        ) : (
                            Object.entries(stats.listeners).map(([key, count]) => (
                                <div key={key} className="flex justify-between items-center p-2 bg-muted rounded">
                                    <span className="text-sm">{key}</span>
                                    <span className="font-mono text-sm font-bold">{count}</span>
                                </div>
                            ))
                        )}
                    </div>
                </Card>

                {/* Performance History */}
                <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">
                        {t("performance.history", "Performance History")}
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {stats.performanceHistory.length === 0 ? (
                            <p className="text-muted-foreground text-center py-4">
                                {t("performance.noHistory", "No history data yet")}
                            </p>
                        ) : (
                            stats.performanceHistory.slice().reverse().map((entry, index) => (
                                <div key={index} className="flex justify-between items-center p-2 bg-muted rounded text-sm">
                                    <span>{entry.timestamp.toLocaleTimeString()}</span>
                                    <div className="flex gap-4">
                                        <span>Listeners: {entry.listenerCount}</span>
                                        {entry.memoryUsage && (
                                            <span>Memory: {entry.memoryUsage.toFixed(1)}MB</span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </div>

            {/* Recommendations */}
            {(totalListeners > 10 || (stats.memoryUsage && stats.memoryUsage > 100)) && (
                <Card className="p-6 border-yellow-200 bg-yellow-50">
                    <h3 className="text-lg font-semibold text-yellow-800 mb-3">
                        {t("performance.recommendations", "Performance Recommendations")}
                    </h3>
                    <ul className="space-y-2 text-sm text-yellow-700">
                        {totalListeners > 10 && (
                            <li>• {t("performance.rec1", "Consider cleaning up unused listeners")}</li>
                        )}
                        {stats.memoryUsage && stats.memoryUsage > 100 && (
                            <li>• {t("performance.rec2", "High memory usage - consider refreshing the page")}</li>
                        )}
                        <li>• {t("performance.rec3", "Close unused browser tabs")}</li>
                        <li>• {t("performance.rec4", "Refresh page every 2-3 hours during long sessions")}</li>
                    </ul>
                </Card>
            )}
        </div>
    );
}; 