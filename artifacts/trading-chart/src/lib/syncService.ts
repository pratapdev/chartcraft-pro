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
}

/**
 * Pull the full chart state from the server
 */
export async function pullState(): Promise<SyncState | null> {
  try {
    const res = await fetch('/api/sync/state', {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[Sync] Pull failed (server may be offline):', (err as Error).message);
    return null;
  }
}

/**
 * Push the full chart state to the server
 */
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

/**
 * Check if the sync server is reachable
 */
export async function checkSyncHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/healthz', { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Extract syncable state from chart store
 */
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
  };
}
