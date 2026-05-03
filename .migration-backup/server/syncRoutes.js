const {
  db,
  getSetting,
  setSetting,
} = require('./db');

// ─── Prepared statements ─────────────────────────────────────

// Chart state
const getChartState = db.prepare(`SELECT * FROM chart_state WHERE id = 'default'`);
const updateChartState = db.prepare(`
  UPDATE chart_state SET symbol = ?, timeframe = ?, market_type = ?, chart_font_size = ?, drawing_defaults = ?, updated_at = datetime('now')
  WHERE id = 'default'
`);

// Trendlines
const getAllTrendlines = db.prepare(`SELECT * FROM trendlines ORDER BY created_at`);
const upsertTrendline = db.prepare(`
  INSERT INTO trendlines (id, symbol, timeframe, start_time, start_price, end_time, end_price, color, thickness, line_style, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET symbol=excluded.symbol, timeframe=excluded.timeframe,
    start_time=excluded.start_time, start_price=excluded.start_price,
    end_time=excluded.end_time, end_price=excluded.end_price,
    color=excluded.color, thickness=excluded.thickness, line_style=excluded.line_style
`);
const deleteAllTrendlines = db.prepare(`DELETE FROM trendlines`);

// Indicators
const getAllIndicators = db.prepare(`SELECT * FROM chart_indicators`);
const upsertIndicator = db.prepare(`
  INSERT INTO chart_indicators (id, type, period, color, visible, line_width, line_style, k_period, d_period, color2, std_dev, multiplier)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET type=excluded.type, period=excluded.period, color=excluded.color,
    visible=excluded.visible, line_width=excluded.line_width, line_style=excluded.line_style,
    k_period=excluded.k_period, d_period=excluded.d_period, color2=excluded.color2,
    std_dev=excluded.std_dev, multiplier=excluded.multiplier
`);
const deleteAllIndicators = db.prepare(`DELETE FROM chart_indicators`);

// Chart alerts
const getAllChartAlerts = db.prepare(`SELECT * FROM chart_alerts ORDER BY created_at`);
const deleteAllChartAlerts = db.prepare(`DELETE FROM chart_alerts`);

// Chart alert logs
const getAllChartAlertLogs = db.prepare(`SELECT * FROM chart_alert_logs ORDER BY timestamp DESC LIMIT 100`);
const deleteAllChartAlertLogs = db.prepare(`DELETE FROM chart_alert_logs`);

// Fibonacci
const getAllFibonacci = db.prepare(`SELECT * FROM fibonacci_drawings ORDER BY created_at`);
const deleteAllFibonacci = db.prepare(`DELETE FROM fibonacci_drawings`);

// Indicator cross alerts
const getAllIndicatorCrossAlerts = db.prepare(`SELECT * FROM indicator_cross_alerts ORDER BY created_at`);
const deleteAllIndicatorCrossAlerts = db.prepare(`DELETE FROM indicator_cross_alerts`);

// Indicator threshold alerts
const getAllIndicatorThresholdAlerts = db.prepare(`SELECT * FROM indicator_threshold_alerts ORDER BY created_at`);
const deleteAllIndicatorThresholdAlerts = db.prepare(`DELETE FROM indicator_threshold_alerts`);

// StochRSI cross alerts
const getAllStochRSICrossAlerts = db.prepare(`SELECT * FROM stoch_rsi_cross_alerts ORDER BY created_at`);
const deleteAllStochRSICrossAlerts = db.prepare(`DELETE FROM stoch_rsi_cross_alerts`);

// ─── Bulk sync helpers (transactional) ───────────────────────

function replaceRows(deleteStmt, insertStmt, rows) {
  const txn = db.transaction((items) => {
    deleteStmt.run();
    for (const item of items) {
      insertStmt.run(...item);
    }
  });
  txn(rows);
}

// ─── API handlers ────────────────────────────────────────────

function setupSyncRoutes(app) {

  // GET full chart state
  app.get('/api/sync/state', (req, res) => {
    try {
      const state = getChartState.get();
      const trendlines = getAllTrendlines.all();
      const indicators = getAllIndicators.all();
      const alerts = getAllChartAlerts.all();
      const alertLogs = getAllChartAlertLogs.all();
      const fibonacci = getAllFibonacci.all();
      const indicatorCrossAlerts = getAllIndicatorCrossAlerts.all();
      const indicatorThresholdAlerts = getAllIndicatorThresholdAlerts.all();
      const stochRSICrossAlerts = getAllStochRSICrossAlerts.all();

      res.json({
        state: state ? {
          symbol: state.symbol,
          timeframe: state.timeframe,
          marketType: state.market_type,
          chartFontSize: state.chart_font_size,
          drawingDefaults: JSON.parse(state.drawing_defaults || '{}'),
        } : null,
        trendlines: trendlines.map(t => ({
          id: t.id, symbol: t.symbol, timeframe: t.timeframe,
          startTime: t.start_time, startPrice: t.start_price,
          endTime: t.end_time, endPrice: t.end_price,
          color: t.color, thickness: t.thickness, lineStyle: t.line_style,
          createdAt: t.created_at,
        })),
        indicators: indicators.map(i => ({
          id: i.id, type: i.type, period: i.period, color: i.color,
          visible: !!i.visible, lineWidth: i.line_width, lineStyle: i.line_style,
          kPeriod: i.k_period, dPeriod: i.d_period, color2: i.color2,
          stdDev: i.std_dev, multiplier: i.multiplier,
        })),
        alerts: alerts.map(a => ({
          id: a.id, symbol: a.symbol, timeframe: a.timeframe,
          trendlineId: a.trendline_id, condition: a.condition,
          active: !!a.active, triggered: !!a.triggered,
          triggeredAt: a.triggered_at, message: a.message,
          createdAt: a.created_at, telegramEnabled: !!a.telegram_enabled,
        })),
        alertLogs: alertLogs.map(l => ({
          id: l.id, alertId: l.alert_id, symbol: l.symbol,
          message: l.message, timestamp: l.timestamp, price: l.price,
        })),
        fibonacciDrawings: fibonacci.map(f => ({
          id: f.id, symbol: f.symbol, timeframe: f.timeframe,
          startTime: f.start_time, startPrice: f.start_price,
          endTime: f.end_time, endPrice: f.end_price, createdAt: f.created_at,
        })),
        indicatorCrossAlerts: indicatorCrossAlerts.map(a => ({
          id: a.id, symbol: a.symbol, timeframe: a.timeframe,
          indicatorId1: a.indicator_id1, indicatorId2: a.indicator_id2,
          condition: a.condition, active: !!a.active, triggered: !!a.triggered,
          triggeredAt: a.triggered_at, message: a.message,
          createdAt: a.created_at, telegramEnabled: !!a.telegram_enabled,
        })),
        indicatorThresholdAlerts: indicatorThresholdAlerts.map(a => ({
          id: a.id, symbol: a.symbol, timeframe: a.timeframe,
          indicatorId: a.indicator_id, condition: a.condition,
          threshold: a.threshold, active: !!a.active, triggered: !!a.triggered,
          triggeredAt: a.triggered_at, message: a.message,
          createdAt: a.created_at, telegramEnabled: !!a.telegram_enabled,
        })),
        stochRSICrossAlerts: stochRSICrossAlerts.map(a => ({
          id: a.id, symbol: a.symbol, timeframe: a.timeframe,
          indicatorId: a.indicator_id, condition: a.condition,
          active: !!a.active, triggered: !!a.triggered,
          triggeredAt: a.triggered_at, message: a.message,
          createdAt: a.created_at, telegramEnabled: !!a.telegram_enabled,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT full chart state (bulk sync from frontend)
  app.put('/api/sync/state', (req, res) => {
    try {
      const { state, trendlines, indicators, alerts, alertLogs, fibonacciDrawings,
        indicatorCrossAlerts, indicatorThresholdAlerts, stochRSICrossAlerts } = req.body;

      const txn = db.transaction(() => {
        // Chart state
        if (state) {
          updateChartState.run(
            state.symbol, state.timeframe, state.marketType,
            state.chartFontSize, JSON.stringify(state.drawingDefaults || {})
          );
        }

        // Trendlines
        if (trendlines) {
          deleteAllTrendlines.run();
          for (const t of trendlines) {
            upsertTrendline.run(t.id, t.symbol, t.timeframe, t.startTime, t.startPrice,
              t.endTime, t.endPrice, t.color, t.thickness, t.lineStyle || 'solid', t.createdAt);
          }
        }

        // Indicators
        if (indicators) {
          deleteAllIndicators.run();
          for (const i of indicators) {
            upsertIndicator.run(i.id, i.type, i.period, i.color, i.visible ? 1 : 0,
              i.lineWidth || 1, i.lineStyle || 'solid', i.kPeriod || null,
              i.dPeriod || null, i.color2 || null, i.stdDev || null, i.multiplier || null);
          }
        }

        // Chart alerts
        if (alerts) {
          deleteAllChartAlerts.run();
          const stmt = db.prepare(`INSERT INTO chart_alerts (id, symbol, timeframe, trendline_id, condition, active, triggered, triggered_at, message, created_at, telegram_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const a of alerts) {
            stmt.run(a.id, a.symbol, a.timeframe, a.trendlineId, a.condition,
              a.active ? 1 : 0, a.triggered ? 1 : 0, a.triggeredAt || null,
              a.message || null, a.createdAt, a.telegramEnabled ? 1 : 0);
          }
        }

        // Alert logs
        if (alertLogs) {
          deleteAllChartAlertLogs.run();
          const stmt = db.prepare(`INSERT INTO chart_alert_logs (id, alert_id, symbol, message, timestamp, price) VALUES (?, ?, ?, ?, ?, ?)`);
          for (const l of alertLogs) {
            stmt.run(l.id, l.alertId, l.symbol, l.message, l.timestamp, l.price);
          }
        }

        // Fibonacci
        if (fibonacciDrawings) {
          deleteAllFibonacci.run();
          const stmt = db.prepare(`INSERT INTO fibonacci_drawings (id, symbol, timeframe, start_time, start_price, end_time, end_price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const f of fibonacciDrawings) {
            stmt.run(f.id, f.symbol, f.timeframe, f.startTime, f.startPrice, f.endTime, f.endPrice, f.createdAt);
          }
        }

        // Indicator cross alerts
        if (indicatorCrossAlerts) {
          deleteAllIndicatorCrossAlerts.run();
          const stmt = db.prepare(`INSERT INTO indicator_cross_alerts (id, symbol, timeframe, indicator_id1, indicator_id2, condition, active, triggered, triggered_at, message, created_at, telegram_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const a of indicatorCrossAlerts) {
            stmt.run(a.id, a.symbol, a.timeframe, a.indicatorId1, a.indicatorId2, a.condition,
              a.active ? 1 : 0, a.triggered ? 1 : 0, a.triggeredAt || null,
              a.message || null, a.createdAt, a.telegramEnabled ? 1 : 0);
          }
        }

        // Indicator threshold alerts
        if (indicatorThresholdAlerts) {
          deleteAllIndicatorThresholdAlerts.run();
          const stmt = db.prepare(`INSERT INTO indicator_threshold_alerts (id, symbol, timeframe, indicator_id, condition, threshold, active, triggered, triggered_at, message, created_at, telegram_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const a of indicatorThresholdAlerts) {
            stmt.run(a.id, a.symbol, a.timeframe, a.indicatorId, a.condition, a.threshold,
              a.active ? 1 : 0, a.triggered ? 1 : 0, a.triggeredAt || null,
              a.message || null, a.createdAt, a.telegramEnabled ? 1 : 0);
          }
        }

        // StochRSI cross alerts
        if (stochRSICrossAlerts) {
          deleteAllStochRSICrossAlerts.run();
          const stmt = db.prepare(`INSERT INTO stoch_rsi_cross_alerts (id, symbol, timeframe, indicator_id, condition, active, triggered, triggered_at, message, created_at, telegram_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const a of stochRSICrossAlerts) {
            stmt.run(a.id, a.symbol, a.timeframe, a.indicatorId, a.condition,
              a.active ? 1 : 0, a.triggered ? 1 : 0, a.triggeredAt || null,
              a.message || null, a.createdAt, a.telegramEnabled ? 1 : 0);
          }
        }
      });

      txn();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { setupSyncRoutes };
