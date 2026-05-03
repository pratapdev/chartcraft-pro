const TelegramBot = require('node-telegram-bot-api');
const {
  insertAlert,
  insertIndicatorAlert,
  getAllAlerts,
  getActiveIndicatorAlerts,
  removeAlert,
  removeIndicatorAlert,
  getRecentLogs,
  getSetting,
  setSetting,
} = require('./db');

let bot = null;

/**
 * Parse alert commands from Telegram messages
 * 
 * Supported formats:
 *   BTCUSDT above 70000
 *   BTCUSDT below 60000
 *   BTC/USD crossabove 70000
 *   RSI BTCUSDT above 70 1h
 *   EMA BTCUSDT above 50000 1h 20
 *   alerts           — list active alerts
 *   remove 3         — remove alert by ID
 *   remove ind 5     — remove indicator alert by ID
 *   logs             — recent alert logs
 *   help             — show commands
 */
function parseCommand(text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length === 0) return null;

  const cmd = parts[0].toLowerCase();

  // List alerts
  if (cmd === 'alerts' || cmd === 'list') {
    return { type: 'list' };
  }

  // Recent logs
  if (cmd === 'logs' || cmd === 'history') {
    return { type: 'logs' };
  }

  // Help
  if (cmd === 'help' || cmd === '/help' || cmd === '/start') {
    return { type: 'help' };
  }

  // Remove alert: "remove 3" or "remove ind 5"
  if (cmd === 'remove' || cmd === 'delete' || cmd === 'cancel') {
    if (parts[1]?.toLowerCase() === 'ind' && parts[2]) {
      return { type: 'remove_indicator', id: parseInt(parts[2]) };
    }
    if (parts[1]) {
      return { type: 'remove', id: parseInt(parts[1]) };
    }
    return null;
  }

  // Indicator alert: "RSI BTCUSDT above 70 1h"
  const indicators = ['rsi', 'ema', 'sma'];
  if (indicators.includes(cmd)) {
    if (parts.length < 4) return null;
    const symbol = normalizeSymbol(parts[1]);
    const condition = normalizeCondition(parts[2]);
    const threshold = parseFloat(parts[3]);
    const timeframe = parts[4] || '1h';
    const period = parseInt(parts[5]) || (cmd === 'rsi' ? 14 : 20);

    if (!condition || isNaN(threshold)) return null;

    return {
      type: 'indicator_alert',
      symbol,
      indicator: cmd.toUpperCase(),
      condition,
      threshold,
      timeframe,
      period,
    };
  }

  // Price alert: "BTCUSDT above 70000" or "BTCUSDT crossabove 70000"
  if (parts.length >= 3) {
    const symbol = normalizeSymbol(parts[0]);
    const condition = normalizeCondition(parts[1]);
    const price = parseFloat(parts[2]);
    const timeframe = parts[3] || '1m';

    if (!condition || isNaN(price)) return null;

    return {
      type: 'price_alert',
      symbol,
      condition,
      price,
      timeframe,
    };
  }

  return null;
}

function normalizeSymbol(sym) {
  // BTCUSDT, BTC/USD, btcusd → BTCUSDT
  let s = sym.toUpperCase().replace('/', '');
  if (s.endsWith('USD') && !s.endsWith('USDT')) s += 'T';
  // Store as readable format
  if (s.endsWith('USDT')) {
    const base = s.replace('USDT', '');
    return `${base}/USD`;
  }
  return s;
}

function normalizeCondition(cond) {
  const c = cond.toLowerCase();
  if (['above', 'crossabove', 'cross_above', '>'].includes(c)) return 'above';
  if (['below', 'crossbelow', 'cross_below', '<'].includes(c)) return 'below';
  return null;
}

function formatAlertList() {
  const priceAlerts = getAllAlerts.all();
  const indAlerts = getActiveIndicatorAlerts.all();

  if (priceAlerts.length === 0 && indAlerts.length === 0) {
    return '📋 No active alerts.';
  }

  let msg = '📋 <b>Active Alerts</b>\n\n';

  if (priceAlerts.length > 0) {
    msg += '<b>Price Alerts:</b>\n';
    for (const a of priceAlerts) {
      msg += `  #${a.id} — ${a.symbol} ${a.condition === 'above' ? '↑' : '↓'} ${a.target_price}\n`;
    }
    msg += '\n';
  }

  if (indAlerts.length > 0) {
    msg += '<b>Indicator Alerts:</b>\n';
    for (const a of indAlerts) {
      msg += `  #ind${a.id} — ${a.symbol} ${a.indicator}(${a.period}) ${a.condition} ${a.threshold} [${a.timeframe}]\n`;
    }
  }

  return msg;
}

function formatHelp() {
  return `🤖 <b>Trading Alert Bot</b>

<b>Price Alerts:</b>
  <code>BTCUSDT above 70000</code>
  <code>ETHUSDT below 3000</code>
  <code>BTC/USD crossabove 72000</code>

<b>Indicator Alerts:</b>
  <code>RSI BTCUSDT above 70 1h</code>
  <code>RSI ETHUSDT below 30 4h 14</code>
  <code>EMA BTCUSDT above 65000 1h 20</code>

<b>Manage:</b>
  <code>alerts</code> — list active alerts
  <code>remove 3</code> — remove price alert #3
  <code>remove ind 5</code> — remove indicator alert #5
  <code>logs</code> — recent triggered alerts
  <code>help</code> — show this message`;
}

/**
 * Initialize the Telegram bot with polling
 */
function startBot(token) {
  if (!token) {
    console.log('[TelegramBot] No token provided, bot disabled.');
    return null;
  }

  bot = new TelegramBot(token, { polling: true });
  console.log('[TelegramBot] Bot started with polling...');

  bot.on('message', (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text?.trim();
    if (!text) return;

    try {
      const parsed = parseCommand(text);
      if (!parsed) {
        bot.sendMessage(chatId, '❓ Unknown command. Type <code>help</code> for usage.', { parse_mode: 'HTML' });
        return;
      }

      switch (parsed.type) {
        case 'help': {
          bot.sendMessage(chatId, formatHelp(), { parse_mode: 'HTML' });
          break;
        }

        case 'list': {
          bot.sendMessage(chatId, formatAlertList(), { parse_mode: 'HTML' });
          break;
        }

        case 'logs': {
          const logs = getRecentLogs.all();
          if (logs.length === 0) {
            bot.sendMessage(chatId, '📜 No recent alert logs.');
          } else {
            let logMsg = '📜 <b>Recent Alerts</b>\n\n';
            for (const l of logs.slice(0, 10)) {
              logMsg += `${l.timestamp} — ${l.message}\n\n`;
            }
            bot.sendMessage(chatId, logMsg, { parse_mode: 'HTML' });
          }
          break;
        }

        case 'price_alert': {
          const result = insertAlert.run(parsed.symbol, parsed.condition, parsed.price, parsed.timeframe, chatId);
          const dir = parsed.condition === 'above' ? '↑' : '↓';
          bot.sendMessage(
            chatId,
            `✅ Alert #${result.lastInsertRowid} set!\n${parsed.symbol} ${dir} ${parsed.price}`,
            { parse_mode: 'HTML' }
          );
          break;
        }

        case 'indicator_alert': {
          const result = insertIndicatorAlert.run(
            parsed.symbol, parsed.indicator, parsed.period,
            parsed.condition, parsed.threshold, parsed.timeframe, chatId
          );
          bot.sendMessage(
            chatId,
            `✅ Indicator Alert #ind${result.lastInsertRowid} set!\n${parsed.symbol} ${parsed.indicator}(${parsed.period}) ${parsed.condition} ${parsed.threshold} [${parsed.timeframe}]`,
            { parse_mode: 'HTML' }
          );
          break;
        }

        case 'remove': {
          if (isNaN(parsed.id)) {
            bot.sendMessage(chatId, '❌ Invalid alert ID.');
          } else {
            removeAlert.run(parsed.id);
            bot.sendMessage(chatId, `🗑️ Alert #${parsed.id} removed.`);
          }
          break;
        }

        case 'remove_indicator': {
          if (isNaN(parsed.id)) {
            bot.sendMessage(chatId, '❌ Invalid alert ID.');
          } else {
            removeIndicatorAlert.run(parsed.id);
            bot.sendMessage(chatId, `🗑️ Indicator Alert #ind${parsed.id} removed.`);
          }
          break;
        }
      }
    } catch (err) {
      console.error('[TelegramBot] Error handling message:', err);
      bot.sendMessage(chatId, '❌ Error processing command. Try again.');
    }
  });

  bot.on('polling_error', (err) => {
    console.error('[TelegramBot] Polling error:', err.message);
  });

  return bot;
}

/**
 * Send a message to a specific chat ID
 */
function sendMessage(chatId, message) {
  if (!bot || !chatId) return;
  try {
    bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[TelegramBot] Failed to send message:', err.message);
  }
}

module.exports = { startBot, sendMessage, parseCommand };
