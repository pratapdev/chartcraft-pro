/**
 * Sync service for pushing/pulling chart state to/from the local server.
 * 
 * Configure the server URL. When the server is not reachable, falls back
 * gracefully to localStorage (the existing Zustand persist layer).
 */

const SYNC_SERVER_URL = localStorage.getItem('sync-server-url') || 'http://localhost:3001';

export function setSyncServerUrl(url: string) {
  localStorage.setItem('sync-server-url', url.replace(/\/$/, ''));
}

export function getSyncServerUrl(): string {
  return localStorage.getItem('sync-server-url') || 'http://localhost:3001';
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
    const url = getSyncServerUrl();
    const res = await fetch(`${url}/api/sync/state`, {
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
    const url = getSyncServerUrl();
    const res = await fetch(`${url}/api/sync/state`, {
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
    const url = getSyncServerUrl();
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) });
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
