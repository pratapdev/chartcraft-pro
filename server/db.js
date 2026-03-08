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
`);

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
