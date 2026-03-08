# Trading Alert Server

Local Node.js server for Telegram-controlled trading alerts with Binance price monitoring.

## Setup

```bash
cd server
npm install
```

## Configure Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the bot token
4. Set it as an environment variable:

```bash
# Linux/Mac
export TELEGRAM_BOT_TOKEN="your-bot-token-here"

# Windows (PowerShell)
$env:TELEGRAM_BOT_TOKEN="your-bot-token-here"

# Or edit server/index.js line 8 directly
```

## Run

```bash
node index.js
# or for auto-restart on changes:
npm run dev
```

## Telegram Commands

| Command | Example | Description |
|---------|---------|-------------|
| Price alert | `BTCUSDT above 70000` | Alert when price crosses above 70000 |
| Price alert | `ETHUSDT below 3000` | Alert when price crosses below 3000 |
| RSI alert | `RSI BTCUSDT above 70 1h` | Alert when RSI(14) > 70 on 1h |
| EMA alert | `EMA BTCUSDT above 65000 1h 20` | Alert when EMA(20) > 65000 |
| List alerts | `alerts` | Show all active alerts |
| Remove | `remove 3` | Remove price alert #3 |
| Remove | `remove ind 5` | Remove indicator alert #5 |
| Logs | `logs` | Show recent triggered alerts |
| Help | `help` | Show all commands |

## REST API

The server also exposes a REST API on port 3001 for frontend integration:

- `GET /api/health` — Server status
- `GET /api/alerts` — List active price alerts
- `POST /api/alerts` — Create price alert `{ symbol, condition, target_price, timeframe }`
- `DELETE /api/alerts/:id` — Remove price alert
- `GET /api/indicator-alerts` — List active indicator alerts
- `POST /api/indicator-alerts` — Create indicator alert
- `DELETE /api/indicator-alerts/:id` — Remove indicator alert
- `GET /api/logs` — Recent alert history
- `GET /api/prices` — Latest tracked prices

## How It Works

1. **Telegram Bot** polls for messages and parses alert commands
2. **Price Monitor** connects to Binance WebSocket for real-time prices
3. **Alert Checker** runs every 1s (price) / 15s (indicators) to detect crossings
4. **SQLite Database** persists all alerts locally in `alerts.db`
5. Triggered alerts are sent back via Telegram + logged to DB

## Run 24/7 with PM2

```bash
npm install -g pm2
pm2 start index.js --name trading-alerts
pm2 save
pm2 startup  # auto-start on reboot
```
