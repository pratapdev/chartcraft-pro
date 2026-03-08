# Features

Complete feature documentation for the Trading Chart Application — a professional-grade, real-time charting platform built with React, TypeScript, and Lightweight Charts.

---

## 📊 Charting Engine

### Candlestick Chart
- Real-time candlestick chart powered by **Lightweight Charts v4.1.3**
- OHLCV (Open, High, Low, Close, Volume) data display
- Volume histogram rendered as an overlay at the bottom of the chart
- Smooth real-time candle updates via WebSocket (Binance)
- Auto-reconnect and fallback data generation when API is unavailable

### Multi-Timeframe Support
- Supported timeframes: **1m, 3m, 5m, 15m, 1h, 4h, 1D, 1W**
- Quick-switch buttons in the top bar
- Multi-timeframe view mode: displays 4 synchronized charts (15m, 1h, 4h, 1D) simultaneously
- Charts in multi-timeframe mode share synchronized time scale scrolling

### Crosshair & Data Legend
- **White dotted crosshair lines** on hover (vertical + horizontal)
- Real-time OHLCV legend displayed at top-left of chart
- Indicator values shown inline in the legend at the hovered candle
- Click indicator labels in the legend to select/highlight them
- Delete indicators directly from the legend via ✕ button

---

## 🪙 Market Support

### Crypto Markets
- Live data from **Binance REST API** + **WebSocket** streaming
- Pre-configured symbols: BTC/USD, ETH/USD, SOL/USD, BNB/USD, XRP/USD, ADA/USD, DOGE/USD, AVAX/USD
- **Custom pair support**: Add any trading pair (auto-converts to Binance format)
- Custom pairs persisted in localStorage

### Indian Stock Market
- Integration with **Upstox API** for Indian equities
- Pre-configured stocks: RELIANCE, TCS, INFOSYS, HDFCBANK, ICICIBANK, SBIN, BHARTIARTL, ITC, KOTAKBANK, LT, AXISBANK, WIPRO, BAJFINANCE, MARUTI, TATAMOTORS, SUNPHARMA, TITAN, ULTRACEMCO, NESTLEIND, ASIANPAINT
- Configurable Upstox API credentials (API Key + Access Token)
- Market type switcher (Crypto ↔ Indian Stocks) in the top bar

---

## ✏️ Drawing Tools

### Trendline
- Click and drag to draw diagonal trendlines
- Adjustable color, thickness, and line style (solid, dashed, dotted)
- Drag endpoints or body to reposition after drawing
- Select to highlight with glow effect and endpoint handles

### Horizontal Line
- Single-click placement for horizontal price levels
- Extends across the full visible chart width
- Yellow color by default
- **⊕ Alert button** appears on selected horizontal lines to quickly add price alerts

### Fibonacci Retracement
- Click and drag to draw Fibonacci levels
- Standard levels: 0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%
- Color-coded levels with semi-transparent fill between levels
- Price labels displayed next to each level
- Click to select; delete button appears for removal

### Measure Tool
- Click and drag to measure price range and bar count
- Displays: price difference, percentage change, and number of bars
- Color-coded (green for up, red for down)
- Shaded rectangle with diagonal reference line
- Info box follows the cursor with measurement details

### Drawing Management
- Undo/Redo support for deleted drawings (Ctrl+Z / Ctrl+Y)
- Toast notifications with "Undo" action on deletion
- "Clear All Drawings" button in the left toolbar
- Drawings persist across sessions (localStorage via Zustand persist)

---

## 📈 Technical Indicators

### Overlay Indicators (on main chart)
- **EMA** (Exponential Moving Average) — configurable period, color, line width, line style
- **SMA** (Simple Moving Average) — configurable period, color, line width, line style
- **Bollinger Bands** — configurable period, std deviation, color
- **VWAP** (Volume Weighted Average Price)
- **Supertrend** — configurable period and ATR multiplier; dual-color (green/red) with BUY/SELL arrow markers
- **Pivot Points High/Low** — identifies swing highs and lows; configurable left/right bar lookback period; displayed as labeled circle markers (green H for highs, red L for lows)

- **RSI** (Relative Strength Index) — with overbought (70) / oversold (30) reference lines
- **Stochastic RSI** — K and D lines with configurable smoothing periods
- **MACD** — (type defined, rendering in indicator pane)
- **ADX** (Average Directional Index)
- **ATR** (Average True Range)
- **OBV** (On Balance Volume)

### Indicator Management
- Add indicators from the right sidebar with preset defaults
- Toggle visibility per indicator (eye icon)
- Edit period, color, line width, and line style per indicator
- For StochRSI: configurable K period and D period smoothing
- For Bollinger Bands: configurable standard deviation
- For Supertrend: configurable ATR multiplier and buy/sell colors
- Delete individual indicators or clear all at once
- Select indicators via crosshair legend click
- Indicator panes are time-synced with the main chart

---

## 🔔 Alert System

### Price Alerts (Trendline-based)
- Create alerts on any horizontal line or trendline
- Conditions: **Crossing Up**, **Crossing Down**, **Any Crossing**
- Real-time tick-by-tick detection (not just candle close)
- Alerts trigger with audio notification and toast message

### Crosshair Quick Alert
- **"+" button on crosshair**: appears near the right price scale when hovering
- Click the button or press **`+`** key to instantly create a horizontal line + alert at the current crosshair price
- Button stays clickable with delayed hide (300ms grace period)

### Indicator Cross Alerts
- Alert when two indicators cross each other (e.g., EMA 20 crosses EMA 50)
- Configurable condition: cross above, cross below, or any cross
- Select indicator pairs from the right sidebar

### Indicator Threshold Alerts
- Alert when an indicator crosses a threshold value
- Example: RSI above 70, ADX below 25
- Configurable threshold and condition (above/below)

### StochRSI K/D Cross Alerts
- Alert when StochRSI K line crosses D line
- Configurable condition: cross above, cross below, or any cross

### Alert Notifications
- **Audio alerts** via Web Audio API with distinct tones:
  - Rising tone for crossing up
  - Falling tone for crossing down
  - Oscillating tone for any crossing
- Audio unlock mechanism for browser compatibility (user gesture required)
- **Telegram notifications**: optional per-alert Telegram push via bot
- Alert logs displayed in the bottom panel with timestamp, price, and message
- Alert log capped at 100 entries

### Background Alert Monitoring
- Alerts on non-visible symbol/timeframe combinations are monitored in background
- Background candle data fetched and cached (`alertCandles` in store)
- Crossing detection runs for all active alerts regardless of current chart view

---

## 📱 Telegram Integration

- Configure Telegram Bot Token and Chat ID in the Settings panel
- Enable/disable Telegram notifications globally
- Per-alert Telegram toggle
- Test notification button to verify setup
- Messages include symbol, price, and alert condition details

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Cursor / Select tool |
| `T` | Trendline tool |
| `H` | Horizontal Line tool |
| `F` | Fibonacci Retracement tool |
| `M` | Measure tool |
| `+` / `=` | Add alert at crosshair price |
| `Delete` / `Backspace` | Delete selected drawing |
| `Escape` | Cancel drawing / Deselect |
| `Ctrl+Z` | Undo last deletion |
| `Ctrl+Y` | Redo last deletion |
| `A` | Open Alerts panel |
| `I` | Open Indicators panel |
| `S` | Open Settings panel |
| `?` | Toggle keyboard shortcuts overlay |

---

## 🎨 UI & Layout

### Layout Structure
- **Top Bar**: Symbol selector, timeframe buttons, market type switcher, connection status, multi-TF toggle
- **Left Toolbar**: Drawing tools, indicator quick-add, alert/indicator/settings panel toggles, clear buttons
- **Main Chart Area**: Candlestick chart with drawing overlay and crosshair legend
- **Indicator Panes**: Sub-chart indicators rendered below the main chart
- **Right Sidebar**: Resizable panel with tabs for Alerts, Indicators, and Settings
- **Bottom Panel**: Alert log with triggered alert history

### Resizable Panels
- Right sidebar is resizable via drag handle (12%–40% width)
- Collapsible right sidebar

### Settings
- **Chart Font Size**: Adjustable slider (9px–20px) with quick-select buttons
  - Affects price scale, time scale, and all chart text
  - Applies to main chart, indicator panes, and mini charts
  - Persisted across sessions

### Theme
- Dark theme optimized for trading (background: `#0d1117`)
- Custom chart colors: green (#22c55e) for bullish, red (#ef4444) for bearish
- Grid lines: subtle dark (#1c2333)
- JetBrains Mono monospace font for data display

---

## 💾 Data Persistence

- **Zustand store with `persist` middleware** saves to localStorage:
  - Trendlines and drawings
  - Alerts and alert logs
  - Indicator configurations
  - Indicator cross/threshold/StochRSI alerts
  - Fibonacci drawings
  - Selected symbol and timeframe
  - Market type (crypto/indian)
  - Chart font size
- Custom trading pairs saved separately in localStorage
- Telegram credentials saved in localStorage

---

## 🖥️ Backend Server (Node.js)

A standalone Node.js server (`/server`) provides:
- **Express REST API** for alert management (CRUD)
- **SQLite database** (`better-sqlite3`) for persistent alert storage
- **Telegram Bot** integration via `node-telegram-bot-api`
- **Price monitoring** service with WebSocket connections to Binance
- Background alert checking and notification dispatch
- Configurable via environment variables (`TELEGRAM_BOT_TOKEN`, `PORT`)

---

## 🏗️ Technical Architecture

### Frontend Stack
- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** with custom design tokens
- **Zustand** for state management (with persist middleware)
- **Lightweight Charts** v4.1.3 for candlestick rendering
- **Canvas overlay** for interactive drawings (hit-testing + event re-dispatch)
- **Sonner** for toast notifications
- **React Resizable Panels** for layout

### Key Patterns
- Canvas drawing overlay with pointer-event pass-through for seamless chart interaction
- Hit-testing system: overlay captures mouse events, performs hit detection on drawings; if no hit, disables pointer-events and re-dispatches to underlying chart
- Web Audio API with user-gesture unlock for reliable audio playback
- Background alert monitoring with per-symbol/timeframe candle caching
- Ref-based tick tracking for high-performance crossing detection

### File Structure
```
src/
├── components/
│   ├── BottomPanel/     # Alert log panel
│   ├── Chart/           # Core chart components
│   │   ├── CandlestickChart.tsx    # Main chart with LW Charts
│   │   ├── ChartContainer.tsx      # Chart + indicator pane layout
│   │   ├── ChartHeader.tsx         # Symbol/timeframe display
│   │   ├── ChartSyncContext.tsx     # Multi-chart time sync
│   │   ├── CrosshairLegend.tsx     # OHLCV + indicator legend
│   │   ├── DrawingOverlay.tsx      # Canvas drawing layer
│   │   ├── IndicatorPane.tsx       # Sub-chart indicator renderer
│   │   ├── MiniChart.tsx           # Multi-TF mini charts
│   │   ├── MultiTimeframeView.tsx  # 4-chart MTF layout
│   │   └── TrendlineToolbar.tsx    # Selected trendline edit bar
│   ├── RightSidebar/    # Alerts, Indicators, Settings panels
│   ├── Toolbar/         # Left drawing toolbar
│   ├── TopBar/          # Top navigation bar
│   └── KeyboardShortcuts.tsx
├── hooks/
│   ├── useAlertChecker.ts      # Alert crossing detection
│   └── useAlertPriceTracker.ts # Background price monitoring
├── lib/
│   ├── crossingDetection.ts    # Crossing math utilities
│   ├── marketData.ts           # Binance API + indicator computation
│   ├── telegram.ts             # Telegram API client
│   └── upstoxData.ts           # Upstox API client
├── stores/
│   └── chartStore.ts           # Global Zustand store
└── types/
    └── trading.ts              # TypeScript type definitions
```
