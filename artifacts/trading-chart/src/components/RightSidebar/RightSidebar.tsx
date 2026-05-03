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

export const RightSidebar: React.FC = () => {
  const {
    rightPanelOpen,
    rightPanelTab,
    setRightPanelOpen,
    alerts,
    alertLogs,
    removeAlert,
    clearAllAlerts,
    indicators,
    addIndicator,
    clearAllIndicators,
    trendlines,
    fibonacciDrawings,
    clearAllDrawings,
    indicatorCrossAlerts,
    removeIndicatorCrossAlert,
    indicatorThresholdAlerts,
    removeIndicatorThresholdAlert,
    stochRSICrossAlerts,
    removeStochRSICrossAlert,
    pctDiffDonCrossAlerts,
    removePctDiffDonCrossAlert,
  } = useChartStore();

  const [showAdd, setShowAdd] = useState(false);

  if (!rightPanelOpen) return null;

  const handleAddIndicator = (preset: typeof INDICATOR_PRESETS[number]) => {
    const id = `${preset.type.toLowerCase()}-${Date.now()}`;
    addIndicator({
      id,
      type: preset.type,
      period: preset.defaults.period ?? 14,
      color: preset.defaults.color ?? '#2962FF',
      visible: true,
      kPeriod: preset.defaults.kPeriod,
      dPeriod: preset.defaults.dPeriod,
      color2: preset.defaults.color2,
      stdDev: preset.defaults.stdDev,
      multiplier: preset.defaults.multiplier,
      lookbackWindow: preset.defaults.lookbackWindow,
      emaSmoothing: preset.defaults.emaSmoothing,
      donchianLength: preset.defaults.donchianLength,
      donLineDiff: preset.defaults.donLineDiff,
      zigzagLength: preset.defaults.zigzagLength,
      fibFactor: preset.defaults.fibFactor,
    });
    setShowAdd(false);
  };

  return (
    <div className="bg-card border-l border-border flex flex-col h-full w-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-panel-header">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {rightPanelTab}
        </span>
        <button onClick={() => setRightPanelOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {rightPanelTab === 'alerts' && (
          <div className="space-y-2">
            <QuickPriceAlert />
            <CompoundAlertForm />
            <IndicatorCrossAlertForm />
            <StochRSICrossAlertForm />
            <IndicatorThresholdAlertForm />
            <PctDiffDonCrossAlertForm />
            <CompoundAlertsList />
            <AlertTemplatesSection />
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const total = alerts.length
                    + indicatorCrossAlerts.filter(a => a.active && !a.triggered).length
                    + (indicatorThresholdAlerts ?? []).filter(a => a.active && !a.triggered).length
                    + (stochRSICrossAlerts ?? []).filter(a => a.active && !a.triggered).length;
                  return total === 0 ? 'No alerts set.' : `${total} active alert(s)`;
                })()}
              </p>
              {(alerts.length > 0 || indicatorCrossAlerts.length > 0 || (indicatorThresholdAlerts ?? []).length > 0 || (stochRSICrossAlerts ?? []).length > 0) && (
                <button onClick={clearAllAlerts} className="text-[10px] text-destructive hover:text-destructive/80 transition-colors">
                  Delete All
                </button>
              )}
            </div>
            {alerts.map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-foreground">{alert.condition.replace('_', ' ')}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { const updated = { ...alert, telegramEnabled: !(alert.telegramEnabled ?? true) }; removeAlert(alert.id); useChartStore.getState().addAlert(updated); }}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`Telegram ${(alert.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><Send size={10} /></button>
                    <button onClick={() => removeAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="text-muted-foreground mt-1">{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</div>
              </div>
            ))}
            {indicatorCrossAlerts.filter(a => a.active && !a.triggered).map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ArrowRightLeft size={10} className="text-primary" />
                    <span className="text-foreground">{alert.condition.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { const updated = { ...alert, telegramEnabled: !(alert.telegramEnabled ?? true) }; removeIndicatorCrossAlert(alert.id); useChartStore.getState().addIndicatorCrossAlert(updated); }}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`Telegram ${(alert.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><Send size={10} /></button>
                    <button onClick={() => removeIndicatorCrossAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="text-muted-foreground mt-1">{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</div>
              </div>
            ))}
            {(stochRSICrossAlerts ?? []).filter(a => a.active && !a.triggered).map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ArrowRightLeft size={10} className="text-accent-foreground" />
                    <span className="text-foreground">StochRSI {alert.condition.replace('_', ' ')}</span>
                  </div>
                  <button onClick={() => removeStochRSICrossAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                </div>
                <div className="text-muted-foreground mt-1">{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</div>
              </div>
            ))}
            {(indicatorThresholdAlerts ?? []).filter(a => a.active && !a.triggered).map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Bell size={10} className="text-accent-foreground" />
                    <span className="text-foreground">{alert.condition} {alert.threshold}</span>
                  </div>
                  <button onClick={() => removeIndicatorThresholdAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                </div>
                <div className="text-muted-foreground mt-1">{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</div>
              </div>
            ))}
            {(pctDiffDonCrossAlerts ?? []).filter(a => a.active && !a.triggered).map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ArrowRightLeft size={10} className="text-accent-foreground" />
                    <span className="text-foreground">%Diff {alert.condition.replace('_', ' ')}</span>
                  </div>
                  <button onClick={() => removePctDiffDonCrossAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                </div>
                <div className="text-muted-foreground mt-1">{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</div>
              </div>
            ))}
            {alertLogs.length > 0 && (
              <>
                <div className="flex items-center justify-between mt-4 px-1">
                  <span className="text-xs font-semibold text-muted-foreground">Recent Alerts</span>
                  <button onClick={() => useChartStore.getState().clearAlertLogs()} className="text-[10px] text-destructive hover:text-destructive/80 transition-colors">Clear All</button>
                </div>
                {alertLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="panel-section rounded p-2 text-xs">
                    <div className="text-foreground">{log.message}</div>
                    <div className="text-muted-foreground mt-1">
                      {new Date(log.timestamp).toLocaleTimeString()} · {log.price.toFixed(2)}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RightSidebar;
