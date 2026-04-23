import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Candle,
  Timeframe,
  Trendline,
  DrawingTool,
  IndicatorConfig,
  FibonacciDrawing,
  RiskRewardDrawing,
  LineStyleType,
} from '@/types/trading';
import { fetchCandles } from '@/lib/marketData';

// ─── Per-panel state shape ──────────────────────────────────────────

export interface PanelState {
  symbol: string;
  timeframe: Timeframe;
  indicators: IndicatorConfig[];
  trendlines: Trendline[];
  fibonacciDrawings: FibonacciDrawing[];
  riskRewardDrawings: RiskRewardDrawing[];
  activeTool: DrawingTool;
  selectedTrendlineId: string | null;
  selectedRiskRewardId: string | null;
  candles: Candle[];
  loading: boolean;
  crosshairData: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null;
  drawingDefaults: {
    trendline: { color: string; thickness: number; lineStyle: LineStyleType };
    horizontal: { color: string; thickness: number; lineStyle: LineStyleType };
  };
}

const DEFAULT_DRAWING_DEFAULTS = {
  trendline: { color: '#2563eb', thickness: 2, lineStyle: 'solid' as LineStyleType },
  horizontal: { color: '#eab308', thickness: 2, lineStyle: 'solid' as LineStyleType },
};

const DEFAULT_INDICATORS: IndicatorConfig[] = [
  { id: 'panel-ema-20', type: 'EMA', period: 20, color: '#2962FF', visible: true },
  { id: 'panel-ema-50', type: 'EMA', period: 50, color: '#FF6D00', visible: true },
];

const DEFAULT_TIMEFRAMES: Timeframe[] = ['15m', '1h', '4h', '1D'];
const DEFAULT_TIMEFRAMES_2: Timeframe[] = ['1h', '1D'];

function createDefaultPanel(symbol: string, timeframe: Timeframe, panelIndex: number): PanelState {
  return {
    symbol,
    timeframe,
    indicators: DEFAULT_INDICATORS.map((ind) => ({
      ...ind,
      id: `${ind.id}-p${panelIndex}-${Date.now()}`,
    })),
    trendlines: [],
    fibonacciDrawings: [],
    riskRewardDrawings: [],
    activeTool: 'cursor',
    selectedTrendlineId: null,
    selectedRiskRewardId: null,
    candles: [],
    loading: false,
    crosshairData: null,
    drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS },
  };
}

// ─── Store interface ────────────────────────────────────────────────

interface MultiPanelStore {
  panels: Record<number, PanelState>;
  activePanelIndex: number;
  gridMode: 2 | 4;
  syncCrosshairTime: number | null;

  // Grid
  setGridMode: (mode: 2 | 4) => void;
  setActivePanelIndex: (index: number) => void;
  setSyncCrosshairTime: (time: number | null) => void;

  // Per-panel: symbol/timeframe
  setPanelSymbol: (index: number, symbol: string) => void;
  setPanelTimeframe: (index: number, tf: Timeframe) => void;

  // Per-panel: candles
  setPanelCandles: (index: number, candles: Candle[]) => void;
  updatePanelLastCandle: (index: number, candle: Candle) => void;
  setPanelLoading: (index: number, loading: boolean) => void;
  loadPanelCandles: (index: number) => Promise<void>;

  // Per-panel: indicators
  addPanelIndicator: (index: number, ind: IndicatorConfig) => void;
  removePanelIndicator: (index: number, id: string) => void;
  updatePanelIndicator: (index: number, id: string, updates: Partial<IndicatorConfig>) => void;
  togglePanelIndicator: (index: number, id: string) => void;
  clearPanelIndicators: (index: number) => void;

  // Per-panel: trendlines
  addPanelTrendline: (index: number, line: Trendline) => void;
  updatePanelTrendline: (index: number, id: string, updates: Partial<Trendline>) => void;
  removePanelTrendline: (index: number, id: string) => void;
  setPanelSelectedTrendlineId: (index: number, id: string | null) => void;

  // Per-panel: fibonacci
  addPanelFibonacci: (index: number, fib: FibonacciDrawing) => void;
  removePanelFibonacci: (index: number, id: string) => void;

  // Per-panel: risk/reward
  addPanelRiskReward: (index: number, rr: RiskRewardDrawing) => void;
  removePanelRiskReward: (index: number, id: string) => void;
  updatePanelRiskReward: (index: number, id: string, updates: Partial<RiskRewardDrawing>) => void;
  setPanelSelectedRiskRewardId: (index: number, id: string | null) => void;

  // Per-panel: tools
  setPanelActiveTool: (index: number, tool: DrawingTool) => void;
  setPanelCrosshairData: (index: number, data: PanelState['crosshairData']) => void;

  // Per-panel: clear all drawings
  clearPanelDrawings: (index: number) => void;

  // Per-panel: drawing defaults
  setPanelDrawingDefault: (index: number, type: 'trendline' | 'horizontal', updates: Partial<{ color: string; thickness: number; lineStyle: LineStyleType }>) => void;

  // Init panels for current global symbol
  initPanels: (globalSymbol: string) => void;
}

// ─── Helper to update a single panel ────────────────────────────────

function updatePanel(
  panels: Record<number, PanelState>,
  index: number,
  updates: Partial<PanelState>
): Record<number, PanelState> {
  return {
    ...panels,
    [index]: { ...panels[index], ...updates },
  };
}

// ─── Store implementation ───────────────────────────────────────────

export const useMultiPanelStore = create<MultiPanelStore>()(
  persist(
    (set, get) => ({
      panels: {},
      activePanelIndex: 0,
      gridMode: 4,
      syncCrosshairTime: null,

      setGridMode: (gridMode) => set({ gridMode }),
      setActivePanelIndex: (activePanelIndex) => set({ activePanelIndex }),
      setSyncCrosshairTime: (syncCrosshairTime) => set({ syncCrosshairTime }),

      // ─── Symbol / Timeframe ─────────────────────────────────────

      setPanelSymbol: (index, symbol) => {
        const panels = get().panels;
        set({ panels: updatePanel(panels, index, { symbol }) });
        get().loadPanelCandles(index);
      },

      setPanelTimeframe: (index, timeframe) => {
        const panels = get().panels;
        set({ panels: updatePanel(panels, index, { timeframe }) });
        get().loadPanelCandles(index);
      },

      // ─── Candles ────────────────────────────────────────────────

      setPanelCandles: (index, candles) => {
        set({ panels: updatePanel(get().panels, index, { candles }) });
      },

      updatePanelLastCandle: (index, candle) => {
        const panel = get().panels[index];
        if (!panel) return;
        const candles = [...panel.candles];
        const lastIdx = candles.length - 1;
        if (lastIdx >= 0 && candles[lastIdx].time === candle.time) {
          candles[lastIdx] = candle;
        } else {
          candles.push(candle);
        }
        set({ panels: updatePanel(get().panels, index, { candles }) });
      },

      setPanelLoading: (index, loading) => {
        set({ panels: updatePanel(get().panels, index, { loading }) });
      },

      loadPanelCandles: async (index) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({ panels: updatePanel(get().panels, index, { loading: true }) });
        try {
          const candles = await fetchCandles(panel.symbol, panel.timeframe, 300);
          set({ panels: updatePanel(get().panels, index, { candles, loading: false }) });
        } catch {
          set({ panels: updatePanel(get().panels, index, { loading: false }) });
        }
      },

      // ─── Indicators ─────────────────────────────────────────────

      addPanelIndicator: (index, ind) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            indicators: [...panel.indicators, ind],
          }),
        });
      },

      removePanelIndicator: (index, id) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            indicators: panel.indicators.filter((i) => i.id !== id),
          }),
        });
      },

      updatePanelIndicator: (index, id, updates) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            indicators: panel.indicators.map((i) => (i.id === id ? { ...i, ...updates } : i)),
          }),
        });
      },

      togglePanelIndicator: (index, id) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            indicators: panel.indicators.map((i) =>
              i.id === id ? { ...i, visible: !i.visible } : i
            ),
          }),
        });
      },

      clearPanelIndicators: (index) => {
        set({ panels: updatePanel(get().panels, index, { indicators: [] }) });
      },

      // ─── Trendlines ─────────────────────────────────────────────

      addPanelTrendline: (index, line) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            trendlines: [...panel.trendlines, line],
          }),
        });
      },

      updatePanelTrendline: (index, id, updates) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            trendlines: panel.trendlines.map((t) => (t.id === id ? { ...t, ...updates } : t)),
          }),
        });
      },

      removePanelTrendline: (index, id) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            trendlines: panel.trendlines.filter((t) => t.id !== id),
            selectedTrendlineId: panel.selectedTrendlineId === id ? null : panel.selectedTrendlineId,
          }),
        });
      },

      setPanelSelectedTrendlineId: (index, id) => {
        set({ panels: updatePanel(get().panels, index, { selectedTrendlineId: id }) });
      },

      // ─── Fibonacci ──────────────────────────────────────────────

      addPanelFibonacci: (index, fib) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            fibonacciDrawings: [...panel.fibonacciDrawings, fib],
          }),
        });
      },

      removePanelFibonacci: (index, id) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            fibonacciDrawings: panel.fibonacciDrawings.filter((f) => f.id !== id),
          }),
        });
      },

      // ─── Risk/Reward ────────────────────────────────────────────

      addPanelRiskReward: (index, rr) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            riskRewardDrawings: [...panel.riskRewardDrawings, rr],
          }),
        });
      },

      removePanelRiskReward: (index, id) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            riskRewardDrawings: panel.riskRewardDrawings.filter((r) => r.id !== id),
          }),
        });
      },

      updatePanelRiskReward: (index, id, updates) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            riskRewardDrawings: panel.riskRewardDrawings.map((r) =>
              r.id === id ? { ...r, ...updates } : r
            ),
          }),
        });
      },

      setPanelSelectedRiskRewardId: (index, id) => {
        set({ panels: updatePanel(get().panels, index, { selectedRiskRewardId: id }) });
      },

      // ─── Tools ──────────────────────────────────────────────────

      setPanelActiveTool: (index, tool) => {
        set({ panels: updatePanel(get().panels, index, { activeTool: tool }) });
      },

      setPanelCrosshairData: (index, data) => {
        set({ panels: updatePanel(get().panels, index, { crosshairData: data }) });
      },

      // ─── Clear drawings ─────────────────────────────────────────

      clearPanelDrawings: (index) => {
        set({
          panels: updatePanel(get().panels, index, {
            trendlines: [],
            fibonacciDrawings: [],
            riskRewardDrawings: [],
            selectedTrendlineId: null,
            selectedRiskRewardId: null,
          }),
        });
      },

      // ─── Drawing defaults ───────────────────────────────────────

      setPanelDrawingDefault: (index, type, updates) => {
        const panel = get().panels[index];
        if (!panel) return;
        set({
          panels: updatePanel(get().panels, index, {
            drawingDefaults: {
              ...panel.drawingDefaults,
              [type]: { ...panel.drawingDefaults[type], ...updates },
            },
          }),
        });
      },

      // ─── Initialize panels ──────────────────────────────────────

      initPanels: (globalSymbol) => {
        const existing = get().panels;
        // Only initialize if panels are empty
        if (Object.keys(existing).length >= 4) return;
        const newPanels: Record<number, PanelState> = {};
        for (let i = 0; i < 4; i++) {
          if (existing[i]) {
            newPanels[i] = existing[i];
          } else {
            newPanels[i] = createDefaultPanel(
              globalSymbol,
              DEFAULT_TIMEFRAMES[i] || '1h',
              i
            );
          }
        }
        set({ panels: newPanels });
      },
    }),
    {
      name: 'multi-panel-store',
      partialize: (state) => ({
        panels: Object.fromEntries(
          Object.entries(state.panels).map(([key, panel]) => [
            key,
            {
              symbol: panel.symbol,
              timeframe: panel.timeframe,
              indicators: panel.indicators,
              trendlines: panel.trendlines,
              fibonacciDrawings: panel.fibonacciDrawings,
              riskRewardDrawings: panel.riskRewardDrawings,
              drawingDefaults: panel.drawingDefaults,
            },
          ])
        ),
        gridMode: state.gridMode,
        activePanelIndex: state.activePanelIndex,
      }),
    }
  )
);
