import { pgTable, text, integer, boolean, jsonb, numeric, bigint } from "drizzle-orm/pg-core";

export const chartStateTable = pgTable("chart_state", {
  id: text("id").primaryKey().default("default"),
  symbol: text("symbol").notNull().default("BTC/USD"),
  timeframe: text("timeframe").notNull().default("1h"),
  marketType: text("market_type").notNull().default("crypto"),
  chartFontSize: integer("chart_font_size").notNull().default(11),
  drawingDefaults: jsonb("drawing_defaults").notNull().default({}),
});

export const trendlinesTable = pgTable("trendlines", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  startTime: bigint("start_time", { mode: "number" }).notNull(),
  startPrice: numeric("start_price").notNull(),
  endTime: bigint("end_time", { mode: "number" }).notNull(),
  endPrice: numeric("end_price").notNull(),
  color: text("color").notNull().default("#2962FF"),
  thickness: integer("thickness").notNull().default(1),
  lineStyle: text("line_style").notNull().default("solid"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const chartAlertsTable = pgTable("chart_alerts", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  trendlineId: text("trendline_id"),
  condition: text("condition").notNull(),
  active: boolean("active").notNull().default(true),
  triggered: boolean("triggered").notNull().default(false),
  triggeredAt: bigint("triggered_at", { mode: "number" }),
  message: text("message"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  telegramEnabled: boolean("telegram_enabled").notNull().default(true),
});

export const chartAlertLogsTable = pgTable("chart_alert_logs", {
  id: text("id").primaryKey(),
  alertId: text("alert_id"),
  symbol: text("symbol").notNull(),
  message: text("message").notNull(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  price: numeric("price").notNull(),
});

export const chartIndicatorsTable = pgTable("chart_indicators", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  period: integer("period").notNull().default(20),
  color: text("color").notNull().default("#2962FF"),
  visible: boolean("visible").notNull().default(true),
  lineWidth: integer("line_width").notNull().default(1),
  lineStyle: text("line_style").notNull().default("solid"),
  kPeriod: integer("k_period"),
  dPeriod: integer("d_period"),
  color2: text("color2"),
  stdDev: numeric("std_dev"),
  multiplier: numeric("multiplier"),
});

export const fibonacciDrawingsTable = pgTable("fibonacci_drawings", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  startTime: bigint("start_time", { mode: "number" }).notNull(),
  startPrice: numeric("start_price").notNull(),
  endTime: bigint("end_time", { mode: "number" }).notNull(),
  endPrice: numeric("end_price").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const indicatorCrossAlertsTable = pgTable("indicator_cross_alerts", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  indicatorId1: text("indicator_id1").notNull(),
  indicatorId2: text("indicator_id2").notNull(),
  condition: text("condition").notNull(),
  active: boolean("active").notNull().default(true),
  triggered: boolean("triggered").notNull().default(false),
  triggeredAt: bigint("triggered_at", { mode: "number" }),
  message: text("message"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  telegramEnabled: boolean("telegram_enabled").notNull().default(true),
});

export const indicatorThresholdAlertsTable = pgTable("indicator_threshold_alerts", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  indicatorId: text("indicator_id").notNull(),
  condition: text("condition").notNull(),
  threshold: numeric("threshold").notNull(),
  active: boolean("active").notNull().default(true),
  triggered: boolean("triggered").notNull().default(false),
  triggeredAt: bigint("triggered_at", { mode: "number" }),
  message: text("message"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  telegramEnabled: boolean("telegram_enabled").notNull().default(true),
});

export const stochRSICrossAlertsTable = pgTable("stoch_rsi_cross_alerts", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  indicatorId: text("indicator_id").notNull(),
  condition: text("condition").notNull(),
  active: boolean("active").notNull().default(true),
  triggered: boolean("triggered").notNull().default(false),
  triggeredAt: bigint("triggered_at", { mode: "number" }),
  message: text("message"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  telegramEnabled: boolean("telegram_enabled").notNull().default(true),
});
