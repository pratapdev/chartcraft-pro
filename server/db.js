const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'alerts.db'));

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    condition TEXT NOT NULL CHECK(condition IN ('above', 'below')),
    target_price REAL NOT NULL,
    timeframe TEXT DEFAULT '1m',
    active INTEGER DEFAULT 1,
    triggered INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    triggered_at TEXT,
    telegram_chat_id TEXT
  );

  CREATE TABLE IF NOT EXISTS indicator_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    indicator TEXT NOT NULL,
    period INTEGER DEFAULT 14,
    condition TEXT NOT NULL CHECK(condition IN ('above', 'below', 'cross_above', 'cross_below')),
    threshold REAL,
    timeframe TEXT DEFAULT '1h',
    active INTEGER DEFAULT 1,
    triggered INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    triggered_at TEXT,
    telegram_chat_id TEXT
  );

  CREATE TABLE IF NOT EXISTS alert_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER,
    alert_type TEXT DEFAULT 'price',
    symbol TEXT NOT NULL,
    message TEXT NOT NULL,
    price REAL,
    timestamp TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Chart state sync tables
  CREATE TABLE IF NOT EXISTS chart_state (
    id TEXT PRIMARY KEY DEFAULT 'default',
    symbol TEXT DEFAULT 'BTC/USD',
    timeframe TEXT DEFAULT '1h',
    market_type TEXT DEFAULT 'crypto',
    chart_font_size INTEGER DEFAULT 12,
    drawing_defaults TEXT DEFAULT '{}',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trendlines (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    start_price REAL NOT NULL,
    end_time INTEGER NOT NULL,
    end_price REAL NOT NULL,
    color TEXT DEFAULT '#2962FF',
    thickness INTEGER DEFAULT 1,
    line_style TEXT DEFAULT 'solid',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chart_alerts (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    trendline_id TEXT,
    condition TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    triggered INTEGER DEFAULT 0,
    triggered_at INTEGER,
    message TEXT,
    created_at INTEGER NOT NULL,
    telegram_enabled INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS chart_alert_logs (
    id TEXT PRIMARY KEY,
    alert_id TEXT,
    symbol TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    price REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chart_indicators (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    period INTEGER DEFAULT 20,
    color TEXT DEFAULT '#2962FF',
    visible INTEGER DEFAULT 1,
    line_width INTEGER DEFAULT 1,
    line_style TEXT DEFAULT 'solid',
    k_period INTEGER,
    d_period INTEGER,
    color2 TEXT,
    std_dev REAL,
    multiplier REAL
  );

  CREATE TABLE IF NOT EXISTS fibonacci_drawings (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    start_price REAL NOT NULL,
    end_time INTEGER NOT NULL,
    end_price REAL NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS indicator_cross_alerts (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    indicator_id1 TEXT NOT NULL,
    indicator_id2 TEXT NOT NULL,
    condition TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    triggered INTEGER DEFAULT 0,
    triggered_at INTEGER,
    message TEXT,
    created_at INTEGER NOT NULL,
    telegram_enabled INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS indicator_threshold_alerts (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    indicator_id TEXT NOT NULL,
    condition TEXT NOT NULL,
    threshold REAL NOT NULL,
    active INTEGER DEFAULT 1,
    triggered INTEGER DEFAULT 0,
    triggered_at INTEGER,
    message TEXT,
    created_at INTEGER NOT NULL,
    telegram_enabled INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS stoch_rsi_cross_alerts (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    indicator_id TEXT NOT NULL,
    condition TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    triggered INTEGER DEFAULT 0,
    triggered_at INTEGER,
    message TEXT,
    created_at INTEGER NOT NULL,
    telegram_enabled INTEGER DEFAULT 1
  );
`);

// Ensure default chart_state row exists
const ensureChartState = db.prepare(`INSERT OR IGNORE INTO chart_state (id) VALUES ('default')`);
ensureChartState.run();

// --- Price Alerts ---
const insertAlert = db.prepare(
  `INSERT INTO alerts (symbol, condition, target_price, timeframe, telegram_chat_id) VALUES (?, ?, ?, ?, ?)`
);

const getActiveAlerts = db.prepare(
  `SELECT * FROM alerts WHERE active = 1 AND triggered = 0`
);

const getAllAlerts = db.prepare(
  `SELECT * FROM alerts WHERE active = 1 AND triggered = 0 ORDER BY created_at DESC`
);

const triggerAlert = db.prepare(
  `UPDATE alerts SET triggered = 1, active = 0, triggered_at = datetime('now') WHERE id = ?`
);

const removeAlert = db.prepare(
  `DELETE FROM alerts WHERE id = ?`
);

// --- Indicator Alerts ---
const insertIndicatorAlert = db.prepare(
  `INSERT INTO indicator_alerts (symbol, indicator, period, condition, threshold, timeframe, telegram_chat_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const getActiveIndicatorAlerts = db.prepare(
  `SELECT * FROM indicator_alerts WHERE active = 1 AND triggered = 0`
);

const triggerIndicatorAlert = db.prepare(
  `UPDATE indicator_alerts SET triggered = 1, active = 0, triggered_at = datetime('now') WHERE id = ?`
);

const removeIndicatorAlert = db.prepare(
  `DELETE FROM indicator_alerts WHERE id = ?`
);

// --- Alert Logs ---
const insertLog = db.prepare(
  `INSERT INTO alert_logs (alert_id, alert_type, symbol, message, price) VALUES (?, ?, ?, ?, ?)`
);

const getRecentLogs = db.prepare(
  `SELECT * FROM alert_logs ORDER BY timestamp DESC LIMIT 50`
);

// --- Settings ---
const getSetting = db.prepare(`SELECT value FROM settings WHERE key = ?`);
const setSetting = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
);

module.exports = {
  db,
  insertAlert,
  getActiveAlerts,
  getAllAlerts,
  triggerAlert,
  removeAlert,
  insertIndicatorAlert,
  getActiveIndicatorAlerts,
  triggerIndicatorAlert,
  removeIndicatorAlert,
  insertLog,
  getRecentLogs,
  getSetting,
  setSetting,
};
