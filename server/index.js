const express = require('express');
const cors = require('cors');
const { startBot, sendMessage } = require('./telegramBot');
const { startMonitoring, setAlertCallback, getLatestPrices } = require('./priceMonitor');
const {
  getAllAlerts,
  getActiveIndicatorAlerts,
  getRecentLogs,
  insertAlert,
  insertIndicatorAlert,
  removeAlert,
  removeIndicatorAlert,
  getSetting,
  setSetting,
} = require('./db');

// ─── Configuration ───────────────────────────────────────────
// Set your Telegram bot token here or via environment variable
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const PORT = process.env.PORT || 3001;

// ─── Start Telegram Bot ──────────────────────────────────────
const bot = startBot(BOT_TOKEN);

// ─── Start Price Monitoring ──────────────────────────────────
setAlertCallback((message, chatId) => {
  // Send triggered alert to Telegram
  if (chatId) {
    sendMessage(chatId, message);
  }
});

startMonitoring();

// ─── REST API (for frontend sync) ────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Get all active price alerts
app.get('/api/alerts', (req, res) => {
  try {
    const alerts = getAllAlerts.all();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create price alert
app.post('/api/alerts', (req, res) => {
  try {
    const { symbol, condition, target_price, timeframe } = req.body;
    if (!symbol || !condition || !target_price) {
      return res.status(400).json({ error: 'Missing required fields: symbol, condition, target_price' });
    }
    const result = insertAlert.run(symbol, condition, target_price, timeframe || '1m', null);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete price alert
app.delete('/api/alerts/:id', (req, res) => {
  try {
    removeAlert.run(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all active indicator alerts
app.get('/api/indicator-alerts', (req, res) => {
  try {
    const alerts = getActiveIndicatorAlerts.all();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create indicator alert
app.post('/api/indicator-alerts', (req, res) => {
  try {
    const { symbol, indicator, period, condition, threshold, timeframe } = req.body;
    if (!symbol || !indicator || !condition || threshold == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = insertIndicatorAlert.run(symbol, indicator, period || 14, condition, threshold, timeframe || '1h', null);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete indicator alert
app.delete('/api/indicator-alerts/:id', (req, res) => {
  try {
    removeIndicatorAlert.run(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get alert logs
app.get('/api/logs', (req, res) => {
  try {
    res.json(getRecentLogs.all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get latest prices
app.get('/api/prices', (req, res) => {
  res.json(getLatestPrices());
});

// ─── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║    🚀 Trading Alert Server Running           ║
║                                              ║
║    API:      http://localhost:${PORT}            ║
║    Telegram: ${BOT_TOKEN ? '✅ Connected' : '❌ No token (set TELEGRAM_BOT_TOKEN)'}          ║
║                                              ║
║    Endpoints:                                ║
║    GET  /api/health                          ║
║    GET  /api/alerts                          ║
║    POST /api/alerts                          ║
║    GET  /api/indicator-alerts                ║
║    POST /api/indicator-alerts                ║
║    GET  /api/logs                            ║
║    GET  /api/prices                          ║
╚══════════════════════════════════════════════╝
  `);
});
