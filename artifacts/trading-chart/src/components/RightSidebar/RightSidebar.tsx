import { useEffect, useRef, useState } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { X, Trash2, Eye, EyeOff, Plus, ChevronDown, Bell, Send, ArrowRightLeft, RefreshCw, CloudOff, Cloud, List, Grid3X3 } from 'lucide-react';
import { IndicatorType, IndicatorConfig, AlertCondition, LineStyleType, ThresholdCondition, PctDiffDonLine, MarketType, Timeframe } from '@/types/trading';
import { getTelegramCredentials, saveTelegramCredentials, testTelegramNotification } from '@/lib/telegram';
import { pushState, pullState, checkSyncHealth, extractSyncPayload } from '@/lib/syncService';
import { CompoundAlertForm, CompoundAlertsList, AlertTemplatesSection } from '@/components/Alerts/CompoundAlerts';
import { WatchlistPanel } from '@/components/Watchlist/WatchlistPanel';
import { HeatmapView } from '@/components/Heatmap/HeatmapView';

const SyncControls: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem('auto-sync') === 'true');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    localStorage.setItem('auto-sync', String(autoSync));
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (autoSync) {
      const doSync = async () => {
        const ok = await checkSyncHealth();
        if (ok) {
          const payload = extractSyncPayload(useChartStore.getState());
          const pushed = await pushState(payload);
          setStatus('online');
          setLastResult(pushed ? 'Auto-synced ✓' : 'Auto-sync failed ✗');
        } else {
          setStatus('offline');
        }
      };
      doSync();
      intervalRef.current = setInterval(doSync, 30_000);
    }

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoSync]);

  const handleCheckHealth = async () => {
    setStatus('checking');
    const ok = await checkSyncHealth();
    setStatus(ok ? 'online' : 'offline');
  };

  const handlePush = async () => {
    setSyncing(true);
    setLastResult(null);
    const payload = extractSyncPayload(useChartStore.getState());
    const ok = await pushState(payload);
    setLastResult(ok ? 'Pushed to server ✓' : 'Push failed ✗');
    setSyncing(false);
  };

  const handlePull = async () => {
    setSyncing(true);
    setLastResult(null);
    const data = await pullState();
    if (data) {
      const store = useChartStore.getState();
      if (data.state) {
        store.setSymbol(data.state.symbol);
        store.setTimeframe(data.state.timeframe as Timeframe);
        store.setMarketType(data.state.marketType as MarketType);
        store.setChartFontSize(data.state.chartFontSize);
        if (data.state.drawingDefaults) {
          for (const [key, val] of Object.entries(data.state.drawingDefaults)) {
            store.setDrawingDefault(key as 'trendline' | 'horizontal' | 'alertLine', val as { color: string; thickness: number; lineStyle: LineStyleType });
          }
        }
      }
      useChartStore.setState({
        trendlines: data.trendlines,
        indicators: data.indicators,
        alerts: data.alerts,
        alertLogs: data.alertLogs,
        fibonacciDrawings: data.fibonacciDrawings,
        indicatorCrossAlerts: data.indicatorCrossAlerts,
        indicatorThresholdAlerts: data.indicatorThresholdAlerts,
        stochRSICrossAlerts: data.stochRSICrossAlerts,
        pctDiffDonCrossAlerts: data.pctDiffDonCrossAlerts,
      });
      setLastResult('Pulled from server ✓');
    } else {
      setLastResult('Pull failed ✗');
    }
    setSyncing(false);
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <button onClick={handleCheckHealth} className="flex items-center gap-1 text-xs text-primary hover:opacity-80 transition-opacity">
          {status === 'checking' ? <RefreshCw size={10} className="animate-spin" /> : status === 'online' ? <Cloud size={10} /> : <CloudOff size={10} />}
          {status === 'idle' ? 'Check' : status === 'checking' ? 'Checking...' : status === 'online' ? 'Online' : 'Offline'}
        </button>
        <div className="flex items-center gap-1.5">
          <label className="text-muted-foreground text-[10px]">Auto-sync</label>
          <button
            onClick={() => setAutoSync(!autoSync)}
            className={`w-8 h-4 rounded-full transition-colors relative ${autoSync ? 'bg-primary' : 'bg-accent'}`}
          >
            <div className={`w-3 h-3 rounded-full bg-foreground absolute top-0.5 transition-all ${autoSync ? 'left-4' : 'left-0.5'}`} />
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handlePush}
          disabled={syncing}
          className="flex-1 text-xs py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {syncing ? '...' : '↑ Push to Server'}
        </button>
        <button
          onClick={handlePull}
          disabled={syncing}
          className="flex-1 text-xs py-1.5 rounded bg-accent text-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {syncing ? '...' : '↓ Pull from Server'}
        </button>
      </div>
      {lastResult && <p className={`text-[10px] ${lastResult.includes('✓') ? 'text-bull' : 'text-bear'}`}>{lastResult}</p>}
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Sync trendlines, alerts, indicators & settings to your local server for cross-device access.
      </p>
    </div>
  );
};
