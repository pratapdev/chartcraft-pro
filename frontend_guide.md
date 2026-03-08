# Frontend Guide — Trading Chart Platform

## Overview

A real-time cryptocurrency trading chart platform built with React, TypeScript, and Vite. Features interactive candlestick charts, technical indicators (EMA, SMA), drawing tools, multi-timeframe views, and a powerful price alert system with audio notifications.

## Tech Stack

| Technology | Purpose |
|---|---|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool & dev server |
| Tailwind CSS | Utility-first styling |
| shadcn/ui | Pre-built UI components |
| Zustand | State management (chart store) |
| Lightweight Charts | TradingView-style candlestick charts |
| Recharts | Additional charting (indicators) |
| React Router | Client-side routing |
| React Query | Data fetching & caching |
| Framer Motion | Animations |

## Prerequisites

- **Node.js** v18 or higher
- **npm** or **bun** package manager

## Installation & Running

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd <project-root>

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

The app will be available at `http://localhost:5173` (default Vite port).

## Build for Production

```bash
npm run build
npm run preview   # Preview the production build locally
```

## Project Structure

```
src/
├── App.tsx                    # Root component with routing
├── main.tsx                   # Entry point
├── index.css                  # Global styles & design tokens
├── components/
│   ├── Chart/
│   │   ├── CandlestickChart.tsx   # Main chart with lightweight-charts
│   │   ├── ChartContainer.tsx     # Chart wrapper & layout
│   │   ├── ChartHeader.tsx        # Symbol, timeframe selectors
│   │   ├── ChartSyncContext.tsx   # Cross-chart synchronization
│   │   ├── CrosshairLegend.tsx    # OHLCV data on hover
│   │   ├── DrawingOverlay.tsx     # Trendline & drawing tools
│   │   ├── IndicatorPane.tsx      # Sub-chart for indicators
│   │   ├── MiniChart.tsx          # Small preview charts
│   │   ├── MultiTimeframeView.tsx # Side-by-side timeframes
│   │   └── TrendlineToolbar.tsx   # Drawing tool controls
│   ├── TopBar/TopBar.tsx          # Top navigation bar
│   ├── Toolbar/LeftToolbar.tsx    # Left-side tool panel
│   ├── RightSidebar/RightSidebar.tsx  # Alerts, watchlist panel
│   ├── BottomPanel/BottomPanel.tsx    # Logs, info panel
│   ├── KeyboardShortcuts.tsx      # Global hotkey handler
│   └── ui/                       # shadcn/ui components
├── hooks/
│   ├── useAlertChecker.ts         # Real-time alert detection
│   ├── useAlertPriceTracker.ts    # Price tracking for alerts
│   ├── use-mobile.tsx             # Mobile detection
│   └── use-toast.ts              # Toast notifications
├── stores/
│   └── chartStore.ts              # Zustand store for chart state
├── lib/
│   ├── marketData.ts              # Market data fetching
│   ├── upstoxData.ts              # Upstox API integration
│   ├── crossingDetection.ts       # Price crossing logic
│   ├── telegram.ts                # Telegram integration helpers
│   └── utils.ts                   # Utility functions
├── types/
│   └── trading.ts                 # TypeScript type definitions
└── pages/
    ├── Index.tsx                  # Main trading page
    └── NotFound.tsx               # 404 page
```

## Key Features

### 1. Candlestick Charts
- Real-time price data via Binance WebSocket
- Multiple timeframes: 1m, 3m, 5m, 15m, 1h, 4h, 1D, 1W
- Crosshair with OHLCV data overlay

### 2. Technical Indicators
- **EMA** (Exponential Moving Average) — rendered on main chart
- **SMA** (Simple Moving Average) — rendered on main chart
- Modular system for adding RSI, MACD in sub-panels

### 3. Drawing Tools
- Trendlines, horizontal lines
- Drawing overlay with click-to-place interaction
- Toolbar for tool selection

### 4. Price Alerts (Browser)
- Set alerts with conditions: Crossing Up, Crossing Down, Any Crossing
- Real-time tick-by-tick detection (not just candle close)
- Audio notifications via Web Audio API (rising/falling/oscillating tones)
- User-gesture audio unlock for browser compatibility

### 5. Multi-Timeframe View
- Side-by-side charts at different timeframes
- Synchronized crosshair across charts

### 6. Keyboard Shortcuts
- Global hotkeys for quick navigation and actions

## Configuration

### Market Data Source
The app connects to Binance WebSocket for real-time crypto data. No API key is needed for public market data.

Configure the data source in `src/lib/marketData.ts`.

### Backend Server Connection
If running the local backend server (see `backend_guide.md`), the frontend can sync alerts with it. The server runs on `http://localhost:3001` by default.

## Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

## Environment

No `.env` file is needed. All public API endpoints (Binance) require no authentication. If connecting to the backend server, the API URL defaults to `http://localhost:3001`.

## Linting

```bash
npm run lint
```
