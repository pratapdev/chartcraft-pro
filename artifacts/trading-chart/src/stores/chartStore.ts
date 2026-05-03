import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Candle, Timeframe, Trendline, DrawingTool, Alert, AlertLog, IndicatorConfig, MarketType, FibonacciDrawing, IndicatorCrossAlert, IndicatorThresholdAlert, StochRSICrossAlert, PctDiffDonCrossAlert, LineStyleType, RiskRewardDrawing, SmartMoneyAlert } from '@/types/trading';
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
  removeAlert: (id: string) => void;
  clearAllAlerts: () => void;
  addAlertLog: (log: AlertLog) => void;
  clearAlertLogs: () => void;
  indicatorCrossAlerts: IndicatorCrossAlert[];
  addIndicatorCrossAlert: (alert: IndicatorCrossAlert) => void;
  removeIndicatorCrossAlert: (id: string) => void;
  clearAllIndicatorCrossAlerts: () => void;
  indicatorThresholdAlerts: IndicatorThresholdAlert[];
  addIndicatorThresholdAlert: (alert: IndicatorThresholdAlert) => void;
  removeIndicatorThresholdAlert: (id: string) => void;
  stochRSICrossAlerts: StochRSICrossAlert[];
  addStochRSICrossAlert: (alert: StochRSICrossAlert) => void;
  removeStochRSICrossAlert: (id: string) => void;
  pctDiffDonCrossAlerts: PctDiffDonCrossAlert[];
  addPctDiffDonCrossAlert: (alert: PctDiffDonCrossAlert) => void;
  removePctDiffDonCrossAlert: (id: string) => void;
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
  };
  setDrawingDefault: (type: 'trendline' | 'horizontal' | 'alertLine', updates: Partial<{ color: string; thickness: number; lineStyle: LineStyleType }>) => void;
  compoundAlerts: CompoundAlert[];
  addCompoundAlert: (alert: CompoundAlert) => void;
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
  setSymbol: (symbol) => set({ symbol }),
  setTimeframe: (timeframe) => set({ timeframe }),
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
        candles = await fetchUpstoxCandles(instrumentKey, timeframe);
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
  addTrendline: (trendline) => set((s) => ({ trendlines: [...s.trendlines, trendline] })),
  updateTrendline: () => {},
  removeTrendline: () => {},
  clearAllTrendlines: () => {},
  selectedTrendlineId: null,
  setSelectedTrendlineId: (selectedTrendlineId) => set({ selectedTrendlineId }),
  alerts: [],
  alertLogs: [],
  addAlert: (alert) => set((s) => ({ alerts: [...s.alerts, alert] })),
  removeAlert: () => {},
  clearAllAlerts: () => {},
  addAlertLog: () => {},
  clearAlertLogs: () => {},
  indicatorCrossAlerts: [],
  addIndicatorCrossAlert: () => {},
  removeIndicatorCrossAlert: () => {},
  clearAllIndicatorCrossAlerts: () => {},
  indicatorThresholdAlerts: [],
  addIndicatorThresholdAlert: () => {},
  removeIndicatorThresholdAlert: () => {},
  stochRSICrossAlerts: [],
  addStochRSICrossAlert: () => {},
  removeStochRSICrossAlert: () => {},
  pctDiffDonCrossAlerts: [],
  addPctDiffDonCrossAlert: () => {},
  removePctDiffDonCrossAlert: () => {},
  smartMoneyAlerts: [],
  addSmartMoneyAlert: () => {},
  removeSmartMoneyAlert: () => {},
  updateSmartMoneyAlert: () => {},
  selectedIndicatorId: null,
  setSelectedIndicatorId: (selectedIndicatorId) => set({ selectedIndicatorId }),
  indicators: [],
  addIndicator: (ind) => set((s) => ({ indicators: [...s.indicators, ind] })),
  removeIndicator: (id) => set((s) => ({ indicators: s.indicators.filter((ind) => ind.id !== id), selectedIndicatorId: s.selectedIndicatorId === id ? null : s.selectedIndicatorId })),
  clearAllIndicators: () => set({ indicators: [], selectedIndicatorId: null }),
  toggleIndicator: (id) => set((s) => ({ indicators: s.indicators.map((ind) => ind.id === id ? { ...ind, visible: !ind.visible } : ind) })),
  updateIndicator: (id, updates) => set((s) => ({ indicators: s.indicators.map((ind) => ind.id === id ? { ...ind, ...updates } : ind) })),
  fibonacciDrawings: [],
  addFibonacci: () => {},
  removeFibonacci: () => {},
  clearAllDrawings: () => {},
  riskRewardDrawings: [],
  addRiskReward: () => {},
  removeRiskReward: () => {},
  updateRiskReward: () => {},
  selectedRiskRewardId: null,
  setSelectedRiskRewardId: (selectedRiskRewardId) => set({ selectedRiskRewardId }),
  crosshairData: null,
  setCrosshairData: (crosshairData) => set({ crosshairData }),
  rightPanelOpen: true,
  rightPanelTab: 'indicators',
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),
  undoLastDeletion: () => {},
  redoLastDeletion: () => {},
  multiTfMode: false,
  setMultiTfMode: (multiTfMode) => set({ multiTfMode }),
  chartFontSize: 11,
  setChartFontSize: (chartFontSize) => set({ chartFontSize }),
  timezone: 'Exchange',
  setTimezone: (timezone) => set({ timezone }),
  alertCandles: {},
  setAlertCandles: () => {},
  updateAlertCandle: () => {},
  drawingDefaults: {
    trendline: { color: '#2563eb', thickness: 2, lineStyle: 'solid' },
    horizontal: { color: '#eab308', thickness: 2, lineStyle: 'solid' },
    alertLine: { color: '#eab308', thickness: 2, lineStyle: 'solid' },
  },
  setDrawingDefault: () => {},
  compoundAlerts: [],
  addCompoundAlert: () => {},
  removeCompoundAlert: () => {},
  clearCompoundAlerts: () => {},
  alertTemplates: [],
  addAlertTemplate: () => {},
  removeAlertTemplate: () => {},
  favorites: [],
  toggleFavorite: () => {},
  htfOverlay: { layers: [...DEFAULT_LAYERS], autoMode: true, trendAlignment: false },
  updateHTFLayer: (index, updates) => set((s) => {
    const layers = [...s.htfOverlay.layers];
    layers[index] = { ...layers[index], ...updates };
    return { htfOverlay: { ...s.htfOverlay, layers } };
  }),
  removeHTFLayer: (index) => set((s) => ({ htfOverlay: { ...s.htfOverlay, layers: s.htfOverlay.layers.filter((_, i) => i !== index) } })),
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
    smartMoneyAlerts: state.smartMoneyAlerts,
    fibonacciDrawings: state.fibonacciDrawings,
    riskRewardDrawings: state.riskRewardDrawings,
    symbol: state.symbol,
    timeframe: state.timeframe,
    marketType: state.marketType,
    chartFontSize: state.chartFontSize,
    timezone: state.timezone,
    drawingDefaults: state.drawingDefaults,
  }),
}));