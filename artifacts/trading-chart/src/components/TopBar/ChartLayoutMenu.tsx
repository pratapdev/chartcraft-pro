import React, { useState, useRef, useEffect } from 'react';
import { Save, FolderOpen, ChevronDown, Trash2, X } from 'lucide-react';
import { useChartStore } from '@/stores/chartStore';
import {
  listLayouts,
  saveLayout,
  deleteLayout,
  extractSnapshot,
  SavedChartLayout,
  ChartSnapshot,
} from '@/lib/chartLayoutService';
import { toast } from 'sonner';

export const ChartLayoutMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [layouts, setLayouts] = useState<SavedChartLayout[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setLayouts(listLayouts());
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    const state = useChartStore.getState();
    const snapshot = extractSnapshot(state);
    saveLayout(name, snapshot);
    setSaveName('');
    setSaving(false);
    setLayouts(listLayouts());
    toast.success(`Chart "${name}" saved`);
  };

  const handleLoad = (snapshot: ChartSnapshot) => {
    const store = useChartStore.getState();
    // Stop live updates before switching
    store.stopLiveUpdates();

    useChartStore.setState({
      symbol: snapshot.symbol,
      timeframe: snapshot.timeframe as any,
      marketType: snapshot.marketType as any,
      chartMode: snapshot.chartMode as any,
      timezone: snapshot.timezone,
      chartFontSize: snapshot.chartFontSize,
      drawingDefaults: snapshot.drawingDefaults,
      indicators: snapshot.indicators,
      trendlines: snapshot.trendlines,
      fibonacciDrawings: snapshot.fibonacciDrawings,
      riskRewardDrawings: snapshot.riskRewardDrawings,
      alerts: snapshot.alerts,
      alertLogs: snapshot.alertLogs,
      indicatorCrossAlerts: snapshot.indicatorCrossAlerts,
      indicatorThresholdAlerts: snapshot.indicatorThresholdAlerts,
      stochRSICrossAlerts: snapshot.stochRSICrossAlerts,
      pctDiffDonCrossAlerts: snapshot.pctDiffDonCrossAlerts,
      compoundAlerts: snapshot.compoundAlerts,
      alertTemplates: snapshot.alertTemplates,
    });

    // Reload candles for the restored symbol/timeframe
    useChartStore.getState().loadCandles().then(() => {
      if ((snapshot.marketType as any) === 'crypto') {
        useChartStore.getState().startLiveUpdates();
      }
    });

    setOpen(false);
    toast.success(`Chart loaded`);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteLayout(id);
    setLayouts(listLayouts());
    toast('Layout deleted');
  };

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setSaving(true)}
          className="trading-btn flex items-center gap-1"
          title="Save Chart Layout"
        >
          <Save size={14} />
          <span className="hidden sm:inline">Save</span>
        </button>
        <button
          onClick={() => setOpen(!open)}
          className="trading-btn flex items-center gap-1"
          title="Load Chart Layout"
        >
          <FolderOpen size={14} />
          <span className="hidden sm:inline">Load</span>
          <ChevronDown size={10} />
        </button>
      </div>

      {/* Save dialog */}
      {saving && (
        <div className="absolute top-full right-0 mt-1 bg-popover border border-border rounded-md shadow-xl z-50 min-w-[260px] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-foreground">Save Chart Layout</span>
            <button onClick={() => setSaving(false)} className="text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          </div>
          <input
            type="text"
            placeholder="Layout name..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="w-full bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none placeholder:text-muted-foreground mb-2"
            autoFocus
          />
          {layouts.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] text-muted-foreground">Overwrite existing:</span>
              <div className="mt-1 max-h-[120px] overflow-y-auto space-y-0.5">
                {layouts.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      setSaveName(l.name);
                    }}
                    className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-accent transition-colors ${
                      saveName === l.name ? 'text-primary bg-accent' : 'text-muted-foreground'
                    }`}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={!saveName.trim()}
            className="w-full text-xs py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}

      {/* Load dropdown */}
      {open && !saving && (
        <div className="absolute top-full right-0 mt-1 bg-popover border border-border rounded-md shadow-xl z-50 min-w-[260px] overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-foreground">Saved Layouts</span>
          </div>
          {layouts.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              No saved layouts yet
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto py-1">
              {layouts.map((l) => (
                <button
                  key={l.id}
                  onClick={() => handleLoad(l.snapshot)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex items-center justify-between group"
                >
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="font-medium text-foreground truncate">{l.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {l.snapshot.symbol} · {l.snapshot.timeframe} · {l.snapshot.indicators.length} ind · {l.snapshot.trendlines.length} draw
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDelete(l.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1"
                    title="Delete layout"
                  >
                    <Trash2 size={12} />
                  </button>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
