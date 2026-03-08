import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Candle, Timeframe, Trendline, DrawingTool, Alert, AlertLog, IndicatorConfig, MarketType, FibonacciDrawing } from '@/types/trading';
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

interface CrosshairData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartStore {
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

  // Indicators
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

  // Crosshair
  crosshairData: CrosshairData | null;
  setCrosshairData: (data: CrosshairData | null) => void;

  // Right sidebar
  // Right sidebar
  rightPanelOpen: boolean;
  rightPanelTab: 'alerts' | 'indicators' | 'settings';
  setRightPanelOpen: (open: boolean) => void;
  setRightPanelTab: (tab: 'alerts' | 'indicators' | 'settings') => void;

  // Undo
  undoLastDeletion: () => void;

  // Multi-timeframe
  multiTfMode: boolean;
  setMultiTfMode: (v: boolean) => void;
}

export const useChartStore = create<ChartStore>()(persist((set, get) => ({
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
  removeTrendline: (id) =>
    set((s) => ({
      trendlines: s.trendlines.filter((t) => t.id !== id),
      alerts: s.alerts.filter((a) => a.trendlineId !== id),
      selectedTrendlineId: s.selectedTrendlineId === id ? null : s.selectedTrendlineId,
    })),
  clearAllTrendlines: () => set({ trendlines: [], selectedTrendlineId: null }),
  clearAllDrawings: () => set({ trendlines: [], fibonacciDrawings: [], selectedTrendlineId: null, alerts: [] }),
  selectedTrendlineId: null,
  setSelectedTrendlineId: (id) => set({ selectedTrendlineId: id }),

  alerts: [],
  alertLogs: [],
  addAlert: (alert) => set((s) => ({ alerts: [...s.alerts, alert] })),
  removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  clearAllAlerts: () => set({ alerts: [] }),
  addAlertLog: (log) => set((s) => ({ alertLogs: [log, ...s.alertLogs].slice(0, 100) })),

  indicators: [
    { id: 'ema-20', type: 'EMA', period: 20, color: '#2962FF', visible: true },
    { id: 'ema-50', type: 'EMA', period: 50, color: '#FF6D00', visible: true },
  ],
  addIndicator: (ind) => set((s) => ({ indicators: [...s.indicators, ind] })),
  removeIndicator: (id) => set((s) => ({ indicators: s.indicators.filter((i) => i.id !== id) })),
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

  crosshairData: null,
  setCrosshairData: (crosshairData) => set({ crosshairData }),

  rightPanelOpen: false,
  rightPanelTab: 'alerts',
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab, rightPanelOpen: true }),

  multiTfMode: false,
  setMultiTfMode: (multiTfMode) => set({ multiTfMode }),
}), {
  name: 'chart-store',
  partialize: (state) => ({
    trendlines: state.trendlines,
    alerts: state.alerts,
    alertLogs: state.alertLogs,
    indicators: state.indicators,
    fibonacciDrawings: state.fibonacciDrawings,
    symbol: state.symbol,
    timeframe: state.timeframe,
    marketType: state.marketType,
  }),
}));
