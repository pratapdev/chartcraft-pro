import type { Alert, AlertLog, FibonacciDrawing, IndicatorConfig, IndicatorCrossAlert, IndicatorThresholdAlert, MarketType, PctDiffDonCrossAlert, StochRSICrossAlert, Timeframe, Trendline } from '@/types/trading';

export interface SyncPayload {
  state: {
    symbol: string;
    timeframe: Timeframe;
    marketType: MarketType;
    chartFontSize: number;
    drawingDefaults: Record<string, unknown>;
  };
  trendlines: Trendline[];
  indicators: IndicatorConfig[];
  alerts: Alert[];
  alertLogs: AlertLog[];
  fibonacciDrawings: FibonacciDrawing[];
  indicatorCrossAlerts: IndicatorCrossAlert[];
  indicatorThresholdAlerts: IndicatorThresholdAlert[];
  stochRSICrossAlerts: StochRSICrossAlert[];
  pctDiffDonCrossAlerts: PctDiffDonCrossAlert[];
}

const toNum = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
};

// Raw shape returned by the server (all numeric fields may be strings from DB serialization)
interface RawServerPayload {
  state?: {
    symbol?: unknown;
    timeframe?: unknown;
    marketType?: unknown;
    chartFontSize?: unknown;
    drawingDefaults?: Record<string, unknown>;
  } | null;
  trendlines?: Record<string, unknown>[];
  indicators?: Record<string, unknown>[];
  alerts?: Record<string, unknown>[];
  alertLogs?: Record<string, unknown>[];
  fibonacciDrawings?: Record<string, unknown>[];
  indicatorCrossAlerts?: Record<string, unknown>[];
  indicatorThresholdAlerts?: Record<string, unknown>[];
  stochRSICrossAlerts?: Record<string, unknown>[];
  pctDiffDonCrossAlerts?: Record<string, unknown>[];
}

const toStr = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

const toOptNum = (v: unknown): number | undefined =>
  v === null || v === undefined ? undefined : toNum(v);

const normalizeSyncPayload = (data: RawServerPayload): SyncPayload => ({
  state: data?.state ? {
    symbol: toStr(data.state.symbol, 'BTC/USD'),
    timeframe: data.state.timeframe as Timeframe,
    marketType: data.state.marketType as MarketType,
    chartFontSize: toNum(data.state.chartFontSize, 11),
    drawingDefaults: data.state.drawingDefaults ?? {},
  } : {
    symbol: 'BTC/USD',
    timeframe: '1h' as Timeframe,
    marketType: 'crypto' as MarketType,
    chartFontSize: 11,
    drawingDefaults: {},
  },
  trendlines: (data?.trendlines ?? []).map((t) => ({
    id: toStr(t.id), symbol: toStr(t.symbol), timeframe: t.timeframe as Timeframe,
    startTime: toNum(t.startTime), startPrice: toNum(t.startPrice),
    endTime: toNum(t.endTime), endPrice: toNum(t.endPrice),
    color: toStr(t.color, '#2962FF'), thickness: toNum(t.thickness, 1),
    lineStyle: t.lineStyle as import('@/types/trading').LineStyleType | undefined,
    createdAt: toNum(t.createdAt),
  })),
  indicators: (data?.indicators ?? []).map((i) => ({
    id: toStr(i.id), type: i.type as IndicatorConfig['type'],
    period: toNum(i.period, 20), color: toStr(i.color, '#2962FF'),
    visible: i.visible !== false,
    lineWidth: toNum(i.lineWidth, 1),
    lineStyle: i.lineStyle as import('@/types/trading').LineStyleType | undefined,
    kPeriod: i.kPeriod !== null && i.kPeriod !== undefined ? toNum(i.kPeriod) : undefined,
    dPeriod: i.dPeriod !== null && i.dPeriod !== undefined ? toNum(i.dPeriod) : undefined,
    color2: typeof i.color2 === 'string' ? i.color2 : undefined,
    stdDev: i.stdDev !== null && i.stdDev !== undefined ? toNum(i.stdDev) : undefined,
    multiplier: i.multiplier !== null && i.multiplier !== undefined ? toNum(i.multiplier) : undefined,
  })),
  alerts: (data?.alerts ?? []).map((a) => ({
    id: toStr(a.id), symbol: toStr(a.symbol), timeframe: a.timeframe as Timeframe,
    trendlineId: toStr(a.trendlineId ?? ''),
    condition: a.condition as Alert['condition'],
    active: a.active !== false, triggered: Boolean(a.triggered),
    triggeredAt: toOptNum(a.triggeredAt),
    message: typeof a.message === 'string' ? a.message : undefined,
    createdAt: toNum(a.createdAt),
    telegramEnabled: a.telegramEnabled !== false,
  })),
  alertLogs: (data?.alertLogs ?? []).map((l) => ({
    id: toStr(l.id), alertId: toStr(l.alertId ?? ''), symbol: toStr(l.symbol),
    message: toStr(l.message), timestamp: toNum(l.timestamp), price: toNum(l.price),
  })),
  fibonacciDrawings: (data?.fibonacciDrawings ?? []).map((f) => ({
    id: toStr(f.id), symbol: toStr(f.symbol), timeframe: f.timeframe as Timeframe,
    startTime: toNum(f.startTime), startPrice: toNum(f.startPrice),
    endTime: toNum(f.endTime), endPrice: toNum(f.endPrice), createdAt: toNum(f.createdAt),
  })),
  indicatorCrossAlerts: (data?.indicatorCrossAlerts ?? []).map((a) => ({
    id: toStr(a.id), symbol: toStr(a.symbol), timeframe: a.timeframe as Timeframe,
    indicatorId1: toStr(a.indicatorId1), indicatorId2: toStr(a.indicatorId2),
    condition: a.condition as IndicatorCrossAlert['condition'],
    active: a.active !== false, triggered: Boolean(a.triggered),
    triggeredAt: toOptNum(a.triggeredAt),
    message: typeof a.message === 'string' ? a.message : undefined,
    createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled !== false,
  })),
  indicatorThresholdAlerts: (data?.indicatorThresholdAlerts ?? []).map((a) => ({
    id: toStr(a.id), symbol: toStr(a.symbol), timeframe: a.timeframe as Timeframe,
    indicatorId: toStr(a.indicatorId), condition: a.condition as IndicatorThresholdAlert['condition'],
    threshold: toNum(a.threshold),
    active: a.active !== false, triggered: Boolean(a.triggered),
    triggeredAt: toOptNum(a.triggeredAt),
    message: typeof a.message === 'string' ? a.message : undefined,
    createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled !== false,
  })),
  stochRSICrossAlerts: (data?.stochRSICrossAlerts ?? []).map((a) => ({
    id: toStr(a.id), symbol: toStr(a.symbol), timeframe: a.timeframe as Timeframe,
    indicatorId: toStr(a.indicatorId), condition: a.condition as StochRSICrossAlert['condition'],
    active: a.active !== false, triggered: Boolean(a.triggered),
    triggeredAt: toOptNum(a.triggeredAt),
    message: typeof a.message === 'string' ? a.message : undefined,
    createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled !== false,
  })),
  // pctDiffDonCrossAlerts: server returns [] (no DB table); we accept [] from server
  pctDiffDonCrossAlerts: (data?.pctDiffDonCrossAlerts ?? []).map((a) => ({
    id: toStr(a.id), symbol: toStr(a.symbol), timeframe: a.timeframe as Timeframe,
    indicatorId: toStr(a.indicatorId),
    line1: a.line1 as PctDiffDonCrossAlert['line1'],
    line2: a.line2 as PctDiffDonCrossAlert['line2'],
    condition: a.condition as PctDiffDonCrossAlert['condition'],
    active: a.active !== false, triggered: Boolean(a.triggered),
    triggeredAt: toOptNum(a.triggeredAt),
    message: typeof a.message === 'string' ? a.message : undefined,
    createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled !== false,
  })),
});

export async function pullState(): Promise<SyncPayload | null> {
  try {
    const res = await fetch('/api/sync/state', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return normalizeSyncPayload(await res.json());
  } catch (error) {
    console.warn('[Sync] Pull failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function pushState(data: SyncPayload): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (error) {
    console.warn('[Sync] Push failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

export async function checkSyncHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/healthz', { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

interface StoreStateForSync {
  symbol: string;
  timeframe: Timeframe;
  marketType: MarketType;
  chartFontSize: number;
  drawingDefaults: Record<string, unknown>;
  trendlines: Trendline[];
  indicators: IndicatorConfig[];
  alerts: Alert[];
  alertLogs: AlertLog[];
  fibonacciDrawings: FibonacciDrawing[];
  indicatorCrossAlerts: IndicatorCrossAlert[];
  indicatorThresholdAlerts: IndicatorThresholdAlert[];
  stochRSICrossAlerts: StochRSICrossAlert[];
  pctDiffDonCrossAlerts: PctDiffDonCrossAlert[];
}

export function extractSyncPayload(storeState: StoreStateForSync): SyncPayload {
  return {
    state: {
      symbol: storeState.symbol,
      timeframe: storeState.timeframe,
      marketType: storeState.marketType,
      chartFontSize: storeState.chartFontSize,
      drawingDefaults: storeState.drawingDefaults,
    },
    trendlines: storeState.trendlines || [],
    indicators: storeState.indicators || [],
    alerts: storeState.alerts || [],
    alertLogs: storeState.alertLogs || [],
    fibonacciDrawings: storeState.fibonacciDrawings || [],
    indicatorCrossAlerts: storeState.indicatorCrossAlerts || [],
    indicatorThresholdAlerts: storeState.indicatorThresholdAlerts || [],
    stochRSICrossAlerts: storeState.stochRSICrossAlerts || [],
    pctDiffDonCrossAlerts: storeState.pctDiffDonCrossAlerts || [],
  };
}
