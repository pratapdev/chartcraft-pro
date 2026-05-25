import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  chartStateTable, trendlinesTable, chartAlertsTable,
  chartAlertLogsTable, chartIndicatorsTable, fibonacciDrawingsTable,
  indicatorCrossAlertsTable, indicatorThresholdAlertsTable, stochRSICrossAlertsTable,
  chartLayoutsTable, trackerWatchlistTable, trackerEntriesTable, smartMoneyAlertsTable,
  compoundAlertsTable, pctDiffDonCrossAlertsTable,
} from "@workspace/db/schema";




const router: IRouter = Router();

// ---- Typed helpers ----

const toNum = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
};

const toStr = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const toBool = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return fallback;
};

const toOptNum = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};


const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

function uniqueBy<T>(arr: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}


// ---- Simple API-key guard (localhost-only deployments) ----
// If SYNC_API_KEY env var is set, all /api/sync/* requests must supply
// the matching X-Sync-Key header. If the env var is unset, requests are
// allowed through (development convenience).

const syncAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requiredKey = process.env.SYNC_API_KEY;
  if (!requiredKey) { next(); return; }
  const provided = req.headers['x-sync-key'];
  if (!provided || provided !== requiredKey) {
    res.status(401).json({ error: 'Unauthorized: missing or invalid X-Sync-Key header' });
    return;
  }
  next();
};

router.use('/sync', syncAuthMiddleware);

// ---- Auto-Migration (Fixing Schema Mismatches) ----
(async () => {
  try {
    // Check if tracker_watchlist exists and has the 'id' column
    const res = await db.run(sql`PRAGMA table_info(tracker_watchlist)`);
    const columns = res.rows as any[];
    const hasId = columns.some(c => c.name === 'id');
    
    if (columns.length > 0 && !hasId) {
      console.log('[Migration] tracker_watchlist table is outdated. Recreating...');
      await db.run(sql`DROP TABLE tracker_watchlist`);
      await db.run(sql`CREATE TABLE \`tracker_watchlist\` (\`id\` text PRIMARY KEY NOT NULL, \`symbol\` text NOT NULL, \`timeframe\` text NOT NULL, \`strategy\` text NOT NULL)`);
      console.log('[Migration] tracker_watchlist recreated successfully.');
    }

    // Ensure tracker_entries exists
    const entriesRes = await db.run(sql`PRAGMA table_info(tracker_entries)`);
    if (entriesRes.rows.length === 0) {
      console.log('[Migration] tracker_entries table missing. Creating...');
      await db.run(sql`CREATE TABLE \`tracker_entries\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`symbol\` text NOT NULL,
        \`timeframe\` text NOT NULL,
        \`strategy\` text NOT NULL,
        \`direction\` text NOT NULL,
        \`entry_price\` real NOT NULL,
        \`entry_time\` integer NOT NULL,
        \`active\` integer DEFAULT 1 NOT NULL,
        \`current_price\` real,
        \`perf5m\` real, \`perf15m\` real, \`perf30m\` real, \`perf1h\` real,
        \`perf4h\` real, \`perf12h\` real, \`perf1D\` real, \`perf3D\` real,
        \`perf7D\` real, \`perf1M\` real
      )`);
      console.log('[Migration] tracker_entries created successfully.');
    }

    // Ensure smart_money_alerts exists
    const smartRes = await db.run(sql`PRAGMA table_info(smart_money_alerts)`);
    if (smartRes.rows.length === 0) {
      console.log('[Migration] smart_money_alerts table missing. Creating...');
      await db.run(sql`CREATE TABLE \`smart_money_alerts\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`symbol\` text NOT NULL,
        \`timeframe\` text NOT NULL,
        \`condition\` text NOT NULL,
        \`active\` integer DEFAULT 1 NOT NULL,
        \`triggered\` integer DEFAULT 0 NOT NULL,
        \`triggered_at\` integer,
        \`last_fired_candle_time\` integer,
        \`message\` text,
        \`created_at\` integer NOT NULL,
        \`telegram_enabled\` integer DEFAULT 1 NOT NULL,
        \`whatsapp_enabled\` integer DEFAULT 1 NOT NULL
      )`);
      console.log('[Migration] smart_money_alerts created successfully.');
    }
    
    // Ensure compound_alerts exists
    const compoundRes = await db.run(sql`PRAGMA table_info(compound_alerts)`);
    if (compoundRes.rows.length === 0) {
      console.log('[Migration] compound_alerts table missing. Creating...');
      await db.run(sql`CREATE TABLE \`compound_alerts\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`symbol\` text NOT NULL,
        \`timeframe\` text NOT NULL,
        \`conditions\` text NOT NULL,
        \`active\` integer DEFAULT 1 NOT NULL,
        \`triggered\` integer DEFAULT 0 NOT NULL,
        \`triggered_at\` integer,
        \`message\` text,
        \`created_at\` integer NOT NULL,
        \`telegram_enabled\` integer DEFAULT 1 NOT NULL,
        \`whatsapp_enabled\` integer DEFAULT 1 NOT NULL
      )`);
      console.log('[Migration] compound_alerts created successfully.');
    }

    // Ensure pct_diff_don_cross_alerts exists
    const pctRes = await db.run(sql`PRAGMA table_info(pct_diff_don_cross_alerts)`);
    if (pctRes.rows.length === 0) {
      console.log('[Migration] pct_diff_don_cross_alerts table missing. Creating...');
      await db.run(sql`CREATE TABLE \`pct_diff_don_cross_alerts\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`symbol\` text NOT NULL,
        \`timeframe\` text NOT NULL,
        \`indicator_id\` text NOT NULL,
        \`line1\` text NOT NULL,
        \`line2\` text NOT NULL,
        \`condition\` text NOT NULL,
        \`active\` integer DEFAULT 1 NOT NULL,
        \`triggered\` integer DEFAULT 0 NOT NULL,
        \`triggered_at\` integer,
        \`message\` text,
        \`created_at\` integer NOT NULL,
        \`telegram_enabled\` integer DEFAULT 1 NOT NULL,
        \`whatsapp_enabled\` integer DEFAULT 1 NOT NULL
      )`);
      console.log('[Migration] pct_diff_don_cross_alerts created successfully.');
    }

    // --- Column-level migrations for existing tables ---
    const tablesToCheck = [
      'chart_alerts', 
      'indicator_cross_alerts', 
      'indicator_threshold_alerts', 
      'stoch_rsi_cross_alerts',
      'smart_money_alerts',
      'compound_alerts'
    ];
    for (const table of tablesToCheck) {
      const info = await db.run(sql`PRAGMA table_info(${sql.raw(table)})`);
      const cols = info.rows as any[];
      if (!cols.some(c => c.name === 'telegram_enabled')) {
        console.log(`[Migration] Adding telegram_enabled to ${table}...`);
        await db.run(sql`ALTER TABLE ${sql.raw(table)} ADD COLUMN telegram_enabled integer DEFAULT 1 NOT NULL`);
      }
      if (!cols.some(c => c.name === 'whatsapp_enabled')) {
        console.log(`[Migration] Adding whatsapp_enabled to ${table}...`);
        await db.run(sql`ALTER TABLE ${sql.raw(table)} ADD COLUMN whatsapp_enabled integer DEFAULT 1 NOT NULL`);
      }
    }

  } catch (e) {


    console.error('[Migration] Error during auto-migration:', e);
  }
})();


// ---- GET /api/sync/state ----


router.get("/sync/state", async (req: Request, res: Response) => {
  try {
    const [stateRows, trendlines, indicators, alerts, alertLogs, fibonacci,
      indicatorCrossAlerts, indicatorThresholdAlerts, stochRSICrossAlerts,
      chartLayouts, trackerWatchlist, trackerEntries, smartMoneyAlerts, compoundAlerts, pctDiffDonCrossAlerts] = await Promise.all([


      db.select().from(chartStateTable).limit(1),
      db.select().from(trendlinesTable),
      db.select().from(chartIndicatorsTable),
      db.select().from(chartAlertsTable),
      db.select().from(chartAlertLogsTable),
      db.select().from(fibonacciDrawingsTable),
      db.select().from(indicatorCrossAlertsTable),
      db.select().from(indicatorThresholdAlertsTable),
      db.select().from(stochRSICrossAlertsTable),
      db.select().from(chartLayoutsTable),
      db.select().from(trackerWatchlistTable),
      db.select().from(trackerEntriesTable),
      db.select().from(smartMoneyAlertsTable),
      db.select().from(compoundAlertsTable),
      db.select().from(pctDiffDonCrossAlertsTable),
    ]);



    const s = stateRows[0];
    res.json({
      state: s ? {
        symbol: s.symbol,
        timeframe: s.timeframe,
        marketType: s.marketType,
        chartFontSize: toNum(s.chartFontSize, 11),
        drawingDefaults: typeof s.drawingDefaults === 'string' ? JSON.parse(s.drawingDefaults) : s.drawingDefaults,
      } : null,
      trendlines: trendlines.map(t => ({
        id: t.id, symbol: t.symbol, timeframe: t.timeframe,
        startTime: toNum(t.startTime), startPrice: toNum(t.startPrice),
        endTime: toNum(t.endTime), endPrice: toNum(t.endPrice),
        color: t.color, thickness: toNum(t.thickness, 1), lineStyle: t.lineStyle,
        createdAt: toNum(t.createdAt),
      })),
      indicators: indicators.map(i => ({
        id: i.id, type: i.type, period: toNum(i.period, 20), color: i.color,
        visible: i.visible, lineWidth: toNum(i.lineWidth, 1), lineStyle: i.lineStyle,
        kPeriod: i.kPeriod, dPeriod: i.dPeriod, color2: i.color2,
        stdDev: i.stdDev === null ? null : toNum(i.stdDev),
        multiplier: i.multiplier === null ? null : toNum(i.multiplier),
        paneMode: i.paneMode,
        lookbackWindow: i.lookbackWindow,
        emaSmoothing: i.emaSmoothing,
        donchianLength: i.donchianLength,
        donLineDiff: i.donLineDiff === null ? null : toNum(i.donLineDiff),
        zigzagLength: i.zigzagLength,
        fibFactor: i.fibFactor === null ? null : toNum(i.fibFactor),
        threshold: i.indicatorThreshold === null ? null : toNum(i.indicatorThreshold),
        minStack: i.minStack,
        anchorTime: i.anchorTime,
        showBands: i.showBands,
        pivotLen: i.pivotLen,
        sdStrength: i.sdStrength === null ? null : toNum(i.sdStrength),
        sdAtrMult: i.sdAtrMult === null ? null : toNum(i.sdAtrMult),
        showMitigated: i.showMitigated,
        showSweeps: i.showSweeps,
        showSwingDots: i.showSwingDots,
        timeframe: i.htfTimeframe,
        displayMode: i.htfDisplayMode,
        showWicks: i.htfShowWicks,
      })),
      alerts: alerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        trendlineId: a.trendlineId, condition: a.condition,
        active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt !== null ? toNum(a.triggeredAt) : null,
        message: a.message, createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
        whatsappEnabled: a.whatsappEnabled,
      })),

      alertLogs: alertLogs.map(l => ({
        id: l.id, alertId: l.alertId, symbol: l.symbol,
        message: l.message, timestamp: toNum(l.timestamp), price: toNum(l.price),
      })),
      fibonacciDrawings: fibonacci.map(f => ({
        id: f.id, symbol: f.symbol, timeframe: f.timeframe,
        startTime: toNum(f.startTime), startPrice: toNum(f.startPrice),
        endTime: toNum(f.endTime), endPrice: toNum(f.endPrice), createdAt: toNum(f.createdAt),
      })),
      indicatorCrossAlerts: indicatorCrossAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        indicatorId1: a.indicatorId1, indicatorId2: a.indicatorId2,
        condition: a.condition, active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt !== null ? toNum(a.triggeredAt) : null,
        message: a.message, createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
        whatsappEnabled: a.whatsappEnabled,
      })),

      indicatorThresholdAlerts: indicatorThresholdAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        indicatorId: a.indicatorId, condition: a.condition,
        threshold: toNum(a.threshold), active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt !== null ? toNum(a.triggeredAt) : null,
        message: a.message, createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
        whatsappEnabled: a.whatsappEnabled,
      })),

      stochRSICrossAlerts: stochRSICrossAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        indicatorId: a.indicatorId, condition: a.condition,
        active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt !== null ? toNum(a.triggeredAt) : null,
        message: a.message, createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
        whatsappEnabled: a.whatsappEnabled,
      })),
      pctDiffDonCrossAlerts: pctDiffDonCrossAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        indicatorId: a.indicatorId, line1: a.line1, line2: a.line2,
        condition: a.condition, active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt !== null ? toNum(a.triggeredAt) : null,
        message: a.message, createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
        whatsappEnabled: a.whatsappEnabled,
      })),

      smartMoneyAlerts: smartMoneyAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        condition: a.condition, active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt !== null ? toNum(a.triggeredAt) : null,
        lastFiredCandleTime: a.lastFiredCandleTime !== null ? toNum(a.lastFiredCandleTime) : null,
        message: a.message, createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
        whatsappEnabled: a.whatsappEnabled,
      })),
      compoundAlerts: compoundAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        conditions: typeof a.conditions === 'string' ? JSON.parse(a.conditions) : a.conditions,
        active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt !== null ? toNum(a.triggeredAt) : null,
        message: a.message, createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
        whatsappEnabled: a.whatsappEnabled,
      })),


      layouts: chartLayouts.map(l => ({
        id: l.id, name: l.name, createdAt: toNum(l.createdAt), updatedAt: toNum(l.updatedAt),
        snapshot: typeof l.snapshot === 'string' ? JSON.parse(l.snapshot) : l.snapshot,
      })),
      trackerWatchlist: trackerWatchlist.map(w => ({
        symbol: w.symbol, timeframe: w.timeframe,
        strategy: typeof w.strategy === 'string' ? JSON.parse(w.strategy) : w.strategy,
      })),
      trackerEntries: trackerEntries.map(e => ({
        ...e,
        strategy: typeof e.strategy === 'string' ? JSON.parse(e.strategy) : e.strategy,
        active: Boolean(e.active),
      })),
    });
    console.log(`[Sync] GET complete. Watchlist: ${trackerWatchlist.length}, Entries: ${trackerEntries.length}`);
  } catch (e: unknown) {
    console.error("[Sync] GET error:", e);
    req.log.error({ error: errMsg(e) }, "Failed to get sync state");
    res.status(500).json({ error: errMsg(e) });
  }
});


// ---- Typed request body ----

interface SyncStateItem {
  id: string;
  symbol: string;
  timeframe: string;
  [key: string]: unknown;
}

interface SyncBody {
  state?: {
    symbol?: unknown;
    timeframe?: unknown;
    marketType?: unknown;
    chartFontSize?: unknown;
    drawingDefaults?: Record<string, unknown>;
  };
  trendlines?: SyncStateItem[];
  indicators?: SyncStateItem[];
  alerts?: SyncStateItem[];
  alertLogs?: SyncStateItem[];
  fibonacciDrawings?: SyncStateItem[];
  indicatorCrossAlerts?: SyncStateItem[];
  indicatorThresholdAlerts?: SyncStateItem[];
  stochRSICrossAlerts?: SyncStateItem[];
  pctDiffDonCrossAlerts?: SyncStateItem[]; // accepted but not stored (no DB table)
  layouts?: SyncStateItem[];
  trackerWatchlist?: any[];
  trackerEntries?: any[];
  compoundAlerts?: SyncStateItem[];
  smartMoneyAlerts?: SyncStateItem[];
}



// ---- PUT /api/sync/state ----

router.put("/sync/state", async (req: Request<object, object, SyncBody>, res: Response) => {
  const { state, trendlines, indicators, alerts, alertLogs, fibonacciDrawings,
    indicatorCrossAlerts, indicatorThresholdAlerts, stochRSICrossAlerts, layouts,
    trackerWatchlist, trackerEntries, compoundAlerts, pctDiffDonCrossAlerts, smartMoneyAlerts } = req.body;




  try {
    await db.transaction(async (tx) => {

      if (state) {
        await tx.delete(chartStateTable);
        await tx.insert(chartStateTable).values({
          id: 'default',
          symbol: toStr(state.symbol, 'BTC/USD'),
          timeframe: toStr(state.timeframe, '1h'),
          marketType: toStr(state.marketType, 'crypto'),
          chartFontSize: toNum(state.chartFontSize, 11),
          drawingDefaults: JSON.stringify(state.drawingDefaults ?? {}),
        });
      }

      if (Array.isArray(trendlines)) {
        await tx.delete(trendlinesTable);
        const uniqueTrendlines = uniqueBy(trendlines, t => t.id);
        for (const t of uniqueTrendlines) {

          await tx.insert(trendlinesTable).values({
            id: t.id, symbol: t.symbol, timeframe: t.timeframe,
            startTime: toNum(t.startTime), startPrice: String(toNum(t.startPrice)),
            endTime: toNum(t.endTime), endPrice: String(toNum(t.endPrice)),
            color: toStr(t.color, '#2962FF'), thickness: toNum(t.thickness as unknown, 1),
            lineStyle: toStr(t.lineStyle as unknown, 'solid'), createdAt: toNum(t.createdAt as unknown),
          });
        }
      }

      if (Array.isArray(indicators)) {
        await tx.delete(chartIndicatorsTable);
        const uniqueIndicators = uniqueBy(indicators, i => i.id);
        for (const i of uniqueIndicators) {

          await tx.insert(chartIndicatorsTable).values({
            id: toStr(i.id as unknown),
            type: toStr(i.type as unknown),
            period: toNum(i.period as unknown, 20),
            color: toStr(i.color as unknown, '#2962FF'),
            visible: toBool(i.visible as unknown, true),
            lineWidth: toNum(i.lineWidth as unknown, 1),
            lineStyle: toStr(i.lineStyle as unknown, 'solid'),
            kPeriod: toOptNum(i.kPeriod as unknown),
            dPeriod: toOptNum(i.dPeriod as unknown),
            color2: i.color2 ? toStr(i.color2 as unknown) : null,
            stdDev: i.stdDev !== null && i.stdDev !== undefined ? String(toNum(i.stdDev as unknown)) : null,
            multiplier: i.multiplier !== null && i.multiplier !== undefined ? String(toNum(i.multiplier as unknown)) : null,
            paneMode: i.paneMode ? toStr(i.paneMode as unknown) : null,
            lookbackWindow: toOptNum(i.lookbackWindow as unknown),
            emaSmoothing: toOptNum(i.emaSmoothing as unknown),
            donchianLength: toOptNum(i.donchianLength as unknown),
            donLineDiff: i.donLineDiff !== null && i.donLineDiff !== undefined ? String(toNum(i.donLineDiff as unknown)) : null,
            zigzagLength: toOptNum(i.zigzagLength as unknown),
            fibFactor: i.fibFactor !== null && i.fibFactor !== undefined ? String(toNum(i.fibFactor as unknown)) : null,
            indicatorThreshold: i.threshold !== null && i.threshold !== undefined ? String(toNum(i.threshold as unknown)) : null,
            minStack: toOptNum(i.minStack as unknown),
            anchorTime: toOptNum(i.anchorTime as unknown),
            showBands: i.showBands !== undefined ? toBool(i.showBands as unknown) : null,
            pivotLen: toOptNum(i.pivotLen as unknown),
            sdStrength: i.sdStrength !== null && i.sdStrength !== undefined ? String(toNum(i.sdStrength as unknown)) : null,
            sdAtrMult: i.sdAtrMult !== null && i.sdAtrMult !== undefined ? String(toNum(i.sdAtrMult as unknown)) : null,
            showMitigated: i.showMitigated !== undefined ? toBool(i.showMitigated as unknown) : null,
            showSweeps: i.showSweeps !== undefined ? toBool(i.showSweeps as unknown) : null,
            showSwingDots: i.showSwingDots !== undefined ? toBool(i.showSwingDots as unknown) : null,
            htfTimeframe: i.timeframe ? toStr(i.timeframe as unknown) : null,
            htfDisplayMode: i.displayMode ? toStr(i.displayMode as unknown) : null,
            htfShowWicks: i.showWicks !== undefined ? toBool(i.showWicks as unknown) : null,
          } as any);
        }
      }

      if (Array.isArray(alerts)) {
        await tx.delete(chartAlertsTable);
        const uniqueAlerts = uniqueBy(alerts, a => a.id);
        for (const a of uniqueAlerts) {

          await tx.insert(chartAlertsTable).values({
            id: a.id, symbol: a.symbol, timeframe: a.timeframe,
            trendlineId: a.trendlineId ? toStr(a.trendlineId as unknown) : null,
            condition: toStr(a.condition as unknown, 'cross_any'),
            active: toBool(a.active as unknown, true), triggered: toBool(a.triggered as unknown),
            triggeredAt: toOptNum(a.triggeredAt as unknown),
            message: a.message ? toStr(a.message as unknown) : null,
            createdAt: toNum(a.createdAt as unknown), 
            telegramEnabled: toBool(a.telegramEnabled as unknown, true),
            whatsappEnabled: toBool(a.whatsappEnabled as unknown, true),
          });
        }
      }

      if (Array.isArray(alertLogs)) {
        await tx.delete(chartAlertLogsTable);
        const uniqueLogs = uniqueBy(alertLogs, l => l.id);
        for (const l of uniqueLogs) {

          await tx.insert(chartAlertLogsTable).values({
            id: l.id, alertId: l.alertId ? toStr(l.alertId as unknown) : null, symbol: l.symbol,
            message: toStr(l.message as unknown), timestamp: toNum(l.timestamp as unknown),
            price: String(toNum(l.price as unknown)),
          });
        }
      }

      if (Array.isArray(fibonacciDrawings)) {
        await tx.delete(fibonacciDrawingsTable);
        const uniqueFib = uniqueBy(fibonacciDrawings, f => f.id);
        for (const f of uniqueFib) {

          await tx.insert(fibonacciDrawingsTable).values({
            id: f.id, symbol: f.symbol, timeframe: f.timeframe,
            startTime: toNum(f.startTime as unknown), startPrice: String(toNum(f.startPrice as unknown)),
            endTime: toNum(f.endTime as unknown), endPrice: String(toNum(f.endPrice as unknown)),
            createdAt: toNum(f.createdAt as unknown),
          });
        }
      }

      if (Array.isArray(indicatorCrossAlerts)) {
        await tx.delete(indicatorCrossAlertsTable);
        const uniqueICA = uniqueBy(indicatorCrossAlerts, a => a.id);
        for (const a of uniqueICA) {

          await tx.insert(indicatorCrossAlertsTable).values({
            id: a.id, symbol: a.symbol, timeframe: a.timeframe,
            indicatorId1: toStr(a.indicatorId1 as unknown), indicatorId2: toStr(a.indicatorId2 as unknown),
            condition: toStr(a.condition as unknown, 'cross_any'),
            active: toBool(a.active as unknown, true), triggered: toBool(a.triggered as unknown),
            triggeredAt: toOptNum(a.triggeredAt as unknown),
            message: a.message ? toStr(a.message as unknown) : null,
            createdAt: toNum(a.createdAt as unknown), 
            telegramEnabled: toBool(a.telegramEnabled as unknown, true),
            whatsappEnabled: toBool(a.whatsappEnabled as unknown, true),
          });
        }
      }

      if (Array.isArray(indicatorThresholdAlerts)) {
        await tx.delete(indicatorThresholdAlertsTable);
        const uniqueITA = uniqueBy(indicatorThresholdAlerts, a => a.id);
        for (const a of uniqueITA) {

          await tx.insert(indicatorThresholdAlertsTable).values({
            id: a.id, symbol: a.symbol, timeframe: a.timeframe,
            indicatorId: toStr(a.indicatorId as unknown),
            condition: toStr(a.condition as unknown, 'above'),
            threshold: String(toNum(a.threshold as unknown)),
            active: toBool(a.active as unknown, true), triggered: toBool(a.triggered as unknown),
            triggeredAt: toOptNum(a.triggeredAt as unknown),
            message: a.message ? toStr(a.message as unknown) : null,
            createdAt: toNum(a.createdAt as unknown), 
            telegramEnabled: toBool(a.telegramEnabled as unknown, true),
            whatsappEnabled: toBool(a.whatsappEnabled as unknown, true),
          });
        }
      }

      if (Array.isArray(stochRSICrossAlerts)) {
        await tx.delete(stochRSICrossAlertsTable);
        const uniqueSCA = uniqueBy(stochRSICrossAlerts, a => a.id);
        for (const a of uniqueSCA) {

          await tx.insert(stochRSICrossAlertsTable).values({
            id: a.id, symbol: a.symbol, timeframe: a.timeframe,
            indicatorId: toStr(a.indicatorId as unknown),
            condition: toStr(a.condition as unknown, 'cross_any'),
            active: toBool(a.active as unknown, true), triggered: toBool(a.triggered as unknown),
            triggeredAt: toOptNum(a.triggeredAt as unknown),
            message: a.message ? toStr(a.message as unknown) : null,
            createdAt: toNum(a.createdAt as unknown), 
            telegramEnabled: toBool(a.telegramEnabled as unknown, true),
            whatsappEnabled: toBool(a.whatsappEnabled as unknown, true),

          });
        }
      }

      if (Array.isArray(pctDiffDonCrossAlerts)) {
        await tx.delete(pctDiffDonCrossAlertsTable);
        const uniquePDA = uniqueBy(pctDiffDonCrossAlerts, a => a.id);
        for (const a of uniquePDA) {

          await tx.insert(pctDiffDonCrossAlertsTable).values({
            id: a.id, symbol: a.symbol, timeframe: a.timeframe,
            indicatorId: toStr(a.indicatorId as unknown),
            line1: toStr(a.line1 as unknown),
            line2: toStr(a.line2 as unknown),
            condition: toStr(a.condition as unknown, 'cross_any'),
            active: toBool(a.active as unknown, true), triggered: toBool(a.triggered as unknown),
            triggeredAt: toOptNum(a.triggeredAt as unknown),
            message: a.message ? toStr(a.message as unknown) : null,
            createdAt: toNum(a.createdAt as unknown), 
            telegramEnabled: toBool(a.telegramEnabled as unknown, true),
            whatsappEnabled: toBool(a.whatsappEnabled as unknown, true),
          });
        }
      }

      if (Array.isArray(smartMoneyAlerts)) {
        await tx.delete(smartMoneyAlertsTable);
        const uniqueSMA = uniqueBy(smartMoneyAlerts, a => a.id);
        for (const a of uniqueSMA) {

          await tx.insert(smartMoneyAlertsTable).values({
            id: a.id, symbol: a.symbol, timeframe: a.timeframe,
            condition: toStr(a.condition as unknown, 'bos_cross'),
            active: toBool(a.active as unknown, true), triggered: toBool(a.triggered as unknown),
            triggeredAt: toOptNum(a.triggeredAt as unknown),
            lastFiredCandleTime: toOptNum(a.lastFiredCandleTime as unknown),
            message: a.message ? toStr(a.message as unknown) : null,
            createdAt: toNum(a.createdAt as unknown), 
            telegramEnabled: toBool(a.telegramEnabled as unknown, true),
            whatsappEnabled: toBool(a.whatsappEnabled as unknown, true),
          });
        }
      }

      if (Array.isArray(compoundAlerts)) {
        await tx.delete(compoundAlertsTable);
        const uniqueComp = uniqueBy(compoundAlerts, a => a.id);
        for (const a of uniqueComp) {

          await tx.insert(compoundAlertsTable).values({
            id: a.id, symbol: a.symbol, timeframe: a.timeframe,
            conditions: JSON.stringify(a.conditions),
            active: toBool(a.active as unknown, true), triggered: toBool(a.triggered as unknown),
            triggeredAt: toOptNum(a.triggeredAt as unknown),
            message: a.message ? toStr(a.message as unknown) : null,
            createdAt: toNum(a.createdAt as unknown), 
            telegramEnabled: toBool(a.telegramEnabled as unknown, true),
            whatsappEnabled: toBool(a.whatsappEnabled as unknown, true),
          });
        }
      }

      
      if (Array.isArray(layouts)) {
        await tx.delete(chartLayoutsTable);
        const layoutValues = layouts.map(l => ({
            id: l.id, name: l.name,
            createdAt: toNum(l.createdAt as unknown),
            updatedAt: toNum(l.updatedAt as unknown),
            snapshot: JSON.stringify(l.snapshot),
        }));
        await tx.insert(chartLayoutsTable).values(layoutValues);
      }

      if (trackerWatchlist && Array.isArray(trackerWatchlist)) {
        await tx.delete(trackerWatchlistTable);
        if (trackerWatchlist.length > 0) {
          const watchlistValues = uniqueBy(trackerWatchlist.map(w => ({
            id: `${w.symbol}-${w.timeframe}`,
            symbol: String(w.symbol),
            timeframe: String(w.timeframe),
            strategy: JSON.stringify(w.strategy || {}),
          })), v => v.id);

          await tx.insert(trackerWatchlistTable).values(watchlistValues);
        }
      }


      if (trackerEntries && Array.isArray(trackerEntries)) {
        await tx.delete(trackerEntriesTable);
        if (trackerEntries.length > 0) {
          const entryValues = uniqueBy(trackerEntries.map(e => ({
            id: String(e.id),
            symbol: String(e.symbol),
            timeframe: String(e.timeframe),
            strategy: JSON.stringify(e.strategy || {}),
            direction: String(e.direction),
            entryPrice: Number(e.entryPrice || 0),
            entryTime: Number(e.entryTime || 0),
            active: Boolean(e.active),
            currentPrice: e.currentPrice !== undefined ? Number(e.currentPrice) : null,
            perf5m: e.perf5m !== undefined ? Number(e.perf5m) : null,
            perf15m: e.perf15m !== undefined ? Number(e.perf15m) : null,
            perf30m: e.perf30m !== undefined ? Number(e.perf30m) : null,
            perf1h: e.perf1h !== undefined ? Number(e.perf1h) : null,
            perf4h: e.perf4h !== undefined ? Number(e.perf4h) : null,
            perf12h: e.perf12h !== undefined ? Number(e.perf12h) : null,
            perf1D: e.perf1D !== undefined ? Number(e.perf1D) : null,
            perf3D: e.perf3D !== undefined ? Number(e.perf3D) : null,
            perf7D: e.perf7D !== undefined ? Number(e.perf7D) : null,
            perf1M: e.perf1M !== undefined ? Number(e.perf1M) : null,
          })), v => v.id);
          await tx.insert(trackerEntriesTable).values(entryValues);
        }
      }
    });

    console.log(`[Sync] PUT complete. Symbols: ${trackerWatchlist?.length || 0}, Entries: ${trackerEntries?.length || 0}`);
    res.json({ success: true });
  } catch (e: unknown) {
    console.error("[Sync] PUT error:", e);
    req.log.error({ error: errMsg(e) }, "Failed to put sync state");
    res.status(500).json({ error: errMsg(e) });
  }
});


export default router;
