/**
 * Sync service for pushing/pulling chart state to/from the API server.
 * 
 * Uses the Replit shared proxy at /api/sync/*
 * Falls back gracefully to localStorage when the server is not reachable.
 */

export function getSyncServerUrl(): string {
  return '';
}

export function setSyncServerUrl(_url: string) {
  // No-op: in Replit we always use the relative /api path via the shared proxy
}

interface SyncState {
  state: {
    symbol: string;
    timeframe: string;
    marketType: string;
    chartFontSize: number;
    drawingDefaults: any;
  };
  trendlines: any[];
  indicators: any[];
  alerts: any[];
  alertLogs: any[];
  fibonacciDrawings: any[];
  indicatorCrossAlerts: any[];
  indicatorThresholdAlerts: any[];
  stochRSICrossAlerts: any[];
  pctDiffDonCrossAlerts: any[];
}

const toNum = (value: any, fallback = 0) => {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeSyncState = (data: any): SyncState => ({
  state: data?.state ? {
    symbol: data.state.symbol,
    timeframe: data.state.timeframe,
    marketType: data.state.marketType,
    chartFontSize: toNum(data.state.chartFontSize, 11),
    drawingDefaults: data.state.drawingDefaults || {},
  } : null,
  trendlines: (data?.trendlines || []).map((t: any) => ({
    ...t,
    startPrice: toNum(t.startPrice),
    endPrice: toNum(t.endPrice),
    thickness: toNum(t.thickness, 1),
  })),
  indicators: (data?.indicators || []).map((i: any) => ({
    ...i,
    period: toNum(i.period, 20),
    lineWidth: toNum(i.lineWidth, 1),
    stdDev: i.stdDev === null || i.stdDev === undefined ? null : toNum(i.stdDev),
    multiplier: i.multiplier === null || i.multiplier === undefined ? null : toNum(i.multiplier),
  })),
  alerts: data?.alerts || [],
  alertLogs: (data?.alertLogs || []).map((l: any) => ({
    ...l,
    timestamp: toNum(l.timestamp),
    price: toNum(l.price),
  })),
  fibonacciDrawings: (data?.fibonacciDrawings || []).map((f: any) => ({
    ...f,
    startPrice: toNum(f.startPrice),
    endPrice: toNum(f.endPrice),
  })),
  indicatorCrossAlerts: data?.indicatorCrossAlerts || [],
  indicatorThresholdAlerts: (data?.indicatorThresholdAlerts || []).map((a: any) => ({
    ...a,
    threshold: toNum(a.threshold),
  })),
  stochRSICrossAlerts: data?.stochRSICrossAlerts || [],
  pctDiffDonCrossAlerts: data?.pctDiffDonCrossAlerts || [],
});

export async function pullState(): Promise<SyncState | null> {
  try {
    const res = await fetch('/api/sync/state', {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return normalizeSyncState(await res.json());
  } catch (err) {
    console.warn('[Sync] Pull failed (server may be offline):', (err as Error).message);
    return null;
  }
}

export async function pushState(data: SyncState): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (err) {
    console.warn('[Sync] Push failed (server may be offline):', (err as Error).message);
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

export function extractSyncPayload(storeState: any): SyncState {
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
