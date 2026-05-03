/**
 * Chart Layout Save/Load Service
 * 
 * Stores chart layouts in localStorage. Structured for easy migration
 * to server-based sync (swap the storage adapter).
 */

export interface SavedChartLayout {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  snapshot: ChartSnapshot;
}

export interface ChartSnapshot {
  symbol: string;
  timeframe: string;
  marketType: string;
  chartMode: string;
  timezone: string;
  chartFontSize: number;
  drawingDefaults: any;
  indicators: any[];
  trendlines: any[];
  fibonacciDrawings: any[];
  riskRewardDrawings: any[];
  alerts: any[];
  alertLogs: any[];
  indicatorCrossAlerts: any[];
  indicatorThresholdAlerts: any[];
  stochRSICrossAlerts: any[];
  pctDiffDonCrossAlerts: any[];
  compoundAlerts: any[];
  alertTemplates: any[];
}

const STORAGE_KEY = 'saved-chart-layouts';

// ─── Storage adapter (swap for server-based sync later) ─────────

function readAll(): SavedChartLayout[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeAll(layouts: SavedChartLayout[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
}

// ─── Public API ─────────────────────────────────────────────────

export function listLayouts(): SavedChartLayout[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveLayout(name: string, snapshot: ChartSnapshot): SavedChartLayout {
  const layouts = readAll();
  const existing = layouts.find((l) => l.name === name);
  if (existing) {
    existing.snapshot = snapshot;
    existing.updatedAt = Date.now();
    writeAll(layouts);
    return existing;
  }
  const layout: SavedChartLayout = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    snapshot,
  };
  layouts.push(layout);
  writeAll(layouts);
  return layout;
}

export function deleteLayout(id: string) {
  writeAll(readAll().filter((l) => l.id !== id));
}

export function renameLayout(id: string, newName: string) {
  const layouts = readAll();
  const layout = layouts.find((l) => l.id === id);
  if (layout) {
    layout.name = newName;
    layout.updatedAt = Date.now();
    writeAll(layouts);
  }
}

export function getLayout(id: string): SavedChartLayout | undefined {
  return readAll().find((l) => l.id === id);
}

/**
 * Extract a ChartSnapshot from the current chart store state
 */
export function extractSnapshot(state: any): ChartSnapshot {
  return {
    symbol: state.symbol,
    timeframe: state.timeframe,
    marketType: state.marketType,
    chartMode: state.chartMode,
    timezone: state.timezone,
    chartFontSize: state.chartFontSize,
    drawingDefaults: state.drawingDefaults,
    indicators: state.indicators || [],
    trendlines: state.trendlines || [],
    fibonacciDrawings: state.fibonacciDrawings || [],
    riskRewardDrawings: state.riskRewardDrawings || [],
    alerts: state.alerts || [],
    alertLogs: state.alertLogs || [],
    indicatorCrossAlerts: state.indicatorCrossAlerts || [],
    indicatorThresholdAlerts: state.indicatorThresholdAlerts || [],
    stochRSICrossAlerts: state.stochRSICrossAlerts || [],
    pctDiffDonCrossAlerts: state.pctDiffDonCrossAlerts || [],
    compoundAlerts: state.compoundAlerts || [],
    alertTemplates: state.alertTemplates || [],
  };
}
