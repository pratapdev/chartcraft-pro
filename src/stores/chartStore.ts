import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Candle, Timeframe, Trendline, DrawingTool, Alert, AlertLog, IndicatorConfig, MarketType } from '@/types/trading';
import { fetchCandles, subscribeToCandles } from '@/lib/marketData';
import { fetchUpstoxCandles, getInstrumentKey } from '@/lib/upstoxData';

interface ChartStore {
  // Symbol & timeframe
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
  selectedTrendlineId: string | null;
  setSelectedTrendlineId: (id: string | null) => void;

  // Alerts
  alerts: Alert[];
  alertLogs: AlertLog[];
  addAlert: (alert: Alert) => void;
  removeAlert: (id: string) => void;
  addAlertLog: (log: AlertLog) => void;

  // Indicators
  indicators: IndicatorConfig[];
  addIndicator: (ind: IndicatorConfig) => void;
  removeIndicator: (id: string) => void;
  toggleIndicator: (id: string) => void;

  // Right sidebar
  rightPanelOpen: boolean;
  rightPanelTab: 'alerts' | 'indicators' | 'settings';
  setRightPanelOpen: (open: boolean) => void;
  setRightPanelTab: (tab: 'alerts' | 'indicators' | 'settings') => void;
}

export const useChartStore = create<ChartStore>()(persist((set, get) => ({
  symbol: 'BTC/USD',
  timeframe: '1h',
  setSymbol: (symbol) => {
    set({ symbol });
    get().stopLiveUpdates();
    get().loadCandles().then(() => get().startLiveUpdates());
  },
  setTimeframe: (timeframe) => {
    set({ timeframe });
    get().stopLiveUpdates();
    get().loadCandles().then(() => get().startLiveUpdates());
  },

  candles: [],
  loading: false,
  connected: false,
  unsubscribe: null,

  loadCandles: async () => {
    const { symbol, timeframe } = get();
    set({ loading: true });
    const candles = await fetchCandles(symbol, timeframe, 500);
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
  selectedTrendlineId: null,
  setSelectedTrendlineId: (id) => set({ selectedTrendlineId: id }),

  alerts: [],
  alertLogs: [],
  addAlert: (alert) => set((s) => ({ alerts: [...s.alerts, alert] })),
  removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  addAlertLog: (log) => set((s) => ({ alertLogs: [log, ...s.alertLogs].slice(0, 100) })),

  indicators: [
    { id: 'ema-20', type: 'EMA', period: 20, color: '#2962FF', visible: true },
    { id: 'ema-50', type: 'EMA', period: 50, color: '#FF6D00', visible: true },
  ],
  addIndicator: (ind) => set((s) => ({ indicators: [...s.indicators, ind] })),
  removeIndicator: (id) => set((s) => ({ indicators: s.indicators.filter((i) => i.id !== id) })),
  toggleIndicator: (id) =>
    set((s) => ({
      indicators: s.indicators.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i)),
    })),

  rightPanelOpen: false,
  rightPanelTab: 'alerts',
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab, rightPanelOpen: true }),
}), {
  name: 'chart-store',
  partialize: (state) => ({
    trendlines: state.trendlines,
    alerts: state.alerts,
    alertLogs: state.alertLogs,
    indicators: state.indicators,
    symbol: state.symbol,
    timeframe: state.timeframe,
  }),
}));
