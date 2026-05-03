import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  chartStateTable, trendlinesTable, chartAlertsTable,
  chartAlertLogsTable, chartIndicatorsTable, fibonacciDrawingsTable,
  indicatorCrossAlertsTable, indicatorThresholdAlertsTable, stochRSICrossAlertsTable,
} from "@workspace/db";

const router: IRouter = Router();

// ---- Typed helpers ----

const toNum = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
};

const toStr = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const toBool = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const toOptNum = (value: unknown): number | null =>
  value === null || value === undefined ? null : toNum(value);

const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

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

// ---- GET /api/sync/state ----

router.get("/sync/state", async (req: Request, res: Response) => {
  try {
    const [stateRows, trendlines, indicators, alerts, alertLogs, fibonacci,
      indicatorCrossAlerts, indicatorThresholdAlerts, stochRSICrossAlerts] = await Promise.all([
      db.select().from(chartStateTable).limit(1),
      db.select().from(trendlinesTable),
      db.select().from(chartIndicatorsTable),
      db.select().from(chartAlertsTable),
      db.select().from(chartAlertLogsTable).limit(100),
      db.select().from(fibonacciDrawingsTable),
      db.select().from(indicatorCrossAlertsTable),
      db.select().from(indicatorThresholdAlertsTable),
      db.select().from(stochRSICrossAlertsTable),
    ]);

    const s = stateRows[0];
    res.json({
      state: s ? {
        symbol: s.symbol,
        timeframe: s.timeframe,
        marketType: s.marketType,
        chartFontSize: toNum(s.chartFontSize, 11),
        drawingDefaults: s.drawingDefaults,
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
      })),
      indicatorThresholdAlerts: indicatorThresholdAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        indicatorId: a.indicatorId, condition: a.condition,
        threshold: toNum(a.threshold), active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt !== null ? toNum(a.triggeredAt) : null,
        message: a.message, createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
      })),
      stochRSICrossAlerts: stochRSICrossAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        indicatorId: a.indicatorId, condition: a.condition,
        active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt !== null ? toNum(a.triggeredAt) : null,
        message: a.message, createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
      })),
      // pctDiffDonCrossAlerts are localStorage-only (no DB table) — always return []
      pctDiffDonCrossAlerts: [],
    });
  } catch (e: unknown) {
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
}

// ---- PUT /api/sync/state ----

router.put("/sync/state", async (req: Request<object, object, SyncBody>, res: Response) => {
  const { state, trendlines, indicators, alerts, alertLogs, fibonacciDrawings,
    indicatorCrossAlerts, indicatorThresholdAlerts, stochRSICrossAlerts } = req.body;

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
          drawingDefaults: state.drawingDefaults ?? {},
        });
      }

      if (Array.isArray(trendlines)) {
        await tx.delete(trendlinesTable);
        for (const t of trendlines) {
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
        for (const i of indicators) {
          await tx.insert(chartIndicatorsTable).values({
            id: i.id, type: i.type, period: toNum(i.period as unknown, 20),
            color: toStr(i.color as unknown, '#2962FF'), visible: toBool(i.visible as unknown, true),
            lineWidth: toNum(i.lineWidth as unknown, 1), lineStyle: toStr(i.lineStyle as unknown, 'solid'),
            kPeriod: toOptNum(i.kPeriod as unknown), dPeriod: toOptNum(i.dPeriod as unknown),
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
          });
        }
      }

      if (Array.isArray(alerts)) {
        await tx.delete(chartAlertsTable);
        for (const a of alerts) {
          await tx.insert(chartAlertsTable).values({
            id: a.id, symbol: a.symbol, timeframe: a.timeframe,
            trendlineId: a.trendlineId ? toStr(a.trendlineId as unknown) : null,
            condition: toStr(a.condition as unknown, 'cross_any'),
            active: toBool(a.active as unknown, true), triggered: toBool(a.triggered as unknown),
            triggeredAt: toOptNum(a.triggeredAt as unknown),
            message: a.message ? toStr(a.message as unknown) : null,
            createdAt: toNum(a.createdAt as unknown), telegramEnabled: toBool(a.telegramEnabled as unknown, true),
          });
        }
      }

      if (Array.isArray(alertLogs)) {
        await tx.delete(chartAlertLogsTable);
        for (const l of alertLogs) {
          await tx.insert(chartAlertLogsTable).values({
            id: l.id, alertId: l.alertId ? toStr(l.alertId as unknown) : null, symbol: l.symbol,
            message: toStr(l.message as unknown), timestamp: toNum(l.timestamp as unknown),
            price: String(toNum(l.price as unknown)),
          });
        }
      }

      if (Array.isArray(fibonacciDrawings)) {
        await tx.delete(fibonacciDrawingsTable);
        for (const f of fibonacciDrawings) {
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
        for (const a of indicatorCrossAlerts) {
          await tx.insert(indicatorCrossAlertsTable).values({
            id: a.id, symbol: a.symbol, timeframe: a.timeframe,
            indicatorId1: toStr(a.indicatorId1 as unknown), indicatorId2: toStr(a.indicatorId2 as unknown),
            condition: toStr(a.condition as unknown, 'cross_any'),
            active: toBool(a.active as unknown, true), triggered: toBool(a.triggered as unknown),
            triggeredAt: toOptNum(a.triggeredAt as unknown),
            message: a.message ? toStr(a.message as unknown) : null,
            createdAt: toNum(a.createdAt as unknown), telegramEnabled: toBool(a.telegramEnabled as unknown, true),
          });
        }
      }

      if (Array.isArray(indicatorThresholdAlerts)) {
        await tx.delete(indicatorThresholdAlertsTable);
        for (const a of indicatorThresholdAlerts) {
          await tx.insert(indicatorThresholdAlertsTable).values({
            id: a.id, symbol: a.symbol, timeframe: a.timeframe,
            indicatorId: toStr(a.indicatorId as unknown),
            condition: toStr(a.condition as unknown, 'above'),
            threshold: String(toNum(a.threshold as unknown)),
            active: toBool(a.active as unknown, true), triggered: toBool(a.triggered as unknown),
            triggeredAt: toOptNum(a.triggeredAt as unknown),
            message: a.message ? toStr(a.message as unknown) : null,
            createdAt: toNum(a.createdAt as unknown), telegramEnabled: toBool(a.telegramEnabled as unknown, true),
          });
        }
      }

      if (Array.isArray(stochRSICrossAlerts)) {
        await tx.delete(stochRSICrossAlertsTable);
        for (const a of stochRSICrossAlerts) {
          await tx.insert(stochRSICrossAlertsTable).values({
            id: a.id, symbol: a.symbol, timeframe: a.timeframe,
            indicatorId: toStr(a.indicatorId as unknown),
            condition: toStr(a.condition as unknown, 'cross_any'),
            active: toBool(a.active as unknown, true), triggered: toBool(a.triggered as unknown),
            triggeredAt: toOptNum(a.triggeredAt as unknown),
            message: a.message ? toStr(a.message as unknown) : null,
            createdAt: toNum(a.createdAt as unknown), telegramEnabled: toBool(a.telegramEnabled as unknown, true),
          });
        }
      }

      // pctDiffDonCrossAlerts: no DB table — these are localStorage-only, intentionally skipped.
    });

    res.json({ success: true });
  } catch (e: unknown) {
    req.log.error({ error: errMsg(e) }, "Failed to put sync state");
    res.status(500).json({ error: errMsg(e) });
  }
});

export default router;
