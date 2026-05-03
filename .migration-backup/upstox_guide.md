# Upstox Integration Guide — Indian Stocks with Live Data

This guide explains how to set up the Upstox API integration to chart Indian stocks (NSE/BSE) with historical and live data.

---

## 1. Create an Upstox Developer Account

1. Go to [Upstox Developer Portal](https://account.upstox.com/developer/apps)
2. Sign up / log in with your Upstox trading account
3. Click **"New App"** and fill in:
   - **App Name**: e.g. `TradingChart`
   - **Redirect URL**: `http://localhost:5173/callback` (or your deployed URL)
   - **Description**: anything
4. After creation, note down:
   - **API Key** (also called `client_id`)
   - **API Secret** (also called `client_secret`)

---

## 2. Generate an Access Token

Upstox uses OAuth 2.0. You need an `access_token` to call their APIs.

### Step 2a — Get Authorization Code

Open this URL in your browser (replace `YOUR_API_KEY` and `YOUR_REDIRECT_URL`):

```
https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=YOUR_API_KEY&redirect_uri=YOUR_REDIRECT_URL
```

Log in with your Upstox credentials. After approval, you'll be redirected to:

```
http://localhost:5173/callback?code=AUTHORIZATION_CODE
```

Copy the `code` parameter from the URL.

### Step 2b — Exchange Code for Access Token

```bash
curl -X POST https://api.upstox.com/v2/login/authorization/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "code=AUTHORIZATION_CODE" \
  -d "client_id=YOUR_API_KEY" \
  -d "client_secret=YOUR_API_SECRET" \
  -d "redirect_uri=YOUR_REDIRECT_URL" \
  -d "grant_type=authorization_code"
```

Response:
```json
{
  "access_token": "eyJ0eXAi...",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

> ⚠️ **Important**: The access token expires daily. You must regenerate it each trading day (before market opens at 9:15 AM IST).

---

## 3. Enter Credentials in the App

1. Open the trading chart app
2. Click the **⚙️ Settings** icon in the right sidebar
3. Switch to **"Indian Stocks"** market mode (if available in the symbol selector)
4. Enter your **API Key** and **Access Token** in the Upstox credentials section
5. Credentials are saved in `localStorage` and persist across sessions

### Where credentials are stored (code reference)

```typescript
// src/lib/upstoxData.ts
localStorage.setItem('upstox-api-key', apiKey);
localStorage.setItem('upstox-access-token', accessToken);
```

---

## 4. How It Works

### Architecture

| Component | File | Purpose |
|-----------|------|---------|
| Upstox data layer | `src/lib/upstoxData.ts` | API calls, credential management, stock list |
| Chart store | `src/stores/chartStore.ts` | Switches between Binance (crypto) and Upstox (Indian) based on `marketType` |
| Type definitions | `src/types/trading.ts` | `MarketType = 'crypto' \| 'indian'` |

### Data Flow

1. User selects **market type** → `indian`
2. User picks a symbol (e.g. `RELIANCE`)
3. `chartStore.loadCandles()` detects `marketType === 'indian'` and calls `fetchUpstoxCandles()`
4. `fetchUpstoxCandles()` hits the Upstox Historical Candle API
5. Candles are parsed and displayed on the chart

### API Endpoint Used

```
GET https://api.upstox.com/v2/historical-candle/{instrument_key}/{interval}/{to_date}/{from_date}
```

Headers:
```
Authorization: Bearer {access_token}
Content-Type: application/json
Accept: application/json
```

---

## 5. Supported Stocks

Pre-configured stocks in `src/lib/upstoxData.ts`:

| Symbol | Name | Instrument Key |
|--------|------|----------------|
| RELIANCE | Reliance Industries | `NSE_EQ\|INE002A01018` |
| TCS | Tata Consultancy | `NSE_EQ\|INE467B01029` |
| INFY | Infosys | `NSE_EQ\|INE009A01021` |
| HDFCBANK | HDFC Bank | `NSE_EQ\|INE040A01034` |
| ICICIBANK | ICICI Bank | `NSE_EQ\|INE090A01021` |
| SBIN | State Bank of India | `NSE_EQ\|INE062A01020` |
| BHARTIARTL | Bharti Airtel | `NSE_EQ\|INE397D01024` |
| ITC | ITC Ltd | `NSE_EQ\|INE154A01025` |
| TATAMOTORS | Tata Motors | `NSE_EQ\|INE155A01022` |
| WIPRO | Wipro | `NSE_EQ\|INE075A01022` |
| HCLTECH | HCL Technologies | `NSE_EQ\|INE860A01027` |
| LT | Larsen & Toubro | `NSE_EQ\|INE018A01030` |

### Adding More Stocks

Edit the `INDIAN_STOCKS` array in `src/lib/upstoxData.ts`:

```typescript
{ name: 'AXISBANK', label: 'Axis Bank', instrumentKey: 'NSE_EQ|INE238A01034' },
```

To find instrument keys, use the Upstox instrument search API:
```
GET https://api.upstox.com/v2/market-quote/quotes?instrument_key=NSE_EQ|INE238A01034
```

Or download the full instrument list CSV from [Upstox Complete Instruments](https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz).

---

## 6. Timeframe Mapping

| App Timeframe | Upstox Interval | Notes |
|---------------|-----------------|-------|
| 1m | `1minute` | |
| 3m | `1minute` | Upstox has no 3m; uses 1m data |
| 5m | `5minute` | |
| 15m | `15minute` | |
| 1h | `30minute` | Upstox has no 1h; uses 30m data |
| 4h | `30minute` | Upstox has no 4h; uses 30m data |
| 1D | `day` | |
| 1W | `week` | |

> To get proper 1h/4h candles, you would need to aggregate 30-minute candles client-side.

---

## 7. Adding Live Data (WebSocket)

Currently only **historical candles** are fetched. To add real-time streaming:

### Step 7a — Upstox WebSocket API

Upstox provides a WebSocket feed for live market data. Documentation:
- [Upstox WebSocket Docs](https://upstox.com/developer/api-documentation/websocket)

### Step 7b — Get WebSocket Auth URL

```bash
curl -X GET https://api.upstox.com/v2/feed/market-data-feed/authorize \
  -H "Authorization: Bearer {access_token}" \
  -H "Accept: application/json"
```

Response:
```json
{
  "data": {
    "authorizedRedirectUri": "wss://ws.upstox.com/market-data/v2/feed?token=..."
  }
}
```

### Step 7c — Connect to WebSocket

```typescript
// Example: src/lib/upstoxWebSocket.ts
import { getUpstoxCredentials } from './upstoxData';

export async function connectUpstoxWS(instrumentKeys: string[], onTick: (data: any) => void) {
  const { accessToken } = getUpstoxCredentials();

  // 1. Get authorized WebSocket URL
  const res = await fetch('https://api.upstox.com/v2/feed/market-data-feed/authorize', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const json = await res.json();
  const wsUrl = json.data.authorizedRedirectUri;

  // 2. Connect
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    // Subscribe to instruments
    const message = JSON.stringify({
      guid: "someguid",
      method: "sub",
      data: {
        mode: "full",
        instrumentKeys: instrumentKeys,
      },
    });
    ws.send(Buffer.from(message));
  };

  ws.onmessage = (event) => {
    // Upstox sends protobuf-encoded data — decode accordingly
    // See Upstox docs for protobuf schema
    onTick(event.data);
  };

  return () => ws.close();
}
```

> ⚠️ **Note**: Upstox WebSocket uses **Protocol Buffers** (protobuf) encoding. You'll need the `protobufjs` package and Upstox's `.proto` schema file to decode messages. See their [GitHub examples](https://github.com/upstox/upstox-nodejs).

### Step 7d — Wire into Chart Store

In `src/stores/chartStore.ts`, update `startLiveUpdates()` for Indian market:

```typescript
startLiveUpdates: () => {
  const { marketType, symbol } = get();
  if (marketType === 'indian') {
    const instrumentKey = getInstrumentKey(symbol);
    if (!instrumentKey) return;
    const unsub = connectUpstoxWS([instrumentKey], (tick) => {
      // Parse tick → Candle format and call updateLastCandle()
    });
    set({ unsubscribe: unsub, connected: true });
  } else {
    // existing Binance WebSocket logic
  }
},
```

---

## 8. Server-Side Alerts for Indian Stocks

The `server/priceMonitor.js` currently only supports Binance (crypto). To add Indian stock alerts:

### What to Change

1. **Add Upstox WebSocket** in a new `server/upstoxMonitor.js`
2. **Modify `server/db.js`** to store `market_type` column in alerts table
3. **Update `server/telegramBot.js`** to accept Indian stock symbols
4. **Route alerts** to either Binance or Upstox monitor based on market type

### Example Telegram command for Indian stocks:
```
RELIANCE above 2800 indian
RSI INFY above 70 1h indian
```

---

## 9. Troubleshooting

| Issue | Solution |
|-------|----------|
| `401 Unauthorized` | Access token expired — regenerate daily |
| `403 Forbidden` | API key invalid or app not approved |
| Empty candle data | Market is closed (NSE: Mon–Fri, 9:15 AM – 3:30 PM IST) |
| CORS errors | Upstox API may block browser requests — use a proxy or server-side calls |
| `Invalid instrument key` | Verify the ISIN from Upstox instrument list CSV |

### CORS Workaround

If you hit CORS errors calling Upstox from the browser, add a proxy route in your server:

```javascript
// server/index.js
app.get('/api/upstox/candles', async (req, res) => {
  const { instrumentKey, interval, from, to, token } = req.query;
  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/${interval}/${to}/${from}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const data = await response.json();
  res.json(data);
});
```

---

## 10. Daily Workflow

1. **Before market opens** (9:00 AM IST):
   - Generate a new access token (Step 2)
   - Enter it in the app settings
2. **During market hours** (9:15 AM – 3:30 PM IST):
   - Select Indian market mode
   - Pick stocks and chart them
   - Set alerts via Telegram bot (if server is running)
3. **After market closes**:
   - Historical data remains available
   - Live WebSocket will stop receiving ticks

---

## Quick Reference

```
Upstox Developer Portal:  https://account.upstox.com/developer/apps
API Docs:                  https://upstox.com/developer/api-documentation
WebSocket Docs:            https://upstox.com/developer/api-documentation/websocket
Instrument List:           https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz
Proto Schema:              https://github.com/upstox/upstox-nodejs
```
