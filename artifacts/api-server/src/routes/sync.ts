import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { 
  chartStateTable, trendlinesTable, chartAlertsTable, 
  chartAlertLogsTable, chartIndicatorsTable, fibonacciDrawingsTable,
  indicatorCrossAlertsTable, indicatorThresholdAlertsTable, stochRSICrossAlertsTable
} from "@workspace/db";

const router: IRouter = Router();

// GET full chart state
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
        chartFontSize: state[0].chartFontSize,
        drawingDefaults: state[0].drawingDefaults,
      } : null,
      trendlines: trendlines.map(t => ({
        id: t.id, symbol: t.symbol, timeframe: t.timeframe,
        startTime: t.startTime, startPrice: t.startPrice,
        endTime: t.endTime, endPrice: t.endPrice,
        color: t.color, thickness: t.thickness, lineStyle: t.lineStyle,
        createdAt: t.createdAt,
      })),
      indicators: indicators.map(i => ({
        id: i.id, type: i.type, period: i.period, color: i.color,
        visible: i.visible, lineWidth: i.lineWidth, lineStyle: i.lineStyle,
        kPeriod: i.kPeriod, dPeriod: i.dPeriod, color2: i.color2,
        stdDev: i.stdDev, multiplier: i.multiplier,
      })),
      alerts: alerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        trendlineId: a.trendlineId, condition: a.condition,
        active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt, message: a.message,
        createdAt: a.createdAt, telegramEnabled: a.telegramEnabled,
      })),
      alertLogs: alertLogs.map(l => ({
        id: l.id, alertId: l.alertId, symbol: l.symbol,
        message: l.message, timestamp: l.timestamp, price: l.price,
      })),
      fibonacciDrawings: fibonacci.map(f => ({
        id: f.id, symbol: f.symbol, timeframe: f.timeframe,
        startTime: f.startTime, startPrice: f.startPrice,
        endTime: f.endTime, endPrice: f.endPrice, createdAt: f.createdAt,
      })),
      indicatorCrossAlerts: indicatorCrossAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        indicatorId1: a.indicatorId1, indicatorId2: a.indicatorId2,
        condition: a.condition, active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt, message: a.message,
        createdAt: a.createdAt, telegramEnabled: a.telegramEnabled,
      })),
      indicatorThresholdAlerts: indicatorThresholdAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        indicatorId: a.indicatorId, condition: a.condition,
        threshold: a.threshold, active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt, message: a.message,
        createdAt: a.createdAt, telegramEnabled: a.telegramEnabled,
      })),
      stochRSICrossAlerts: stochRSICrossAlerts.map(a => ({
        id: a.id, symbol: a.symbol, timeframe: a.timeframe,
        indicatorId: a.indicatorId, condition: a.condition,
        active: a.active, triggered: a.triggered,
        triggeredAt: a.triggeredAt, message: a.message,
        createdAt: a.createdAt, telegramEnabled: a.telegramEnabled,
      })),
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get sync state");
    res.status(500).json({ error: err.message });
  }
});

// PUT full chart state (bulk sync from frontend)
router.put("/sync/state", async (req, res) => {
  try {
    const { state, trendlines, indicators, alerts, alertLogs, fibonacciDrawings,
      indicatorCrossAlerts, indicatorThresholdAlerts, stochRSICrossAlerts } = req.body;

    // Chart state
    if (state) {
      await db.delete(chartStateTable);
      await db.insert(chartStateTable).values({
        id: 'default',
        symbol: state.symbol,
        timeframe: state.timeframe,
        marketType: state.marketType,
        chartFontSize: state.chartFontSize,
        drawingDefaults: state.drawingDefaults || {},
      });
    }

    // Trendlines
    if (trendlines) {
      await db.delete(trendlinesTable);
      for (const t of trendlines) {
        await db.insert(trendlinesTable).values({
          id: t.id, symbol: t.symbol, timeframe: t.timeframe,
          startTime: t.startTime, startPrice: String(t.startPrice),
          endTime: t.endTime, endPrice: String(t.endPrice),
          color: t.color || '#2962FF', thickness: t.thickness || 1,
          lineStyle: t.lineStyle || 'solid', createdAt: t.createdAt,
        });
      }
    }

    // Indicators
    if (indicators) {
      await db.delete(chartIndicatorsTable);
      for (const i of indicators) {
        await db.insert(chartIndicatorsTable).values({
          id: i.id, type: i.type, period: i.period || 20,
          color: i.color || '#2962FF', visible: i.visible !== false,
          lineWidth: i.lineWidth || 1, lineStyle: i.lineStyle || 'solid',
          kPeriod: i.kPeriod || null, dPeriod: i.dPeriod || null,
          color2: i.color2 || null, stdDev: i.stdDev ? String(i.stdDev) : null,
          multiplier: i.multiplier ? String(i.multiplier) : null,
        });
      }
    }

    // Chart alerts
    if (alerts) {
      await db.delete(chartAlertsTable);
      for (const a of alerts) {
        await db.insert(chartAlertsTable).values({
          id: a.id, symbol: a.symbol, timeframe: a.timeframe,
          trendlineId: a.trendlineId || null, condition: a.condition,
          active: a.active !== false, triggered: a.triggered || false,
          triggeredAt: a.triggeredAt || null, message: a.message || null,
          createdAt: a.createdAt, telegramEnabled: a.telegramEnabled !== false,
        });
      }
    }

    // Alert logs
    if (alertLogs) {
      await db.delete(chartAlertLogsTable);
      for (const l of alertLogs) {
        await db.insert(chartAlertLogsTable).values({
          id: l.id, alertId: l.alertId || null, symbol: l.symbol,
          message: l.message, timestamp: l.timestamp, price: String(l.price || 0),
        });
      }
    }

    // Fibonacci
    if (fibonacciDrawings) {
      await db.delete(fibonacciDrawingsTable);
      for (const f of fibonacciDrawings) {
        await db.insert(fibonacciDrawingsTable).values({
          id: f.id, symbol: f.symbol, timeframe: f.timeframe,
          startTime: f.startTime, startPrice: String(f.startPrice),
          endTime: f.endTime, endPrice: String(f.endPrice), createdAt: f.createdAt,
        });
      }
    }

    // Indicator cross alerts
    if (indicatorCrossAlerts) {
      await db.delete(indicatorCrossAlertsTable);
      for (const a of indicatorCrossAlerts) {
        await db.insert(indicatorCrossAlertsTable).values({
          id: a.id, symbol: a.symbol, timeframe: a.timeframe,
          indicatorId1: a.indicatorId1, indicatorId2: a.indicatorId2,
          condition: a.condition, active: a.active !== false, triggered: a.triggered || false,
          triggeredAt: a.triggeredAt || null, message: a.message || null,
          createdAt: a.createdAt, telegramEnabled: a.telegramEnabled !== false,
        });
      }
    }

    // Indicator threshold alerts
    if (indicatorThresholdAlerts) {
      await db.delete(indicatorThresholdAlertsTable);
      for (const a of indicatorThresholdAlerts) {
        await db.insert(indicatorThresholdAlertsTable).values({
          id: a.id, symbol: a.symbol, timeframe: a.timeframe,
          indicatorId: a.indicatorId, condition: a.condition,
          threshold: String(a.threshold), active: a.active !== false, triggered: a.triggered || false,
          triggeredAt: a.triggeredAt || null, message: a.message || null,
          createdAt: a.createdAt, telegramEnabled: a.telegramEnabled !== false,
        });
      }
    }

    // StochRSI cross alerts
    if (stochRSICrossAlerts) {
      await db.delete(stochRSICrossAlertsTable);
      for (const a of stochRSICrossAlerts) {
        await db.insert(stochRSICrossAlertsTable).values({
          id: a.id, symbol: a.symbol, timeframe: a.timeframe,
          indicatorId: a.indicatorId, condition: a.condition,
          active: a.active !== false, triggered: a.triggered || false,
          triggeredAt: a.triggeredAt || null, message: a.message || null,
          createdAt: a.createdAt, telegramEnabled: a.telegramEnabled !== false,
        });
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to put sync state");
    res.status(500).json({ error: err.message });
  }
});

export default router;
