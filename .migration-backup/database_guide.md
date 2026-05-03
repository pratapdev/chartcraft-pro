# Database Guide — Schema & Data Reference

## Overview

This guide documents all database schemas used by the Trading Chart Platform, covering both the local SQLite database (used by the Node.js server) and equivalent cloud schemas for Supabase/Firebase.

---

## Local SQLite Database (`server/alerts.db`)

The SQLite database is auto-created when the Node.js server starts for the first time. Location: `server/alerts.db`

### Table: `alerts`

Stores price-level alerts (e.g., "BTC above 70000").

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | INTEGER | AUTO INCREMENT | Primary key |
| `symbol` | TEXT | — | Trading pair (e.g., `BTC/USD`) |
| `condition` | TEXT | — | `above` or `below` |
| `target_price` | REAL | — | Price level to watch |
| `timeframe` | TEXT | `1m` | Chart timeframe |
| `active` | INTEGER | `1` | 1 = active, 0 = inactive |
| `triggered` | INTEGER | `0` | 1 = has been triggered |
| `created_at` | TEXT | `datetime('now')` | Creation timestamp |
| `triggered_at` | TEXT | NULL | When the alert fired |
| `telegram_chat_id` | TEXT | NULL | Telegram chat to notify |

**Constraints:** `condition IN ('above', 'below')`

### Table: `indicator_alerts`

Stores indicator-based alerts (e.g., "RSI above 70").

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | INTEGER | AUTO INCREMENT | Primary key |
| `symbol` | TEXT | — | Trading pair |
| `indicator` | TEXT | — | `RSI`, `EMA`, or `SMA` |
| `period` | INTEGER | `14` | Indicator period |
| `condition` | TEXT | — | `above`, `below`, `cross_above`, `cross_below` |
| `threshold` | REAL | — | Threshold value |
| `timeframe` | TEXT | `1h` | Chart timeframe |
| `active` | INTEGER | `1` | 1 = active |
| `triggered` | INTEGER | `0` | 1 = triggered |
| `created_at` | TEXT | `datetime('now')` | Creation timestamp |
| `triggered_at` | TEXT | NULL | Trigger timestamp |
| `telegram_chat_id` | TEXT | NULL | Telegram chat to notify |

### Table: `alert_logs`

History of triggered alerts.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | INTEGER | AUTO INCREMENT | Primary key |
| `alert_id` | INTEGER | — | Reference to alert |
| `alert_type` | TEXT | `price` | `price` or `indicator` |
| `symbol` | TEXT | — | Trading pair |
| `message` | TEXT | — | Human-readable alert message |
| `price` | REAL | — | Price/value when triggered |
| `timestamp` | TEXT | `datetime('now')` | When it triggered |

### Table: `settings`

Key-value store for server configuration.

| Column | Type | Default | Description |
|---|---|---|---|
| `key` | TEXT (PK) | — | Setting name |
| `value` | TEXT | — | Setting value |

---

## Frontend Data (Zustand + localStorage)

The frontend persists state via Zustand's `persist` middleware to `localStorage`. This data is **browser-local** and not synced to any database.

### Persisted State

| Key | Type | Description |
|---|---|---|
| `symbol` | `string` | Current trading pair (e.g., `BTCUSDT`) |
| `timeframe` | `Timeframe` | Active chart timeframe |
| `marketType` | `'crypto' \| 'indian'` | Market selection |
| `trendlines` | `Trendline[]` | User-drawn lines on chart |
| `alerts` | `Alert[]` | Browser-side price alerts |
| `alertLogs` | `AlertLog[]` | Browser-side alert history |
| `indicators` | `IndicatorConfig[]` | Active technical indicators |
| `fibonacciDrawings` | `FibonacciDrawing[]` | Fibonacci retracement drawings |
| `indicatorCrossAlerts` | `IndicatorCrossAlert[]` | Indicator crossing alerts |
| `indicatorThresholdAlerts` | `IndicatorThresholdAlert[]` | Indicator threshold alerts |
| `stochRSICrossAlerts` | `StochRSICrossAlert[]` | StochRSI K/D cross alerts |

### TypeScript Types

#### `Alert`
```typescript
interface Alert {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  trendlineId: string;
  condition: 'cross_above' | 'cross_below' | 'cross_any';
  active: boolean;
  triggered: boolean;
  triggeredAt?: number;
  message?: string;
  createdAt: number;
  telegramEnabled?: boolean;
}
```

#### `IndicatorConfig`
```typescript
interface IndicatorConfig {
  id: string;
  type: 'EMA' | 'SMA' | 'RSI' | 'STOCH_RSI' | 'MACD' | 'BBANDS' | 'VWAP' | 'SUPERTREND' | 'ADX' | 'ATR' | 'OBV';
  period: number;
  color: string;
  visible: boolean;
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  kPeriod?: number;     // StochRSI
  dPeriod?: number;     // StochRSI
  color2?: string;      // Secondary color
  stdDev?: number;      // Bollinger Bands
  multiplier?: number;  // Supertrend ATR multiplier
}
```

#### `Trendline`
```typescript
interface Trendline {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
  color: string;
  thickness: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  createdAt: number;
}
```

---

## Data Flow

```
┌─────────────────────────────────────────────────┐
│                   FRONTEND                       │
│                                                  │
│  Zustand Store ──persist──▶ localStorage         │
│       │                                          │
│       ├── alerts[] (browser-side detection)       │
│       ├── trendlines[] (chart drawings)           │
│       ├── indicators[] (EMA, RSI, etc.)           │
│       └── alertLogs[] (triggered history)         │
│                                                  │
│  Binance WebSocket ──▶ Real-time candle data     │
│                                                  │
└──────────────────────┬──────────────────────────┘
                       │ REST API (optional)
                       ▼
┌─────────────────────────────────────────────────┐
│               BACKEND SERVER                     │
│                                                  │
│  SQLite (alerts.db)                              │
│       ├── alerts (Telegram-created)              │
│       ├── indicator_alerts                       │
│       ├── alert_logs                             │
│       └── settings                               │
│                                                  │
│  Binance WebSocket ──▶ Price monitoring (24/7)   │
│  Telegram Bot ──▶ Command interface              │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## Querying the SQLite Database Directly

You can inspect the database using the `sqlite3` CLI:

```bash
cd server
sqlite3 alerts.db

-- List tables
.tables

-- Show schema
.schema alerts

-- View active alerts
SELECT * FROM alerts WHERE active = 1;

-- View recent logs
SELECT * FROM alert_logs ORDER BY timestamp DESC LIMIT 10;

-- Count alerts by symbol
SELECT symbol, COUNT(*) FROM alerts GROUP BY symbol;

-- Exit
.quit
```

---

## Resetting the Database

To start fresh, simply delete the database file and restart the server:

```bash
cd server
del alerts.db        # Windows
# rm alerts.db       # Mac/Linux
node index.js        # Tables auto-recreate
```

---

## Migration Path

| From | To | Steps |
|---|---|---|
| localStorage | SQLite | Export Zustand state → insert into SQLite via API |
| SQLite | Supabase | Run SQL schemas from `supabase_guide.md` → migrate data via REST |
| SQLite | Firebase | Create Firestore collections from `firebase_guide.md` → migrate |
| localStorage | Supabase | Connect frontend directly to Supabase client |
