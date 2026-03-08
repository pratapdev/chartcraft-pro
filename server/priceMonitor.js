const WebSocket = require('ws');
const {
  getActiveAlerts,
  triggerAlert,
  insertLog,
  getActiveIndicatorAlerts,
  triggerIndicatorAlert,
} = require('./db');

// Track latest prices per symbol
const latestPrices = new Map();
// Track previous prices for crossing detection
const previousPrices = new Map();
// Active WebSocket connections
const connections = new Map();
// Candle history for indicator computation (symbol:timeframe -> candles[])
const candleHistory = new Map();

let onAlertTriggered = null; // callback: (message, chatId) => void

function setAlertCallback(cb) {
  onAlertTriggered = cb;
}

function toBinanceSymbol(symbol) {
  // Accept formats: BTCUSDT, BTC/USD, BTCUSD
  let s = symbol.toUpperCase().replace('/', '');
  if (s.endsWith('USD') && !s.endsWith('USDT')) s += 'T';
  return s;
}

function toStreamSymbol(binanceSymbol) {
  return binanceSymbol.toLowerCase();
}

const INTERVAL_MAP = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m',
  '1h': '1h', '4h': '4h', '1D': '1d', '1W': '1w',
};

/**
 * Fetch historical candles from Binance REST
 */
async function fetchCandles(symbol, timeframe = '1h', limit = 100) {
  const binSymbol = toBinanceSymbol(symbol);
  const interval = INTERVAL_MAP[timeframe] || '1h';
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${binSymbol}&interval=${interval}&limit=${limit}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (err) {
    console.error(`[PriceMonitor] Failed to fetch candles for ${symbol}:`, err.message);
    return [];
  }
}

/**
 * Compute simple RSI from candle closes
 */
function computeRSI(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const closes = candles.map((c) => c.close);
  let gains = 0, losses = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Compute EMA from candle closes
 */
function computeEMA(candles, period) {
  if (candles.length < period) return null;
  const closes = candles.map((c) => c.close);
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Check all active price alerts against latest prices
 */
function checkPriceAlerts() {
  const alerts = getActiveAlerts.all();
  for (const alert of alerts) {
    const symbol = toBinanceSymbol(alert.symbol);
    const price = latestPrices.get(symbol);
    const prevPrice = previousPrices.get(symbol);
    if (price == null || prevPrice == null) continue;

    let triggered = false;
    if (alert.condition === 'above' && prevPrice <= alert.target_price && price > alert.target_price) {
      triggered = true;
    }
    if (alert.condition === 'below' && prevPrice >= alert.target_price && price < alert.target_price) {
      triggered = true;
    }

    if (triggered) {
      const dir = alert.condition === 'above' ? '↑ Crossed Above' : '↓ Crossed Below';
      const msg = `⚠️ ${alert.symbol} ${dir} ${alert.target_price}\nCurrent: ${price.toFixed(2)}\n🕐 ${new Date().toLocaleTimeString()}`;

      triggerAlert.run(alert.id);
      insertLog.run(alert.id, 'price', alert.symbol, msg, price);

      console.log(`[ALERT] ${msg}`);
      if (onAlertTriggered) {
        onAlertTriggered(msg, alert.telegram_chat_id);
      }
    }
  }
}

/**
 * Check indicator-based alerts (RSI thresholds, EMA crossovers)
 */
async function checkIndicatorAlerts() {
  const alerts = getActiveIndicatorAlerts.all();
  for (const alert of alerts) {
    try {
      const key = `${alert.symbol}:${alert.timeframe}`;
      let candles = candleHistory.get(key);

      // Fetch candles if not cached or stale
      if (!candles || candles.length === 0) {
        candles = await fetchCandles(alert.symbol, alert.timeframe, 100);
        if (candles.length > 0) candleHistory.set(key, candles);
      }

      if (candles.length < 20) continue;

      let value = null;
      const indicator = alert.indicator.toUpperCase();

      if (indicator === 'RSI') {
        value = computeRSI(candles, alert.period || 14);
      } else if (indicator === 'EMA') {
        value = computeEMA(candles, alert.period || 20);
      }

      if (value == null) continue;

      let triggered = false;
      if (alert.condition === 'above' && value > alert.threshold) triggered = true;
      if (alert.condition === 'below' && value < alert.threshold) triggered = true;

      if (triggered) {
        const msg = `⚠️ ${alert.symbol} ${indicator}(${alert.period}) ${alert.condition === 'above' ? '↑ above' : '↓ below'} ${alert.threshold}\nValue: ${value.toFixed(2)}\n🕐 ${new Date().toLocaleTimeString()}`;

        triggerIndicatorAlert.run(alert.id);
        insertLog.run(alert.id, 'indicator', alert.symbol, msg, value);

        console.log(`[INDICATOR ALERT] ${msg}`);
        if (onAlertTriggered) {
          onAlertTriggered(msg, alert.telegram_chat_id);
        }
      }
    } catch (err) {
      console.error(`[PriceMonitor] Indicator alert check failed for ${alert.symbol}:`, err.message);
    }
  }
}

/**
 * Subscribe to Binance WebSocket for a symbol
 */
function subscribeSymbol(symbol) {
  const binSymbol = toBinanceSymbol(symbol);
  const stream = toStreamSymbol(binSymbol);

  if (connections.has(binSymbol)) return;

  const wsUrl = `wss://stream.binance.com:9443/ws/${stream}@trade`;
  let alive = true;
  let reconnectTimer = null;

  function connect() {
    if (!alive) return;
    console.log(`[PriceMonitor] Connecting to ${binSymbol}...`);

    const ws = new WebSocket(wsUrl);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.e === 'trade') {
          const price = parseFloat(msg.p);
          const prev = latestPrices.get(binSymbol);
          if (prev != null) previousPrices.set(binSymbol, prev);
          latestPrices.set(binSymbol, price);
        }
      } catch {}
    });

    ws.on('close', () => {
      if (alive) {
        console.log(`[PriceMonitor] ${binSymbol} disconnected, reconnecting in 5s...`);
        reconnectTimer = setTimeout(connect, 5000);
      }
    });

    ws.on('error', (err) => {
      console.error(`[PriceMonitor] ${binSymbol} WS error:`, err.message);
      ws.close();
    });

    connections.set(binSymbol, { ws, alive: true });
  }

  connect();

  return () => {
    alive = false;
    clearTimeout(reconnectTimer);
    const conn = connections.get(binSymbol);
    if (conn) conn.ws.close();
    connections.delete(binSymbol);
  };
}

/**
 * Sync subscriptions based on active alerts
 */
function syncSubscriptions() {
  const priceAlerts = getActiveAlerts.all();
  const indAlerts = getActiveIndicatorAlerts.all();
  const neededSymbols = new Set();

  for (const a of [...priceAlerts, ...indAlerts]) {
    neededSymbols.add(toBinanceSymbol(a.symbol));
  }

  // Subscribe to new symbols
  for (const sym of neededSymbols) {
    if (!connections.has(sym)) {
      subscribeSymbol(sym.replace('USDT', '/USD'));
    }
  }

  // Unsubscribe from symbols with no active alerts
  for (const [sym] of connections) {
    if (!neededSymbols.has(sym)) {
      console.log(`[PriceMonitor] No alerts for ${sym}, unsubscribing`);
      const conn = connections.get(sym);
      if (conn) {
        conn.alive = false;
        conn.ws.close();
      }
      connections.delete(sym);
    }
  }
}

// Refresh candle cache every 60s
function startCandleRefresh() {
  setInterval(async () => {
    for (const [key] of candleHistory) {
      const [symbol, timeframe] = key.split(':');
      try {
        const candles = await fetchCandles(symbol, timeframe, 100);
        if (candles.length > 0) candleHistory.set(key, candles);
      } catch {}
    }
  }, 60_000);
}

/**
 * Start the monitoring loop
 */
function startMonitoring() {
  console.log('[PriceMonitor] Starting price monitoring...');

  // Sync subscriptions every 10s
  syncSubscriptions();
  setInterval(syncSubscriptions, 10_000);

  // Check price alerts every 1s
  setInterval(checkPriceAlerts, 1000);

  // Check indicator alerts every 15s
  setInterval(checkIndicatorAlerts, 15_000);

  // Refresh candle data
  startCandleRefresh();
}

function getLatestPrices() {
  const result = {};
  for (const [sym, price] of latestPrices) {
    result[sym] = price;
  }
  return result;
}

module.exports = {
  startMonitoring,
  setAlertCallback,
  getLatestPrices,
  subscribeSymbol,
  toBinanceSymbol,
};
