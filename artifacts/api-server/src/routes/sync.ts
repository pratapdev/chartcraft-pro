import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  chartStateTable, trendlinesTable, chartAlertsTable,
  chartAlertLogsTable, chartIndicatorsTable, fibonacciDrawingsTable,
  indicatorCrossAlertsTable, indicatorThresholdAlertsTable, stochRSICrossAlertsTable,
} from "@workspace/db";

const router: IRouter = Router();

const toNum = (value: any, fallback = 0) => {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

router.get("/sync/state", async (req, res) => {
  try {
    const state = await db.select().from(chartStateTable).limit(1);
    const trendlines = await db.select().from(trendlinesTable);
    const indicators = await db.select().from(chartIndicatorsTable);
    const alerts = await db.select().from(chartAlertsTable);
    const alertLogs = await db.select().from(chartAlertLogsTable).limit(100);
    const fibonacci = await db.select().from(fibonacciDrawingsTable);
    const indicatorCrossAlerts = await db.select().from(indicatorCrossAlertsTable);
    const indicatorThresholdAlerts = await db.select().from(indicatorThresholdAlertsTable);
    const stochRSICrossAlerts = await db.select().from(stochRSICrossAlertsTable);

    res.json({
      state: state[0] ? {
        symbol: state[0].symbol,
        timeframe: state[0].timeframe,
        marketType: state[0].marketType,
        chartFontSize: toNum(state[0].chartFontSize, 11),
        drawingDefaults: state[0].drawingDefaults,
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
        stdDev: i.stdDev === null ? null : toNum(i.stdDev), multiplier: i.multiplier === null ? null : toNum(i.multiplier),
      })),
      alerts: alerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        trendlineId: a.trendlineId, condition: a.condition,
        active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt ? toNum(a.triggeredAt) : null, message: a.message,
        createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
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
        triggeredAt: a.triggeredAt ? toNum(a.triggeredAt) : null, message: a.message,
        createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
      })),
      indicatorThresholdAlerts: indicatorThresholdAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        indicatorId: a.indicatorId, condition: a.condition,
        threshold: toNum(a.threshold), active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt ? toNum(a.triggeredAt) : null, message: a.message,
        createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
      })),
      stochRSICrossAlerts: stochRSICrossAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        indicatorId: a.indicatorId, condition: a.condition,
        active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt ? toNum(a.triggeredAt) : null, message: a.message,
        createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled,
      })),
      pctDiffDonCrossAlerts: [],
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get sync state");
    res.status(500).json({ error: err.message });
  }
});

router.put("/sync/state", async (req, res) => {
  try {
    const { state, trendlines, indicators, alerts, alertLogs, fibonacciDrawings,
      indicatorCrossAlerts, indicatorThresholdAlerts, stochRSICrossAlerts, pctDiffDonCrossAlerts } = req.body;

    if (state) {
      await db.delete(chartStateTable);
      await db.insert(chartStateTable).values({
        id: 'default',
        symbol: state.symbol,
        timeframe: state.timeframe,
        marketType: state.marketType,
        chartFontSize: toNum(state.chartFontSize, 11),
        drawingDefaults: state.drawingDefaults || {},
      });
    }

    if (trendlines) {
      await db.delete(trendlinesTable);
      for (const t of trendlines) {
        await db.insert(trendlinesTable).values({
          id: t.id, symbol: t.symbol, timeframe: t.timeframe,
          startTime: toNum(t.startTime), startPrice: String(toNum(t.startPrice)),
          endTime: toNum(t.endTime), endPrice: String(toNum(t.endPrice)),
          color: t.color || '#2962FF', thickness: toNum(t.thickness, 1),
          lineStyle: t.lineStyle || 'solid', createdAt: toNum(t.createdAt),
        });
      }
    }

    if (indicators) {
      await db.delete(chartIndicatorsTable);
      for (const i of indicators) {
        await db.insert(chartIndicatorsTable).values({
          id: i.id, type: i.type, period: toNum(i.period, 20),
          color: i.color || '#2962FF', visible: i.visible !== false,
          lineWidth: toNum(i.lineWidth, 1), lineStyle: i.lineStyle || 'solid',
          kPeriod: i.kPeriod || null, dPeriod: i.dPeriod || null,
          color2: i.color2 || null, stdDev: i.stdDev === null || i.stdDev === undefined ? null : String(toNum(i.stdDev)),
          multiplier: i.multiplier === null || i.multiplier === undefined ? null : String(toNum(i.multiplier)),
        });
      }
    }

    if (alerts) {
      await db.delete(chartAlertsTable);
      for (const a of alerts) {
        await db.insert(chartAlertsTable).values({
          id: a.id, symbol: a.symbol, timeframe: a.timeframe,
          trendlineId: a.trendlineId || null, condition: a.condition,
          active: a.active !== false, triggered: a.triggered || false,
          triggeredAt: a.triggeredAt ? toNum(a.triggeredAt) : null, message: a.message || null,
          createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled !== false,
        });
      }
    }

    if (alertLogs) {
      await db.delete(chartAlertLogsTable);
      for (const l of alertLogs) {
        await db.insert(chartAlertLogsTable).values({
          id: l.id, alertId: l.alertId || null, symbol: l.symbol,
          message: l.message, timestamp: toNum(l.timestamp), price: String(toNum(l.price)),
        });
      }
    }

    if (fibonacciDrawings) {
      await db.delete(fibonacciDrawingsTable);
      for (const f of fibonacciDrawings) {
        await db.insert(fibonacciDrawingsTable).values({
          id: f.id, symbol: f.symbol, timeframe: f.timeframe,
          startTime: toNum(f.startTime), startPrice: String(toNum(f.startPrice)),
          endTime: toNum(f.endTime), endPrice: String(toNum(f.endPrice)), createdAt: toNum(f.createdAt),
        });
      }
    }

    if (indicatorCrossAlerts) {
      await db.delete(indicatorCrossAlertsTable);
      for (const a of indicatorCrossAlerts) {
        await db.insert(indicatorCrossAlertsTable).values({
          id: a.id, symbol: a.symbol, timeframe: a.timeframe,
          indicatorId1: a.indicatorId1, indicatorId2: a.indicatorId2,
          condition: a.condition, active: a.active !== false, triggered: a.triggered || false,
          triggeredAt: a.triggeredAt ? toNum(a.triggeredAt) : null, message: a.message || null,
          createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled !== false,
        });
      }
    }

    if (indicatorThresholdAlerts) {
      await db.delete(indicatorThresholdAlertsTable);
      for (const a of indicatorThresholdAlerts) {
        await db.insert(indicatorThresholdAlertsTable).values({
          id: a.id, symbol: a.symbol, timeframe: a.timeframe,
          indicatorId: a.indicatorId, condition: a.condition,
          threshold: String(toNum(a.threshold)), active: a.active !== false, triggered: a.triggered || false,
          triggeredAt: a.triggeredAt ? toNum(a.triggeredAt) : null, message: a.message || null,
          createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled !== false,
        });
      }
    }

    if (stochRSICrossAlerts) {
      await db.delete(stochRSICrossAlertsTable);
      for (const a of stochRSICrossAlerts) {
        await db.insert(stochRSICrossAlertsTable).values({
          id: a.id, symbol: a.symbol, timeframe: a.timeframe,
          indicatorId: a.indicatorId, condition: a.condition,
          active: a.active !== false, triggered: a.triggered || false,
          triggeredAt: a.triggeredAt ? toNum(a.triggeredAt) : null, message: a.message || null,
          createdAt: toNum(a.createdAt), telegramEnabled: a.telegramEnabled !== false,
        });
      }
    }

    if (pctDiffDonCrossAlerts) {
    }

    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to put sync state");
    res.status(500).json({ error: err.message });
  }
});

export default router;
