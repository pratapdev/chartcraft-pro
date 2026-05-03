# Trading Chart App — Replit pnpm Workspace

## Overview

Professional-grade trading chart application migrated from Lovable to Replit pnpm monorepo stack. Features real-time candlestick charts, technical indicators, drawing tools, alerts, and server-side sync via PostgreSQL.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/trading-chart), port 21852
- **API framework**: Express 5 (artifacts/api-server), port 8080
- **Database**: PostgreSQL + Drizzle ORM (lib/db)
- **Chart library**: lightweight-charts v5
- **State management**: Zustand (with localStorage persist)
- **Styling**: Tailwind CSS v3 + PostCSS

## Artifacts

### Trading Chart (artifacts/trading-chart)
- previewPath: `/`
- React + Vite frontend
- Key libraries: `lightweight-charts@5`, `react-router-dom`, `zustand`, `react-resizable-panels`, `sonner`

### API Server (artifacts/api-server)
- previewPath: `/api`
- Express 5 + Drizzle ORM
- Routes:
  - `GET /api/healthz` — health check
  - `GET /api/sync/state` — pull full chart state from PostgreSQL
  - `PUT /api/sync/state` — push full chart state to PostgreSQL

## Database Schema (lib/db/src/schema/tradingChart.ts)

- `chart_state` — symbol, timeframe, marketType, chartFontSize, drawingDefaults
- `trendlines` — price trendlines with coordinates
- `chart_alerts` — price-level alerts
- `chart_alert_logs` — triggered alert history
- `chart_indicators` — indicator configs (EMA, SMA, RSI, MACD, etc.)
- `fibonacci_drawings` — Fibonacci retracement drawings
- `indicator_cross_alerts` — EMA/SMA crossover alerts
- `indicator_threshold_alerts` — RSI/ADX threshold alerts
- `stoch_rsi_cross_alerts` — StochRSI K/D crossover alerts

## Key Commands

- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/api-server run build` — build API server
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/trading-chart run dev` — run frontend locally

## Features

- Real-time candlestick charts via Binance WebSocket (crypto) / Upstox REST (Indian stocks)
- Technical indicators: EMA, SMA, RSI, StochRSI, MACD, Bollinger Bands, VWAP, Supertrend, ADX, ATR, OBV, Pivot HL, % Diff Donchian, MSB & Order Blocks, VPVR, Imbalance Detection
- Drawing tools: Trendlines, Fibonacci retracements, Risk/Reward boxes, Horizontal lines, Alert lines
- Alerts: Price-level, indicator crossover, RSI/ADX threshold, StochRSI K/D cross
- Telegram notifications (calls Telegram API directly from browser)
- Server sync: Push/pull full chart state to PostgreSQL via `/api/sync/*`
- Multi-timeframe view, watchlist, heatmap
- Compound alerts and alert templates
- HTF (Higher Timeframe) candle overlay

## Migration Notes

- Original: Lovable-generated React app with an optional Node.js+SQLite+Telegram bot backend
- Migrated to: Replit pnpm workspace with Drizzle+PostgreSQL backend
- lightweight-charts was upgraded from v4 to v5 during migration:
  - `chart.addCandlestickSeries()` → `chart.addSeries(CandlestickSeries, ...)`
  - `chart.addLineSeries()` → `chart.addSeries(LineSeries, ...)`
  - `chart.addHistogramSeries()` → `chart.addSeries(HistogramSeries, ...)`
  - `series.setMarkers()` → `createSeriesMarkers(series, markers)`
- syncService.ts: Replaced hardcoded `localhost:3001` with relative `/api` paths
- CSS: `@import` must precede `@tailwind` directives in index.css
