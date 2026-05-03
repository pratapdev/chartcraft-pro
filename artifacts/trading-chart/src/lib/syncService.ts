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

const normalizeSyncPayload = (data: any): SyncPayload => ({
  state: data?.state ? {
    symbol: String(data.state.symbol),
    timeframe: data.state.timeframe as Timeframe,
    marketType: data.state.marketType as MarketType,
    chartFontSize: toNum(data.state.chartFontSize, 11),
    drawingDefaults: data.state.drawingDefaults || {},
  } : null,
  trendlines: (data?.trendlines || []).map((t: any) => ({
    ...t,
    startTime: toNum(t.startTime),
    startPrice: toNum(t.startPrice),
    endTime: toNum(t.endTime),
    endPrice: toNum(t.endPrice),
    thickness: toNum(t.thickness, 1),
    createdAt: toNum(t.createdAt),
  })),
  indicators: (data?.indicators || []).map((i: any) => ({
    ...i,
    period: toNum(i.period, 20),
    lineWidth: toNum(i.lineWidth, 1),
    stdDev: i.stdDev === null || i.stdDev === undefined ? undefined : toNum(i.stdDev),
    multiplier: i.multiplier === null || i.multiplier === undefined ? undefined : toNum(i.multiplier),
  })),
  alerts: (data?.alerts || []).map((a: any) => ({
    ...a,
    createdAt: toNum(a.createdAt),
    triggeredAt: a.triggeredAt === null || a.triggeredAt === undefined ? undefined : toNum(a.triggeredAt),
  })),
  alertLogs: (data?.alertLogs || []).map((l: any) => ({
    ...l,
    timestamp: toNum(l.timestamp),
    price: toNum(l.price),
  })),
  fibonacciDrawings: (data?.fibonacciDrawings || []).map((f: any) => ({
    ...f,
    startTime: toNum(f.startTime),
    startPrice: toNum(f.startPrice),
    endTime: toNum(f.endTime),
    endPrice: toNum(f.endPrice),
    createdAt: toNum(f.createdAt),
  })),
  indicatorCrossAlerts: (data?.indicatorCrossAlerts || []).map((a: any) => ({
    ...a,
    createdAt: toNum(a.createdAt),
    triggeredAt: a.triggeredAt === null || a.triggeredAt === undefined ? undefined : toNum(a.triggeredAt),
  })),
  indicatorThresholdAlerts: (data?.indicatorThresholdAlerts || []).map((a: any) => ({
    ...a,
    threshold: toNum(a.threshold),
    createdAt: toNum(a.createdAt),
    triggeredAt: a.triggeredAt === null || a.triggeredAt === undefined ? undefined : toNum(a.triggeredAt),
  })),
  stochRSICrossAlerts: (data?.stochRSICrossAlerts || []).map((a: any) => ({
    ...a,
    createdAt: toNum(a.createdAt),
    triggeredAt: a.triggeredAt === null || a.triggeredAt === undefined ? undefined : toNum(a.triggeredAt),
  })),
  pctDiffDonCrossAlerts: (data?.pctDiffDonCrossAlerts || []).map((a: any) => ({
    ...a,
    createdAt: toNum(a.createdAt),
    triggeredAt: a.triggeredAt === null || a.triggeredAt === undefined ? undefined : toNum(a.triggeredAt),
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

export function extractSyncPayload(storeState: any): SyncPayload {
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
