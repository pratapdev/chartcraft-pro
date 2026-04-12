import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Candle, Timeframe, Trendline, DrawingTool, Alert, AlertLog, IndicatorConfig, MarketType, FibonacciDrawing, IndicatorCrossAlert, IndicatorThresholdAlert, StochRSICrossAlert, PctDiffDonCrossAlert, LineStyleType, RiskRewardDrawing } from '@/types/trading';
import { CompoundAlert, AlertTemplate } from '@/types/compoundAlerts';
import { HTFOverlayState, HTFLayerConfig, DEFAULT_LAYERS } from '@/types/htfOverlay';
import { fetchCandles, subscribeToCandles } from '@/lib/marketData';
import { fetchUpstoxCandles, getInstrumentKey } from '@/lib/upstoxData';
import { toast } from 'sonner';

interface UndoEntry {
  type: 'trendline' | 'alert' | 'trendline+alerts';
  trendline?: Trendline;
  alert?: Alert;
  trendlines?: Trendline[];
  alerts?: Alert[];
}

const undoStack: UndoEntry[] = [];
const redoStack: UndoEntry[] = [];

interface CrosshairData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartMode = 'candles' | 'footprint';

interface ChartStore {
  // Chart mode
  chartMode: ChartMode;
  setChartMode: (mode: ChartMode) => void;

  // Market type & Symbol & timeframe
  marketType: MarketType;
  setMarketType: (mt: MarketType) => void;
  symbol: string;
  timeframe: Timeframe;
  setSymbol: (s: string) => void;
  setTimeframe: (tf: Timeframe) => void;

  // Candle data
  candles: Candle[];
  loading: boolean;
  connected: boolean;
  loadCandles: () => Promise<void>;
  updateLastCandle: (candle: Candle) => void;
  unsubscribe: (() => void) | null;
  startLiveUpdates: () => void;
  stopLiveUpdates: () => void;

  // Drawing
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  trendlines: Trendline[];
  addTrendline: (line: Trendline) => void;
  updateTrendline: (id: string, updates: Partial<Trendline>) => void;
  removeTrendline: (id: string) => void;
  clearAllTrendlines: () => void;
  selectedTrendlineId: string | null;
  setSelectedTrendlineId: (id: string | null) => void;

  // Alerts
  alerts: Alert[];
  alertLogs: AlertLog[];
  addAlert: (alert: Alert) => void;
  removeAlert: (id: string) => void;
  clearAllAlerts: () => void;
  addAlertLog: (log: AlertLog) => void;
  clearAlertLogs: () => void;

  // Indicator cross alerts
  indicatorCrossAlerts: IndicatorCrossAlert[];
  addIndicatorCrossAlert: (alert: IndicatorCrossAlert) => void;
  removeIndicatorCrossAlert: (id: string) => void;
  clearAllIndicatorCrossAlerts: () => void;

  // Indicator threshold alerts (RSI above/below, ADX above/below)
  indicatorThresholdAlerts: IndicatorThresholdAlert[];
  addIndicatorThresholdAlert: (alert: IndicatorThresholdAlert) => void;
  removeIndicatorThresholdAlert: (id: string) => void;

  // StochRSI K/D cross alerts
  stochRSICrossAlerts: StochRSICrossAlert[];
  addStochRSICrossAlert: (alert: StochRSICrossAlert) => void;
  removeStochRSICrossAlert: (id: string) => void;

  // PctDiffDon cross alerts
  pctDiffDonCrossAlerts: PctDiffDonCrossAlert[];
  addPctDiffDonCrossAlert: (alert: PctDiffDonCrossAlert) => void;
  removePctDiffDonCrossAlert: (id: string) => void;

  // Indicators
  selectedIndicatorId: string | null;
  setSelectedIndicatorId: (id: string | null) => void;
  indicators: IndicatorConfig[];
  addIndicator: (ind: IndicatorConfig) => void;
  removeIndicator: (id: string) => void;
  clearAllIndicators: () => void;
  toggleIndicator: (id: string) => void;
  updateIndicator: (id: string, updates: Partial<IndicatorConfig>) => void;

  // Fibonacci
  fibonacciDrawings: FibonacciDrawing[];
  addFibonacci: (fib: FibonacciDrawing) => void;
  removeFibonacci: (id: string) => void;
  clearAllDrawings: () => void;

  // Risk/Reward
  riskRewardDrawings: RiskRewardDrawing[];
  addRiskReward: (rr: RiskRewardDrawing) => void;
  removeRiskReward: (id: string) => void;
  updateRiskReward: (id: string, updates: Partial<RiskRewardDrawing>) => void;
  selectedRiskRewardId: string | null;
  setSelectedRiskRewardId: (id: string | null) => void;

  // Crosshair
  crosshairData: CrosshairData | null;
  setCrosshairData: (data: CrosshairData | null) => void;

  // Right sidebar
  // Right sidebar
  rightPanelOpen: boolean;
  rightPanelTab: 'alerts' | 'indicators' | 'settings' | 'watchlist' | 'heatmap';
  setRightPanelOpen: (open: boolean) => void;
  setRightPanelTab: (tab: 'alerts' | 'indicators' | 'settings' | 'watchlist' | 'heatmap') => void;

  // Undo
  undoLastDeletion: () => void;
  redoLastDeletion: () => void;

  // Multi-timeframe
  multiTfMode: boolean;
  setMultiTfMode: (v: boolean) => void;

  // Chart font size
  chartFontSize: number;
  setChartFontSize: (size: number) => void;

  // Timezone
  timezone: string;
  setTimezone: (tz: string) => void;

  // Background alert candle data (keyed by "symbol:timeframe")
  alertCandles: Record<string, Candle[]>;
  setAlertCandles: (key: string, candles: Candle[]) => void;
  updateAlertCandle: (key: string, candle: Candle) => void;

  // Drawing defaults
  drawingDefaults: {
    trendline: { color: string; thickness: number; lineStyle: LineStyleType };
    horizontal: { color: string; thickness: number; lineStyle: LineStyleType };
    alertLine: { color: string; thickness: number; lineStyle: LineStyleType };
  };
  setDrawingDefault: (type: 'trendline' | 'horizontal' | 'alertLine', updates: Partial<{ color: string; thickness: number; lineStyle: LineStyleType }>) => void;

  // Compound alerts
  compoundAlerts: CompoundAlert[];
  addCompoundAlert: (alert: CompoundAlert) => void;
  removeCompoundAlert: (id: string) => void;
  clearCompoundAlerts: () => void;

  // Alert templates
  alertTemplates: AlertTemplate[];
  addAlertTemplate: (template: AlertTemplate) => void;
  removeAlertTemplate: (id: string) => void;

  // Favorites
  favorites: string[];
  toggleFavorite: (symbol: string) => void;

  // HTF Overlay
  htfOverlay: HTFOverlayState;
  updateHTFLayer: (index: number, updates: Partial<HTFLayerConfig>) => void;
  setHTFAutoMode: (auto: boolean) => void;
  setHTFTrendAlignment: (enabled: boolean) => void;
}

export const useChartStore = create<ChartStore>()(persist((set, get) => ({
  chartMode: 'candles',
  setChartMode: (chartMode) => set({ chartMode }),

  marketType: 'crypto',
  setMarketType: (marketType) => {
    const defaultSymbol = marketType === 'crypto' ? 'BTC/USD' : 'RELIANCE';
    set({ marketType, symbol: defaultSymbol });
    get().stopLiveUpdates();
    get().loadCandles().then(() => {
      if (marketType === 'crypto') get().startLiveUpdates();
    });
  },
  symbol: 'BTC/USD',
  timeframe: '1h',
  setSymbol: (symbol) => {
    set({ symbol });
    get().stopLiveUpdates();
    get().loadCandles().then(() => {
      if (get().marketType === 'crypto') get().startLiveUpdates();
    });
  },
  setTimeframe: (timeframe) => {
    set({ timeframe });
    get().stopLiveUpdates();
    get().loadCandles().then(() => {
      if (get().marketType === 'crypto') get().startLiveUpdates();
    });
  },

  candles: [],
  loading: false,
  connected: false,
  unsubscribe: null,

  loadCandles: async () => {
    const { symbol, timeframe, marketType } = get();
    set({ loading: true });
    let candles: Candle[];
    if (marketType === 'indian') {
      const key = getInstrumentKey(symbol);
      if (key) {
        candles = await fetchUpstoxCandles(key, timeframe);
      } else {
        candles = [];
      }
    } else {
      candles = await fetchCandles(symbol, timeframe, 500);
    }
    set({ candles, loading: false });
  },

  updateLastCandle: (candle: Candle) => {
    set((s) => {
      const candles = [...s.candles];
      const lastIdx = candles.length - 1;
      if (lastIdx >= 0 && candles[lastIdx].time === candle.time) {
        // Update existing candle
        candles[lastIdx] = candle;
      } else {
        // New candle
        candles.push(candle);
      }
      return { candles };
    });
  },

  startLiveUpdates: () => {
    const { symbol, timeframe, updateLastCandle } = get();
    const unsub = subscribeToCandles(symbol, timeframe, (candle) => {
      updateLastCandle(candle);
    });
    set({ unsubscribe: unsub, connected: true });
  },

  stopLiveUpdates: () => {
    const { unsubscribe } = get();
    if (unsubscribe) unsubscribe();
    set({ unsubscribe: null, connected: false });
  },

  activeTool: 'cursor',
  setActiveTool: (activeTool) => set({ activeTool }),
  trendlines: [],
  addTrendline: (line) => set((s) => ({ trendlines: [...s.trendlines, line] })),
  updateTrendline: (id, updates) =>
    set((s) => ({
      trendlines: s.trendlines.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTrendline: (id) => {
    const s = get();
    const line = s.trendlines.find((t) => t.id === id);
    const relatedAlerts = s.alerts.filter((a) => a.trendlineId === id);
    if (line) {
      undoStack.push({ type: 'trendline+alerts', trendline: line, alerts: relatedAlerts });
      redoStack.length = 0;
      toast('Deleted', {
        action: { label: 'Undo', onClick: () => get().undoLastDeletion() },
        duration: 5000,
      });
    }
    set({
      trendlines: s.trendlines.filter((t) => t.id !== id),
      alerts: s.alerts.filter((a) => a.trendlineId !== id),
      selectedTrendlineId: s.selectedTrendlineId === id ? null : s.selectedTrendlineId,
    });
  },
  clearAllTrendlines: () => set({ trendlines: [], selectedTrendlineId: null }),
  clearAllDrawings: () => set({ trendlines: [], fibonacciDrawings: [], riskRewardDrawings: [], selectedTrendlineId: null, alerts: [] }),
  selectedTrendlineId: null,
  setSelectedTrendlineId: (id) => set({ selectedTrendlineId: id }),

  alerts: [],
  alertLogs: [],
  addAlert: (alert) => set((s) => ({ alerts: [...s.alerts, alert] })),
  removeAlert: (id) => {
    const alert = get().alerts.find((a) => a.id === id);
    if (alert) {
      undoStack.push({ type: 'alert', alert });
      redoStack.length = 0;
      toast('Alert deleted', {
        action: { label: 'Undo', onClick: () => get().undoLastDeletion() },
        duration: 5000,
      });
      // Remove the associated trendline if no other alerts reference it
      const otherAlerts = get().alerts.filter((a) => a.id !== id && a.trendlineId === alert.trendlineId);
      if (otherAlerts.length === 0 && alert.trendlineId) {
        set((s) => ({
          alerts: s.alerts.filter((a) => a.id !== id),
          trendlines: s.trendlines.filter((t) => t.id !== alert.trendlineId),
          selectedTrendlineId: s.selectedTrendlineId === alert.trendlineId ? null : s.selectedTrendlineId,
        }));
        return;
      }
    }
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) }));
  },
  clearAllAlerts: () => {
    const s = get();
    const alertTrendlineIds = new Set(s.alerts.map((a) => a.trendlineId).filter(Boolean));
    set({
      alerts: [],
      indicatorCrossAlerts: [],
      indicatorThresholdAlerts: [],
      stochRSICrossAlerts: [],
      pctDiffDonCrossAlerts: [],
      trendlines: s.trendlines.filter((t) => !alertTrendlineIds.has(t.id)),
      selectedTrendlineId: alertTrendlineIds.has(s.selectedTrendlineId ?? '') ? null : s.selectedTrendlineId,
    });
  },
  addAlertLog: (log) => set((s) => ({ alertLogs: [log, ...s.alertLogs].slice(0, 100) })),
  clearAlertLogs: () => set({ alertLogs: [] }),

  indicatorCrossAlerts: [],
  addIndicatorCrossAlert: (alert) => set((s) => ({ indicatorCrossAlerts: [...s.indicatorCrossAlerts, alert] })),
  removeIndicatorCrossAlert: (id) => set((s) => ({ indicatorCrossAlerts: s.indicatorCrossAlerts.filter((a) => a.id !== id) })),
  clearAllIndicatorCrossAlerts: () => set({ indicatorCrossAlerts: [] }),

  indicatorThresholdAlerts: [],
  addIndicatorThresholdAlert: (alert) => set((s) => ({ indicatorThresholdAlerts: [...s.indicatorThresholdAlerts, alert] })),
  removeIndicatorThresholdAlert: (id) => set((s) => ({ indicatorThresholdAlerts: s.indicatorThresholdAlerts.filter((a) => a.id !== id) })),

  stochRSICrossAlerts: [],
  addStochRSICrossAlert: (alert) => set((s) => ({ stochRSICrossAlerts: [...s.stochRSICrossAlerts, alert] })),
  removeStochRSICrossAlert: (id) => set((s) => ({ stochRSICrossAlerts: s.stochRSICrossAlerts.filter((a) => a.id !== id) })),

  pctDiffDonCrossAlerts: [],
  addPctDiffDonCrossAlert: (alert) => set((s) => ({ pctDiffDonCrossAlerts: [...s.pctDiffDonCrossAlerts, alert] })),
  removePctDiffDonCrossAlert: (id) => set((s) => ({ pctDiffDonCrossAlerts: s.pctDiffDonCrossAlerts.filter((a) => a.id !== id) })),

  selectedIndicatorId: null,
  setSelectedIndicatorId: (id) => set({ selectedIndicatorId: id }),
  indicators: [
    { id: 'ema-20', type: 'EMA', period: 20, color: '#2962FF', visible: true },
    { id: 'ema-50', type: 'EMA', period: 50, color: '#FF6D00', visible: true },
  ],
  addIndicator: (ind) => set((s) => ({ indicators: [...s.indicators, ind] })),
  removeIndicator: (id) => set((s) => ({ indicators: s.indicators.filter((i) => i.id !== id), selectedIndicatorId: s.selectedIndicatorId === id ? null : s.selectedIndicatorId })),
  clearAllIndicators: () => set({ indicators: [] }),
  toggleIndicator: (id) =>
    set((s) => ({
      indicators: s.indicators.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i)),
    })),
  updateIndicator: (id, updates) =>
    set((s) => ({
      indicators: s.indicators.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    })),

  fibonacciDrawings: [],
  addFibonacci: (fib) => set((s) => ({ fibonacciDrawings: [...s.fibonacciDrawings, fib] })),
  removeFibonacci: (id) => set((s) => ({ fibonacciDrawings: s.fibonacciDrawings.filter((f) => f.id !== id) })),

  riskRewardDrawings: [],
  addRiskReward: (rr) => set((s) => ({ riskRewardDrawings: [...s.riskRewardDrawings, rr] })),
  removeRiskReward: (id) => set((s) => ({ riskRewardDrawings: s.riskRewardDrawings.filter((r) => r.id !== id) })),
  updateRiskReward: (id, updates) => set((s) => ({ riskRewardDrawings: s.riskRewardDrawings.map((r) => r.id === id ? { ...r, ...updates } : r) })),
  selectedRiskRewardId: null,
  setSelectedRiskRewardId: (id) => set({ selectedRiskRewardId: id }),

  crosshairData: null,
  setCrosshairData: (crosshairData) => set({ crosshairData }),

  rightPanelOpen: false,
  rightPanelTab: 'alerts',
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab, rightPanelOpen: true }),

  undoLastDeletion: () => {
    const entry = undoStack.pop();
    if (!entry) return;
    redoStack.push(entry);
    if (entry.type === 'trendline+alerts' && entry.trendline) {
      set((s) => ({
        trendlines: [...s.trendlines, entry.trendline!],
        alerts: [...s.alerts, ...(entry.alerts ?? [])],
      }));
      toast.success('Restored (Ctrl+Y to redo)');
    } else if (entry.type === 'alert' && entry.alert) {
      set((s) => ({ alerts: [...s.alerts, entry.alert!] }));
      toast.success('Alert restored (Ctrl+Y to redo)');
    }
  },
  redoLastDeletion: () => {
    const entry = redoStack.pop();
    if (!entry) return;
    undoStack.push(entry);
    if (entry.type === 'trendline+alerts' && entry.trendline) {
      set((s) => ({
        trendlines: s.trendlines.filter((t) => t.id !== entry.trendline!.id),
        alerts: s.alerts.filter((a) => !(entry.alerts ?? []).some((ea) => ea.id === a.id)),
        selectedTrendlineId: s.selectedTrendlineId === entry.trendline!.id ? null : s.selectedTrendlineId,
      }));
      toast('Redone deletion', {
        action: { label: 'Undo', onClick: () => get().undoLastDeletion() },
        duration: 5000,
      });
    } else if (entry.type === 'alert' && entry.alert) {
      set((s) => ({ alerts: s.alerts.filter((a) => a.id !== entry.alert!.id) }));
      toast('Alert re-deleted', {
        action: { label: 'Undo', onClick: () => get().undoLastDeletion() },
        duration: 5000,
      });
    }
  },

  multiTfMode: false,
  setMultiTfMode: (multiTfMode) => set({ multiTfMode }),

  chartFontSize: 11,
  setChartFontSize: (chartFontSize) => set({ chartFontSize }),

  timezone: 'Exchange',
  setTimezone: (timezone) => set({ timezone }),

  alertCandles: {},
  setAlertCandles: (key, candles) => set((s) => ({ alertCandles: { ...s.alertCandles, [key]: candles } })),
  updateAlertCandle: (key, candle) => set((s) => {
    const existing = s.alertCandles[key] ?? [];
    const copy = [...existing];
    const lastIdx = copy.length - 1;
    if (lastIdx >= 0 && copy[lastIdx].time === candle.time) {
      copy[lastIdx] = candle;
    } else {
      copy.push(candle);
      // Keep max 500 candles
      if (copy.length > 500) copy.shift();
    }
    return { alertCandles: { ...s.alertCandles, [key]: copy } };
  }),

  drawingDefaults: {
    trendline: { color: '#2563eb', thickness: 2, lineStyle: 'solid' as LineStyleType },
    horizontal: { color: '#eab308', thickness: 2, lineStyle: 'solid' as LineStyleType },
    alertLine: { color: '#eab308', thickness: 2, lineStyle: 'solid' as LineStyleType },
  },
  setDrawingDefault: (type, updates) => set((s) => ({
    drawingDefaults: {
      ...s.drawingDefaults,
      [type]: { ...s.drawingDefaults[type], ...updates },
    },
  })),

  compoundAlerts: [],
  addCompoundAlert: (alert) => set((s) => ({ compoundAlerts: [...s.compoundAlerts, alert] })),
  removeCompoundAlert: (id) => set((s) => ({ compoundAlerts: s.compoundAlerts.filter((a) => a.id !== id) })),
  clearCompoundAlerts: () => set({ compoundAlerts: [] }),

  alertTemplates: [],
  addAlertTemplate: (template) => set((s) => ({ alertTemplates: [...s.alertTemplates, template] })),
  removeAlertTemplate: (id) => set((s) => ({ alertTemplates: s.alertTemplates.filter((t) => t.id !== id) })),

  favorites: [],
  toggleFavorite: (symbol) => set((s) => ({
    favorites: s.favorites.includes(symbol)
      ? s.favorites.filter((f) => f !== symbol)
      : [...s.favorites, symbol]
  })),

  htfOverlay: { layers: [...DEFAULT_LAYERS], autoMode: true, trendAlignment: false },
  updateHTFLayer: (index, updates) => set((s) => {
    const layers = [...s.htfOverlay.layers];
    layers[index] = { ...layers[index], ...updates };
    return { htfOverlay: { ...s.htfOverlay, layers } };
  }),
  setHTFAutoMode: (autoMode) => set((s) => ({ htfOverlay: { ...s.htfOverlay, autoMode } })),
  setHTFTrendAlignment: (trendAlignment) => set((s) => ({ htfOverlay: { ...s.htfOverlay, trendAlignment } })),
}), {
  name: 'chart-store',
  partialize: (state) => ({
    trendlines: state.trendlines,
    alerts: state.alerts,
    alertLogs: state.alertLogs,
    indicators: state.indicators,
    indicatorCrossAlerts: state.indicatorCrossAlerts,
    indicatorThresholdAlerts: state.indicatorThresholdAlerts,
    stochRSICrossAlerts: state.stochRSICrossAlerts,
    pctDiffDonCrossAlerts: state.pctDiffDonCrossAlerts,
    fibonacciDrawings: state.fibonacciDrawings,
    riskRewardDrawings: state.riskRewardDrawings,
    symbol: state.symbol,
    timeframe: state.timeframe,
    marketType: state.marketType,
    chartFontSize: state.chartFontSize,
    timezone: state.timezone,
    drawingDefaults: state.drawingDefaults,
    compoundAlerts: state.compoundAlerts,
    alertTemplates: state.alertTemplates,
    favorites: state.favorites,
    htfOverlay: state.htfOverlay,
  }),
}));
