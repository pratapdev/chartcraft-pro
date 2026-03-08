# Backend Guide — Trading Alert Server

## Overview

A standalone Node.js server that monitors cryptocurrency prices 24/7 via Binance WebSocket and sends alert notifications through a Telegram bot. It runs independently of the frontend and persists all data locally in SQLite.

## Tech Stack

| Technology | Purpose |
|---|---|
| Node.js | Runtime |
| Express | REST API server |
| better-sqlite3 | Local SQLite database |
| node-telegram-bot-api | Telegram bot (polling mode) |
| ws | Binance WebSocket client |

## Prerequisites

- **Node.js** v18 or higher
- **npm** package manager
- **Telegram Bot Token** from [@BotFather](https://t.me/BotFather)

## Getting a Telegram Bot Token

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Follow the prompts — choose a name and username for your bot
4. BotFather will reply with your **bot token** (looks like `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`)
5. Save this token — you'll need it to run the server

## Installation

```bash
cd server
npm install
```

## Running the Server

### Option 1: Set token in environment (recommended)

**Windows CMD:**
```cmd
set TELEGRAM_BOT_TOKEN=your-bot-token-here
node index.js
```

**Windows PowerShell:**
```powershell
$env:TELEGRAM_BOT_TOKEN="your-bot-token-here"
node index.js
```

**Mac / Linux:**
```bash
TELEGRAM_BOT_TOKEN="your-bot-token-here" node index.js
```

### Option 2: Hardcode token (quick testing only)

Edit `server/index.js` line 19:
```js
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'paste-your-token-here';
```

> ⚠️ **Security Warning:** Never commit a hardcoded token to a public repository. Rotate the token via @BotFather if exposed.

### Option 3: Auto-restart on file changes

```bash
npm run dev
```

## Verify It's Running

When the server starts successfully, you'll see:

```
╔══════════════════════════════════════════════╗
║    🚀 Trading Alert Server Running           ║
║                                              ║
║    API:      http://localhost:3001            ║
║    Telegram: ✅ Connected                     ║
╚══════════════════════════════════════════════╝
```

If you see `Telegram: ❌ No token`, the token was not set correctly.

## Project Structure

```
server/
├── index.js           # Entry point — starts Express, Telegram bot, and monitoring
├── telegramBot.js     # Telegram command parser and message handler
├── priceMonitor.js    # Binance WebSocket price tracking & alert checking
├── db.js              # SQLite database schema and prepared statements
├── package.json       # Dependencies
├── README.md          # Quick reference
└── alerts.db          # SQLite database (auto-created on first run)
```

## How It Works

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Telegram    │────▶│  telegramBot.js  │────▶│   db.js     │
│  User sends  │     │  Parse commands   │     │  SQLite     │
│  "BTC above  │     │  Create alerts    │     │  alerts.db  │
│   70000"     │     └──────────────────┘     └──────┬──────┘
└─────────────┘                                      │
                                                     │ reads alerts
┌─────────────┐     ┌──────────────────┐             │
│  Telegram    │◀────│ priceMonitor.js  │◀────────────┘
│  Receives    │     │ Binance WebSocket│
│  "⚠️ BTC     │     │ Check crossings  │
│  crossed     │     │ every 1 second   │
│  70000!"     │     └──────────────────┘
└─────────────┘
```

1. **User sends a command** via Telegram (e.g., `BTCUSDT above 70000`)
2. **telegramBot.js** parses the command and stores the alert in SQLite
3. **priceMonitor.js** subscribes to Binance WebSocket for that symbol
4. **Every 1 second**, it checks if any price alert has been crossed
5. **Every 15 seconds**, it checks indicator alerts (RSI, EMA)
6. When triggered, a **notification is sent back via Telegram**

## Telegram Bot Commands

### Price Alerts
| Command | Description |
|---|---|
| `BTCUSDT above 70000` | Alert when BTC crosses above $70,000 |
| `ETHUSDT below 3000` | Alert when ETH crosses below $3,000 |
| `BTC/USD crossabove 72000` | Same as "above" (alternative syntax) |

### Indicator Alerts
| Command | Description |
|---|---|
| `RSI BTCUSDT above 70 1h` | RSI(14) crosses above 70 on 1h chart |
| `RSI ETHUSDT below 30 4h 14` | RSI(14) crosses below 30 on 4h chart |
| `EMA BTCUSDT above 65000 1h 20` | EMA(20) crosses above 65,000 on 1h |

### Management
| Command | Description |
|---|---|
| `alerts` or `list` | Show all active alerts |
| `remove 3` | Remove price alert #3 |
| `remove ind 5` | Remove indicator alert #5 |
| `logs` or `history` | Show recently triggered alerts |
| `help` or `/start` | Show command reference |

## REST API Endpoints

The server exposes a REST API on port **3001** for frontend integration:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Server status & uptime |
| `GET` | `/api/alerts` | List all active price alerts |
| `POST` | `/api/alerts` | Create a price alert |
| `DELETE` | `/api/alerts/:id` | Remove a price alert |
| `GET` | `/api/indicator-alerts` | List active indicator alerts |
| `POST` | `/api/indicator-alerts` | Create an indicator alert |
| `DELETE` | `/api/indicator-alerts/:id` | Remove an indicator alert |
| `GET` | `/api/logs` | Recent alert trigger history |
| `GET` | `/api/prices` | Latest tracked prices |

### Example: Create Alert via API

```bash
curl -X POST http://localhost:3001/api/alerts \
  -H "Content-Type: application/json" \
  -d '{"symbol": "BTCUSDT", "condition": "above", "target_price": 70000}'
```

### Example: List Alerts

```bash
curl http://localhost:3001/api/alerts
```

## Database

SQLite database (`alerts.db`) is auto-created on first run with these tables:

- **alerts** — Price alerts (symbol, condition, target_price, active/triggered status)
- **indicator_alerts** — Indicator alerts (symbol, indicator, period, condition, threshold)
- **alert_logs** — History of triggered alerts
- **settings** — Key-value configuration store

## Running 24/7 with PM2

For persistent background operation:

```bash
# Install PM2 globally
npm install -g pm2

# Start the server
cd server
pm2 start index.js --name trading-alerts

# Save process list (survives reboot)
pm2 save

# Auto-start on system boot
pm2 startup

# View logs
pm2 logs trading-alerts

# Restart after code changes
pm2 restart trading-alerts
```

## Supported Symbols

Any symbol available on Binance spot market. Common examples:
- `BTCUSDT` / `BTC/USD`
- `ETHUSDT` / `ETH/USD`
- `SOLUSDT` / `SOL/USD`
- `BNBUSDT` / `BNB/USD`

The symbol is automatically normalized (e.g., `BTC/USD` → `BTCUSDT` for Binance API).

## Supported Timeframes

`1m`, `3m`, `5m`, `15m`, `1h`, `4h`, `1D`, `1W`

## Troubleshooting

| Issue | Solution |
|---|---|
| `Telegram: ❌ No token` | Token not set correctly. On Windows CMD use `set TELEGRAM_BOT_TOKEN=token` (no quotes, no spaces around `=`) |
| `SQLITE_ERROR` | Delete `alerts.db` and restart — tables will be recreated |
| `WebSocket connection failed` | Check internet connection; Binance may be blocked in your region (use VPN) |
| Bot not responding | Ensure only one instance is running (Telegram only allows one polling connection per token) |
| `better-sqlite3` install fails | You may need build tools: `npm install -g node-gyp` and Python 3 |
