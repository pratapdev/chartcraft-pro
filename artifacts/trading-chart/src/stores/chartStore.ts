import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Candle, Timeframe, Trendline, DrawingTool, Alert, AlertLog, IndicatorConfig, MarketType, FibonacciDrawing, IndicatorCrossAlert, IndicatorThresholdAlert, StochRSICrossAlert, PctDiffDonCrossAlert, PctDiffStrategyAlert, LineStyleType, RiskRewardDrawing, SmartMoneyAlert, RectangleDrawing, RectangleAlert } from '@/types/trading';
import { CompoundAlert, AlertTemplate } from '@/types/compoundAlerts';
import { HTFOverlayState, HTFLayerConfig, DEFAULT_LAYERS } from '@/types/htfOverlay';
import { fetchCandles, subscribeToCandles } from '@/lib/marketData';
import { fetchUpstoxCandles, getInstrumentKey } from '@/lib/upstoxData';
import { toast } from 'sonner';
import type { SavedChartLayout } from '@/lib/chartLayoutService';

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
  chartMode: ChartMode;
  setChartMode: (mode: ChartMode) => void;
  marketType: MarketType;
  setMarketType: (mt: MarketType) => void;
  symbol: string;
  timeframe: Timeframe;
  setSymbol: (s: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  candles: Candle[];
  loading: boolean;
  connected: boolean;
  loadCandles: () => Promise<void>;
  updateLastCandle: (candle: Candle) => void;
  unsubscribe: (() => void) | null;
  startLiveUpdates: () => void;
  stopLiveUpdates: () => void;
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  trendlines: Trendline[];
  addTrendline: (line: Trendline) => void;
  updateTrendline: (id: string, updates: Partial<Trendline>) => void;
  removeTrendline: (id: string) => void;
  clearAllTrendlines: () => void;
  selectedTrendlineId: string | null;
  setSelectedTrendlineId: (id: string | null) => void;
  alerts: Alert[];
  alertLogs: AlertLog[];
  addAlert: (alert: Alert) => void;
  updateAlert: (id: string, updates: Partial<Alert>) => void;
  removeAlert: (id: string) => void;

  clearAllAlerts: () => void;
  addAlertLog: (log: AlertLog) => void;
  clearAlertLogs: () => void;
  indicatorCrossAlerts: IndicatorCrossAlert[];
  addIndicatorCrossAlert: (alert: IndicatorCrossAlert) => void;
  updateIndicatorCrossAlert: (id: string, updates: Partial<IndicatorCrossAlert>) => void;
  removeIndicatorCrossAlert: (id: string) => void;

  clearAllIndicatorCrossAlerts: () => void;
  indicatorThresholdAlerts: IndicatorThresholdAlert[];
  addIndicatorThresholdAlert: (alert: IndicatorThresholdAlert) => void;
  updateIndicatorThresholdAlert: (id: string, updates: Partial<IndicatorThresholdAlert>) => void;
  removeIndicatorThresholdAlert: (id: string) => void;

  stochRSICrossAlerts: StochRSICrossAlert[];
  addStochRSICrossAlert: (alert: StochRSICrossAlert) => void;
  updateStochRSICrossAlert: (id: string, updates: Partial<StochRSICrossAlert>) => void;
  removeStochRSICrossAlert: (id: string) => void;

  pctDiffDonCrossAlerts: PctDiffDonCrossAlert[];
  addPctDiffDonCrossAlert: (alert: PctDiffDonCrossAlert) => void;
  updatePctDiffDonCrossAlert: (id: string, updates: Partial<PctDiffDonCrossAlert>) => void;
  removePctDiffDonCrossAlert: (id: string) => void;

  pctDiffStrategyAlerts: PctDiffStrategyAlert[];
  addPctDiffStrategyAlert: (alert: PctDiffStrategyAlert) => void;
  updatePctDiffStrategyAlert: (id: string, updates: Partial<PctDiffStrategyAlert>) => void;
  removePctDiffStrategyAlert: (id: string) => void;

  smartMoneyAlerts: SmartMoneyAlert[];
  addSmartMoneyAlert: (alert: SmartMoneyAlert) => void;
  removeSmartMoneyAlert: (id: string) => void;
  updateSmartMoneyAlert: (id: string, updates: Partial<SmartMoneyAlert>) => void;
  selectedIndicatorId: string | null;
  setSelectedIndicatorId: (id: string | null) => void;
  indicators: IndicatorConfig[];
  addIndicator: (ind: IndicatorConfig) => void;
  removeIndicator: (id: string) => void;
  clearAllIndicators: () => void;
  toggleIndicator: (id: string) => void;
  updateIndicator: (id: string, updates: Partial<IndicatorConfig>) => void;
  fibonacciDrawings: FibonacciDrawing[];
  addFibonacci: (fib: FibonacciDrawing) => void;
  removeFibonacci: (id: string) => void;
  clearAllDrawings: () => void;
  riskRewardDrawings: RiskRewardDrawing[];
  addRiskReward: (rr: RiskRewardDrawing) => void;
  removeRiskReward: (id: string) => void;
  updateRiskReward: (id: string, updates: Partial<RiskRewardDrawing>) => void;
  selectedRiskRewardId: string | null;
  setSelectedRiskRewardId: (id: string | null) => void;
  rectangleDrawings: RectangleDrawing[];
  addRectangle: (rect: RectangleDrawing) => void;
  removeRectangle: (id: string) => void;
  updateRectangle: (id: string, updates: Partial<RectangleDrawing>) => void;
  selectedRectangleId: string | null;
  setSelectedRectangleId: (id: string | null) => void;
  rectangleAlerts: RectangleAlert[];
  addRectangleAlert: (alert: RectangleAlert) => void;
  removeRectangleAlert: (id: string) => void;
  updateRectangleAlert: (id: string, updates: Partial<RectangleAlert>) => void;
  crosshairData: CrosshairData | null;
  setCrosshairData: (data: CrosshairData | null) => void;
  rightPanelOpen: boolean;
  rightPanelTab: 'alerts' | 'indicators' | 'settings' | 'watchlist' | 'heatmap' | 'guide';
  setRightPanelOpen: (open: boolean) => void;
  setRightPanelTab: (tab: 'alerts' | 'indicators' | 'settings' | 'watchlist' | 'heatmap' | 'guide') => void;
  undoLastDeletion: () => void;
  redoLastDeletion: () => void;
  multiTfMode: boolean;
  setMultiTfMode: (v: boolean) => void;
  hideAllDrawings: boolean;
  setHideAllDrawings: (v: boolean) => void;
  hideAllIndicators: boolean;
  setHideAllIndicators: (v: boolean) => void;
  chartFontSize: number;
  setChartFontSize: (size: number) => void;
  timezone: string;
  setTimezone: (tz: string) => void;
  alertCandles: Record<string, Candle[]>;
  setAlertCandles: (key: string, candles: Candle[]) => void;
  updateAlertCandle: (key: string, candle: Candle) => void;
  drawingDefaults: {
    trendline: { color: string; thickness: number; lineStyle: LineStyleType };
    horizontal: { color: string; thickness: number; lineStyle: LineStyleType };
    alertLine: { color: string; thickness: number; lineStyle: LineStyleType };
    rectangle: { color: string; fillColor: string; thickness: number; lineStyle: LineStyleType };
  };
  setDrawingDefault: (type: 'trendline' | 'horizontal' | 'alertLine' | 'rectangle', updates: Partial<{ color: string; fillColor?: string; thickness: number; lineStyle: LineStyleType }>) => void;
  compoundAlerts: CompoundAlert[];
  addCompoundAlert: (alert: CompoundAlert) => void;
  updateCompoundAlert: (id: string, updates: Partial<CompoundAlert>) => void;
  removeCompoundAlert: (id: string) => void;

  clearCompoundAlerts: () => void;
  alertTemplates: AlertTemplate[];
  addAlertTemplate: (template: AlertTemplate) => void;
  removeAlertTemplate: (id: string) => void;
  favorites: string[];
  toggleFavorite: (symbol: string) => void;
  htfOverlay: HTFOverlayState;
  updateHTFLayer: (index: number, updates: Partial<HTFLayerConfig>) => void;
  removeHTFLayer: (index: number) => void;
  setHTFAutoMode: (auto: boolean) => void;
  setHTFTrendAlignment: (enabled: boolean) => void;
  layouts: SavedChartLayout[];
  setLayouts: (layouts: SavedChartLayout[]) => void;
  syncStatus: 'idle' | 'checking' | 'online' | 'offline';
  setSyncStatus: (status: 'idle' | 'checking' | 'online' | 'offline') => void;
  lastSyncResult: string | null;
  setLastSyncResult: (res: string | null) => void;
  aiProvider: 'openai' | 'google' | 'anthropic';
  setAiProvider: (provider: 'openai' | 'google' | 'anthropic') => void;
  aiApiKey: string;
  setAiApiKey: (key: string) => void;
  aiModel: string;
  setAiModel: (model: string) => void;
  aiBaseUrl: string;
  setAiBaseUrl: (url: string) => void;
}

export const useChartStore = create<ChartStore>()(persist((set, get) => ({
  chartMode: 'candles',
  setChartMode: (chartMode) => set({ chartMode }),
  marketType: 'crypto',
  setMarketType: (marketType) => {
    const defaultSymbol = marketType === 'crypto' ? 'BTC/USD' : marketType === 'forex' ? 'XAU/USD' : 'RELIANCE';
    set({ marketType, symbol: defaultSymbol });
    get().stopLiveUpdates();
    get().loadCandles().then(() => {
      if (marketType === 'crypto' || marketType === 'forex') get().startLiveUpdates();
    });
  },
  symbol: 'BTC/USD',
  timeframe: '1h',
  setSymbol: (symbol) => {
    set({ symbol });
    get().stopLiveUpdates();
    get().loadCandles().then(() => {
      const mt = get().marketType;
      if (mt === 'crypto' || mt === 'forex') get().startLiveUpdates();
    });
  },
  setTimeframe: (timeframe) => {
    set({ timeframe });
    get().stopLiveUpdates();
    get().loadCandles().then(() => {
      const mt = get().marketType;
      if (mt === 'crypto' || mt === 'forex') get().startLiveUpdates();
    });
  },
  candles: [],
  loading: false,
  connected: false,
  loadCandles: async () => {
    const { symbol, timeframe, marketType } = get();
    set({ loading: true });
    try {
      let candles: Candle[];
      if (marketType === 'indian') {
        const instrumentKey = getInstrumentKey(symbol);
        if (instrumentKey) {
          candles = await fetchUpstoxCandles(instrumentKey, timeframe);
        } else {
          candles = [];
        }
      } else {
        candles = await fetchCandles(symbol, timeframe);
      }
      set({ candles, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  updateLastCandle: (candle: Candle) => set((s) => {
    const candles = [...s.candles];
    const last = candles[candles.length - 1];
    if (last && last.time === candle.time) {
      candles[candles.length - 1] = candle;
    } else {
      candles.push(candle);
    }
    return { candles };
  }),
  unsubscribe: null,
  startLiveUpdates: () => {
    const { symbol, timeframe, marketType } = get();
    if (marketType !== 'crypto') return;
    const existing = get().unsubscribe;
    if (existing) existing();
    const unsub = subscribeToCandles(symbol, timeframe, (candle: Candle) => {
      get().updateLastCandle(candle);
    });
    set({ unsubscribe: unsub, connected: true });
  },
  stopLiveUpdates: () => {
    const unsub = get().unsubscribe;
    if (unsub) unsub();
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
  selectedTrendlineId: null,
  setSelectedTrendlineId: (id) => set({ selectedTrendlineId: id }),
  alerts: [],
  alertLogs: [],
  addAlert: (alert) => set((s) => {
    if (s.alerts.some(a => a.id === alert.id)) return s;
    return { alerts: [...s.alerts, alert] };
  }),

  updateAlert: (id, updates) => set((s) => ({ alerts: s.alerts.map(a => a.id === id ? { ...a, ...updates } : a) })),
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
      pctDiffStrategyAlerts: [],
      smartMoneyAlerts: [],
      compoundAlerts: [],
      trendlines: s.trendlines.filter((t) => !alertTrendlineIds.has(t.id)),
      selectedTrendlineId: alertTrendlineIds.has(s.selectedTrendlineId ?? '') ? null : s.selectedTrendlineId,
    });
  },
  addAlertLog: (log) => set((s) => ({ alertLogs: [log, ...s.alertLogs].slice(0, 100) })),
  clearAlertLogs: () => set({ alertLogs: [] }),
  indicatorCrossAlerts: [],
  addIndicatorCrossAlert: (alert) => set((s) => {
    if (s.indicatorCrossAlerts.some(a => a.id === alert.id)) return s;
    return { indicatorCrossAlerts: [...s.indicatorCrossAlerts, alert] };
  }),

  updateIndicatorCrossAlert: (id, updates) => set((s) => ({ indicatorCrossAlerts: s.indicatorCrossAlerts.map(a => a.id === id ? { ...a, ...updates } : a) })),
  removeIndicatorCrossAlert: (id) => set((s) => ({ indicatorCrossAlerts: s.indicatorCrossAlerts.filter((a) => a.id !== id) })),
  clearAllIndicatorCrossAlerts: () => set({ indicatorCrossAlerts: [] }),
  indicatorThresholdAlerts: [],
  addIndicatorThresholdAlert: (alert) => set((s) => {
    if (s.indicatorThresholdAlerts.some(a => a.id === alert.id)) return s;
    return { indicatorThresholdAlerts: [...s.indicatorThresholdAlerts, alert] };
  }),

  updateIndicatorThresholdAlert: (id, updates) => set((s) => ({ indicatorThresholdAlerts: s.indicatorThresholdAlerts.map(a => a.id === id ? { ...a, ...updates } : a) })),
  removeIndicatorThresholdAlert: (id) => set((s) => ({ indicatorThresholdAlerts: s.indicatorThresholdAlerts.filter((a) => a.id !== id) })),
  stochRSICrossAlerts: [],
  addStochRSICrossAlert: (alert) => set((s) => {
    if (s.stochRSICrossAlerts.some(a => a.id === alert.id)) return s;
    return { stochRSICrossAlerts: [...s.stochRSICrossAlerts, alert] };
  }),

  updateStochRSICrossAlert: (id, updates) => set((s) => ({ stochRSICrossAlerts: s.stochRSICrossAlerts.map(a => a.id === id ? { ...a, ...updates } : a) })),
  removeStochRSICrossAlert: (id) => set((s) => ({ stochRSICrossAlerts: s.stochRSICrossAlerts.filter((a) => a.id !== id) })),
  pctDiffDonCrossAlerts: [],
  addPctDiffDonCrossAlert: (alert) => set((s) => {
    if (s.pctDiffDonCrossAlerts.some(a => a.id === alert.id)) return s;
    return { pctDiffDonCrossAlerts: [...s.pctDiffDonCrossAlerts, alert] };
  }),

  updatePctDiffDonCrossAlert: (id, updates) => set((s) => ({ pctDiffDonCrossAlerts: s.pctDiffDonCrossAlerts.map(a => a.id === id ? { ...a, ...updates } : a) })),
  removePctDiffDonCrossAlert: (id) => set((s) => ({ pctDiffDonCrossAlerts: s.pctDiffDonCrossAlerts.filter((a) => a.id !== id) })),

  pctDiffStrategyAlerts: [],
  addPctDiffStrategyAlert: (alert) => set((s) => {
    if (s.pctDiffStrategyAlerts.some(a => a.id === alert.id)) return s;
    return { pctDiffStrategyAlerts: [...s.pctDiffStrategyAlerts, alert] };
  }),
  updatePctDiffStrategyAlert: (id, updates) => set((s) => ({ pctDiffStrategyAlerts: s.pctDiffStrategyAlerts.map(a => a.id === id ? { ...a, ...updates } : a) })),
  removePctDiffStrategyAlert: (id) => set((s) => ({ pctDiffStrategyAlerts: s.pctDiffStrategyAlerts.filter((a) => a.id !== id) })),

  smartMoneyAlerts: [],
  addSmartMoneyAlert: (alert) => set((s) => {
    if (s.smartMoneyAlerts.some(a => a.id === alert.id)) return s;
    return { smartMoneyAlerts: [...s.smartMoneyAlerts, alert] };
  }),

  removeSmartMoneyAlert: (id) => set((s) => ({ smartMoneyAlerts: s.smartMoneyAlerts.filter((a) => a.id !== id) })),
  updateSmartMoneyAlert: (id, updates) => set((s) => ({ smartMoneyAlerts: s.smartMoneyAlerts.map((a) => a.id === id ? { ...a, ...updates } : a) })),
  selectedIndicatorId: null,
  setSelectedIndicatorId: (selectedIndicatorId) => set({ selectedIndicatorId }),
  indicators: [],
  addIndicator: (ind) => set((s) => ({ indicators: [...s.indicators, ind] })),
  removeIndicator: (id) => set((s) => ({ indicators: s.indicators.filter((ind) => ind.id !== id), selectedIndicatorId: s.selectedIndicatorId === id ? null : s.selectedIndicatorId })),
  clearAllIndicators: () => set({ indicators: [], selectedIndicatorId: null }),
  toggleIndicator: (id) => set((s) => ({ indicators: s.indicators.map((ind) => ind.id === id ? { ...ind, visible: !ind.visible } : ind) })),
  updateIndicator: (id, updates) => set((s) => ({ indicators: s.indicators.map((ind) => ind.id === id ? { ...ind, ...updates } : ind) })),
  fibonacciDrawings: [],
  addFibonacci: (fib) => set((s) => ({ fibonacciDrawings: [...s.fibonacciDrawings, fib] })),
  removeFibonacci: (id) => set((s) => ({ fibonacciDrawings: s.fibonacciDrawings.filter((f) => f.id !== id) })),
  clearAllDrawings: () => set({ trendlines: [], fibonacciDrawings: [], riskRewardDrawings: [], rectangleDrawings: [], selectedTrendlineId: null, alerts: [] }),
  riskRewardDrawings: [],
  addRiskReward: (rr) => set((s) => ({ riskRewardDrawings: [...s.riskRewardDrawings, rr] })),
  removeRiskReward: (id) => set((s) => ({ riskRewardDrawings: s.riskRewardDrawings.filter((r) => r.id !== id) })),
  updateRiskReward: (id, updates) => set((s) => ({ riskRewardDrawings: s.riskRewardDrawings.map((r) => r.id === id ? { ...r, ...updates } : r) })),
  selectedRiskRewardId: null,
  setSelectedRiskRewardId: (selectedRiskRewardId) => set({ selectedRiskRewardId }),
  rectangleDrawings: [],
  addRectangle: (rect) => set((s) => ({ rectangleDrawings: [...s.rectangleDrawings, rect] })),
  removeRectangle: (id) => set((s) => ({ rectangleDrawings: s.rectangleDrawings.filter((r) => r.id !== id) })),
  updateRectangle: (id, updates) => set((s) => ({ rectangleDrawings: s.rectangleDrawings.map((r) => r.id === id ? { ...r, ...updates } : r) })),
  selectedRectangleId: null,
  setSelectedRectangleId: (selectedRectangleId) => set({ selectedRectangleId }),
  rectangleAlerts: [],
  addRectangleAlert: (alert) => set((s) => {
    if (s.rectangleAlerts.some(a => a.id === alert.id)) return s;
    return { rectangleAlerts: [...s.rectangleAlerts, alert] };
  }),
  removeRectangleAlert: (id) => set((s) => ({ rectangleAlerts: s.rectangleAlerts.filter(a => a.id !== id) })),
  updateRectangleAlert: (id, updates) => set((s) => ({ rectangleAlerts: s.rectangleAlerts.map(a => a.id === id ? { ...a, ...updates } : a) })),
  crosshairData: null,
  setCrosshairData: (crosshairData) => set({ crosshairData }),
  rightPanelOpen: true,
  rightPanelTab: 'indicators',
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
  hideAllDrawings: false,
  setHideAllDrawings: (hideAllDrawings) => set({ hideAllDrawings }),
  hideAllIndicators: false,
  setHideAllIndicators: (hideAllIndicators) => set({ hideAllIndicators }),
  chartFontSize: 12,
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
    trendline: { color: '#2563eb', thickness: 2, lineStyle: 'solid' },
    horizontal: { color: '#eab308', thickness: 2, lineStyle: 'solid' },
    alertLine: { color: '#eab308', thickness: 2, lineStyle: 'solid' },
    rectangle: { color: '#2563eb', fillColor: 'rgba(37, 99, 235, 0.2)', thickness: 1, lineStyle: 'solid' },
  },
  setDrawingDefault: (type, updates) => set((s) => ({
    drawingDefaults: {
      ...s.drawingDefaults,
      [type]: { ...s.drawingDefaults[type], ...updates },
    },
  })),
  compoundAlerts: [],
  addCompoundAlert: (alert) => set((s) => {
    if (s.compoundAlerts.some(a => a.id === alert.id)) return s;
    return { compoundAlerts: [...s.compoundAlerts, alert] };
  }),

  updateCompoundAlert: (id, updates) => set((s) => ({ compoundAlerts: s.compoundAlerts.map(a => a.id === id ? { ...a, ...updates } : a) })),
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
  removeHTFLayer: (index) => set((s) => ({ htfOverlay: { ...s.htfOverlay, layers: s.htfOverlay.layers.filter((_, i) => i !== index) } })),
  setHTFAutoMode: (autoMode) => set((s) => ({ htfOverlay: { ...s.htfOverlay, autoMode } })),
  setHTFTrendAlignment: (trendAlignment) => set((s) => ({ htfOverlay: { ...s.htfOverlay, trendAlignment } })),
  layouts: (() => {
    // Migration: Check if there are layouts in the old storage key
    try {
      const old = localStorage.getItem('saved-chart-layouts');
      if (old) {
        const parsed = JSON.parse(old);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Remove it so we don't migrate again
          localStorage.removeItem('saved-chart-layouts');
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to migrate layouts:', e);
    }
    return [];
  })(),
  setLayouts: (layouts) => set({ layouts }),
  syncStatus: 'idle',
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  lastSyncResult: null,
  setLastSyncResult: (lastSyncResult) => set({ lastSyncResult }),
  aiProvider: 'openai',
  setAiProvider: (aiProvider) => set({ aiProvider }),
  aiApiKey: '',
  setAiApiKey: (aiApiKey) => set({ aiApiKey }),
  aiModel: '',
  setAiModel: (aiModel) => set({ aiModel }),
  aiBaseUrl: '',
  setAiBaseUrl: (aiBaseUrl) => set({ aiBaseUrl }),
}), {
  name: 'chart-store',
  merge: (persistedState: any, currentState: any) => {
    return {
      ...currentState,
      ...persistedState,
      drawingDefaults: {
        ...currentState.drawingDefaults,
        ...(persistedState?.drawingDefaults || {}),
      }
    };
  },
  partialize: (state) => ({
    trendlines: state.trendlines,
    alerts: state.alerts,
    alertLogs: state.alertLogs,
    indicators: state.indicators,
    indicatorCrossAlerts: state.indicatorCrossAlerts,
    indicatorThresholdAlerts: state.indicatorThresholdAlerts,
    stochRSICrossAlerts: state.stochRSICrossAlerts,
    pctDiffDonCrossAlerts: state.pctDiffDonCrossAlerts,
    pctDiffStrategyAlerts: state.pctDiffStrategyAlerts,
    smartMoneyAlerts: state.smartMoneyAlerts,
    fibonacciDrawings: state.fibonacciDrawings,
    riskRewardDrawings: state.riskRewardDrawings,
    rectangleDrawings: state.rectangleDrawings,
    rectangleAlerts: state.rectangleAlerts,
    symbol: state.symbol,
    timeframe: state.timeframe,
    marketType: state.marketType,
    chartFontSize: state.chartFontSize,
    timezone: state.timezone,
    drawingDefaults: state.drawingDefaults,
    layouts: state.layouts,
    aiProvider: state.aiProvider,
    aiApiKey: state.aiApiKey,
    aiModel: state.aiModel,
    aiBaseUrl: state.aiBaseUrl,
  }),
}));