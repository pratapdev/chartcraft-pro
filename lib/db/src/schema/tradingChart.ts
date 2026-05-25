import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";


export const chartStateTable = sqliteTable("chart_state", {
  id: text("id").primaryKey().default("default"),
  symbol: text("symbol").notNull().default("BTC/USD"),
  timeframe: text("timeframe").notNull().default("1h"),
  marketType: text("market_type").notNull().default("crypto"),
  chartFontSize: integer("chart_font_size").notNull().default(11),
  drawingDefaults: text("drawing_defaults").notNull().default("{}"), // Storing JSON as string
});

export const trendlinesTable = sqliteTable("trendlines", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  startTime: integer("start_time").notNull(),
  startPrice: text("start_price").notNull(),
  endTime: integer("end_time").notNull(),
  endPrice: text("end_price").notNull(),
  color: text("color").notNull().default("#2962FF"),
  thickness: integer("thickness").notNull().default(1),
  lineStyle: text("line_style").notNull().default("solid"),
  createdAt: integer("created_at").notNull(),
});

export const chartAlertsTable = sqliteTable("chart_alerts", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  trendlineId: text("trendline_id"),
  condition: text("condition").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  triggered: integer("triggered", { mode: "boolean" }).notNull().default(false),
  triggeredAt: integer("triggered_at"),
  message: text("message"),
  createdAt: integer("created_at").notNull(),
  telegramEnabled: integer("telegram_enabled", { mode: "boolean" }).notNull().default(true),
  whatsappEnabled: integer("whatsapp_enabled", { mode: "boolean" }).notNull().default(true),
});


export const chartAlertLogsTable = sqliteTable("chart_alert_logs", {
  id: text("id").primaryKey(),
  alertId: text("alert_id"),
  symbol: text("symbol").notNull(),
  message: text("message").notNull(),
  timestamp: integer("timestamp").notNull(),
  price: text("price").notNull(),
});

export const chartIndicatorsTable = sqliteTable("chart_indicators", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  period: integer("period").notNull().default(20),
  color: text("color").notNull().default("#2962FF"),
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
  lineWidth: integer("line_width").notNull().default(1),
  lineStyle: text("line_style").notNull().default("solid"),
  kPeriod: integer("k_period"),
  dPeriod: integer("d_period"),
  color2: text("color2"),
  stdDev: text("std_dev"),
  multiplier: text("multiplier"),
  paneMode: text("pane_mode"),
  lookbackWindow: integer("lookback_window"),
  emaSmoothing: integer("ema_smoothing"),
  donchianLength: integer("donchian_length"),
  donLineDiff: text("don_line_diff"),
  zigzagLength: integer("zigzag_length"),
  fibFactor: text("fib_factor"),
  indicatorThreshold: text("indicator_threshold"),
  minStack: integer("min_stack"),
  anchorTime: integer("anchor_time"),
  showBands: integer("show_bands", { mode: "boolean" }),
  pivotLen: integer("pivot_len"),
  sdStrength: text("sd_strength"),
  sdAtrMult: text("sd_atr_mult"),
  showMitigated: integer("show_mitigated", { mode: "boolean" }),
  showSweeps: integer("show_sweeps", { mode: "boolean" }),
  showSwingDots: integer("show_swing_dots", { mode: "boolean" }),
  htfTimeframe: text("htf_timeframe"),
  htfDisplayMode: text("htf_display_mode"),
  htfShowWicks: integer("htf_show_wicks", { mode: "boolean" }),
});

export const fibonacciDrawingsTable = sqliteTable("fibonacci_drawings", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  startTime: integer("start_time").notNull(),
  startPrice: text("start_price").notNull(),
  endTime: integer("end_time").notNull(),
  endPrice: text("end_price").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const indicatorCrossAlertsTable = sqliteTable("indicator_cross_alerts", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  indicatorId1: text("indicator_id1").notNull(),
  indicatorId2: text("indicator_id2").notNull(),
  condition: text("condition").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  triggered: integer("triggered", { mode: "boolean" }).notNull().default(false),
  triggeredAt: integer("triggered_at"),
  message: text("message"),
  createdAt: integer("created_at").notNull(),
  telegramEnabled: integer("telegram_enabled", { mode: "boolean" }).notNull().default(true),
  whatsappEnabled: integer("whatsapp_enabled", { mode: "boolean" }).notNull().default(true),
});


export const indicatorThresholdAlertsTable = sqliteTable("indicator_threshold_alerts", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  indicatorId: text("indicator_id").notNull(),
  condition: text("condition").notNull(),
  threshold: text("threshold").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  triggered: integer("triggered", { mode: "boolean" }).notNull().default(false),
  triggeredAt: integer("triggered_at"),
  message: text("message"),
  createdAt: integer("created_at").notNull(),
  telegramEnabled: integer("telegram_enabled", { mode: "boolean" }).notNull().default(true),
  whatsappEnabled: integer("whatsapp_enabled", { mode: "boolean" }).notNull().default(true),
});



export const stochRSICrossAlertsTable = sqliteTable("stoch_rsi_cross_alerts", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  indicatorId: text("indicator_id").notNull(),
  condition: text("condition").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  triggered: integer("triggered", { mode: "boolean" }).notNull().default(false),
  triggeredAt: integer("triggered_at"),
  message: text("message"),
  createdAt: integer("created_at").notNull(),
  telegramEnabled: integer("telegram_enabled", { mode: "boolean" }).notNull().default(true),
  whatsappEnabled: integer("whatsapp_enabled", { mode: "boolean" }).notNull().default(true),
});

export const smartMoneyAlertsTable = sqliteTable("smart_money_alerts", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  condition: text("condition").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  triggered: integer("triggered", { mode: "boolean" }).notNull().default(false),
  triggeredAt: integer("triggered_at"),
  lastFiredCandleTime: integer("last_fired_candle_time"),
  message: text("message"),
  createdAt: integer("created_at").notNull(),
  telegramEnabled: integer("telegram_enabled", { mode: "boolean" }).notNull().default(true),
  whatsappEnabled: integer("whatsapp_enabled", { mode: "boolean" }).notNull().default(true),
});

export const chartLayoutsTable = sqliteTable("chart_layouts", {

  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  snapshot: text("snapshot").notNull(), // JSON string
});

export const trackerWatchlistTable = sqliteTable("tracker_watchlist", {
  id: text("id").primaryKey(), // symbol + timeframe
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  strategy: text("strategy").notNull(), // JSON string
});



export const trackerEntriesTable = sqliteTable("tracker_entries", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  strategy: text("strategy").notNull(), // JSON string
  direction: text("direction").notNull(),
  entryPrice: real("entry_price").notNull(),
  entryTime: integer("entry_time").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  currentPrice: real("current_price"),
  perf5m: real("perf5m"),
  perf15m: real("perf15m"),
  perf30m: real("perf30m"),
  perf1h: real("perf1h"),
  perf4h: real("perf4h"),
  perf12h: real("perf12h"),
  perf1D: real("perf1D"),
  perf3D: real("perf3D"),
  perf7D: real("perf7D"),
  perf1M: real("perf1M"),
});

export const compoundAlertsTable = sqliteTable("compound_alerts", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  conditions: text("conditions").notNull(), // JSON string
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  triggered: integer("triggered", { mode: "boolean" }).notNull().default(false),
  triggeredAt: integer("triggered_at"),
  message: text("message"),
  createdAt: integer("created_at").notNull(),
  telegramEnabled: integer("telegram_enabled", { mode: "boolean" }).notNull().default(true),
  whatsappEnabled: integer("whatsapp_enabled", { mode: "boolean" }).notNull().default(true),
});

export const pctDiffDonCrossAlertsTable = sqliteTable("pct_diff_don_cross_alerts", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  indicatorId: text("indicator_id").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2").notNull(),
  condition: text("condition").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  triggered: integer("triggered", { mode: "boolean" }).notNull().default(false),
  triggeredAt: integer("triggered_at"),
  message: text("message"),
  createdAt: integer("created_at").notNull(),
  telegramEnabled: integer("telegram_enabled", { mode: "boolean" }).notNull().default(true),
  whatsappEnabled: integer("whatsapp_enabled", { mode: "boolean" }).notNull().default(true),
});
