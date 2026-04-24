import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  LineData,
  Time,
  MouseEventParams,
} from 'lightweight-charts';
import { useMultiPanelStore } from '@/stores/multiPanelStore';
import { usePanelIndexRequired } from './PanelContext';
import { useIndicatorRenderer } from './useIndicatorRenderer';
import { PanelDrawingOverlay } from './PanelDrawingOverlay';
import { PanelIndicatorPane } from './PanelIndicatorPane';
import { PanelVPVROverlay } from './PanelVPVROverlay';
import { PanelTPOOverlay } from './PanelTPOOverlay';
import { PanelVCFOverlay } from './PanelVCFOverlay';
import { PanelTrendlineToolbar } from './PanelTrendlineToolbar';
import { PanelRiskRewardToolbar } from './PanelRiskRewardToolbar';
import { PanelDOM } from './PanelDOM';
import { Timeframe } from '@/types/trading';
import { useChartStore } from '@/stores/chartStore';
import { fetchCandles, subscribeToCandles } from '@/lib/marketData';
import {
  BarChart3,
  Activity,
  Zap,
  ListTree,
} from 'lucide-react';

const ALL_TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '15m', '1h', '4h', '1D', '1W'];
const CRYPTO_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD', 'ADA/USD', 'DOGE/USD', 'AVAX/USD'];
const SUB_CHART_TYPES = new Set(['RSI', 'STOCH_RSI', 'MACD', 'ADX', 'ATR', 'OBV', 'PCT_DIFF_DON']);

function dedupeAndSort(candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[]) {
  const map = new Map<number, (typeof candles)[0]>();
  for (const c of candles) map.set(c.time, c);
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

export const PanelChart: React.FC = () => {
  const panelIndex = usePanelIndexRequired();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const panel = useMultiPanelStore((s) => s.panels[panelIndex]);
  const activePanelIndex = useMultiPanelStore((s) => s.activePanelIndex);
  const setActivePanelIndex = useMultiPanelStore((s) => s.setActivePanelIndex);
  const setPanelSymbol = useMultiPanelStore((s) => s.setPanelSymbol);
  const setPanelTimeframe = useMultiPanelStore((s) => s.setPanelTimeframe);
  const setPanelCandles = useMultiPanelStore((s) => s.setPanelCandles);
  const updatePanelLastCandle = useMultiPanelStore((s) => s.updatePanelLastCandle);
  const setPanelCrosshairData = useMultiPanelStore((s) => s.setPanelCrosshairData);
  const addPanelIndicator = useMultiPanelStore((s) => s.addPanelIndicator);
  const setSyncCrosshairTime = useMultiPanelStore((s) => s.setSyncCrosshairTime);
  const setPanelMode = useMultiPanelStore((s) => s.setPanelMode);
  
  const chartFontSize = useChartStore((s) => s.chartFontSize);
  const isActive = activePanelIndex === panelIndex;

  const candles = panel?.candles ?? [];
  const indicators = panel?.indicators ?? [];
  const symbol = panel?.symbol ?? 'BTC/USD';
  const timeframe = panel?.timeframe ?? '1h';
  const mode = panel?.mode ?? 'chart';

  // Overlay indicators (EMA, SMA, BBands, etc.) — reuse the existing hook!
  const { clearLineSeries } = useIndicatorRenderer(chartRef, candleSeriesRef, candles, indicators);

  // Sub-chart indicators
  const subIndicators = indicators.filter((i) => i.visible && SUB_CHART_TYPES.has(i.type));

  // ─── Load data + WebSocket subscription ─────────────────────────

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      const data = await fetchCandles(symbol, timeframe, 300);
      if (!cancelled) {
        setPanelCandles(panelIndex, data);
      }
    };

    loadData();

    // Subscribe to live updates
    const unsub = subscribeToCandles(symbol, timeframe, (candle) => {
      if (!cancelled) {
        updatePanelLastCandle(panelIndex, candle);
      }
    });
    unsubRef.current = unsub;

    return () => {
      cancelled = true;
      unsub();
      unsubRef.current = null;
    };
  }, [symbol, timeframe, panelIndex]);

  // ─── Chart initialization ───────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      clearLineSeries();
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { color: '#0d1117' },
        textColor: '#6b7280',
        fontSize: chartFontSize - 1,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: '#1c2333' },
        horzLines: { color: '#1c2333' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: '#ffffff', width: 1, style: 3, labelBackgroundColor: '#2563eb' },
        horzLine: { color: '#ffffff', width: 1, style: 3, labelBackgroundColor: '#2563eb' },
      },
      rightPriceScale: {
        borderColor: '#1c2333',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#1c2333',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 20,
        shiftVisibleRangeOnNewBar: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    });

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Crosshair → legend + sync
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!param.time || !param.seriesData) {
        setPanelCrosshairData(panelIndex, null);
        return;
      }
      const cd = param.seriesData.get(candleSeries) as any;
      if (cd && cd.open !== undefined) {
        setPanelCrosshairData(panelIndex, {
          time: param.time as unknown as number,
          open: cd.open,
          high: cd.high,
          low: cd.low,
          close: cd.close,
          volume: (param.seriesData.get(volumeSeries) as any)?.value ?? 0,
        });
      } else {
        setPanelCrosshairData(panelIndex, null);
      }
      setSyncCrosshairTime(param.time ? (param.time as unknown as number) : null);
    });

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [chartFontSize]);

  // ─── Update candle data ─────────────────────────────────────────

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !chartRef.current || candles.length === 0) return;

    const timeScale = chartRef.current.timeScale();
    const prevRange = timeScale.getVisibleLogicalRange();

    const sorted = dedupeAndSort(candles);
    const candleData: CandlestickData[] = sorted.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const volumeData: HistogramData[] = sorted.map((c) => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    if (prevRange) {
      try { timeScale.setVisibleLogicalRange(prevRange); } catch {}
    }
  }, [candles]);

  // ─── Click to activate panel ────────────────────────────────────

  const handleFocus = useCallback(() => {
    if (!isActive) setActivePanelIndex(panelIndex);
  }, [isActive, panelIndex]);

  // ─── Quick indicator add ────────────────────────────────────────

  const handleToggleIndicator = useCallback((type: string) => {
    const existing = indicators.find((i) => i.type === type);
    if (!existing) {
      const configs: Record<string, any> = {
        RSI: { type: 'RSI', period: 14, color: '#7C3AED' },
        MACD: { type: 'MACD', period: 12, color: '#2196F3' },
        BBANDS: { type: 'BBANDS', period: 20, color: '#2196F3', stdDev: 2, color2: 'rgba(33,150,243,0.08)' },
        STOCH_RSI: { type: 'STOCH_RSI', period: 14, color: '#7C3AED', color2: '#FF5722', kPeriod: 3, dPeriod: 3 },
        SUPERTREND: { type: 'SUPERTREND', period: 10, color: '#22c55e', color2: '#ef4444', multiplier: 3 },
        VWAP: { type: 'VWAP', period: 1, color: '#FF9800' },
        ADX: { type: 'ADX', period: 14, color: '#00BCD4' },
        ATR: { type: 'ATR', period: 14, color: '#FF5722' },
        OBV: { type: 'OBV', period: 1, color: '#4CAF50' },
      };
      const config = configs[type];
      if (config) {
        addPanelIndicator(panelIndex, {
          id: `panel-${type.toLowerCase()}-${panelIndex}-${Date.now()}`,
          visible: true,
          ...config,
        });
      }
    }
  }, [indicators, panelIndex]);

  // ─── Crosshair legend ───────────────────────────────────────────

  const crosshairData = panel?.crosshairData;

  return (
    <div
      className={`flex flex-col h-full overflow-hidden border border-transparent transition-colors ${
        isActive ? 'border-blue-500/60' : 'hover:border-border/60'
      }`}
      onMouseDown={handleFocus}
    >
      {/* Panel header */}
      <div className="flex items-center gap-1 px-1.5 py-0.5 border-b border-border bg-card text-xs shrink-0">
        {/* Panel badge */}
        <span
          className={`text-[9px] font-bold px-1 py-0.5 rounded ${
            isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-muted text-muted-foreground'
          }`}
        >
          {panelIndex + 1}
        </span>

        {/* Timeframe selector */}
        <select
          value={timeframe}
          onChange={(e) => setPanelTimeframe(panelIndex, e.target.value as Timeframe)}
          className="bg-accent text-foreground text-xs font-semibold rounded px-1 py-0.5 outline-none cursor-pointer border-none"
        >
          {ALL_TIMEFRAMES.map((tf) => (
            <option key={tf} value={tf}>{tf}</option>
          ))}
        </select>

        {/* Symbol selector */}
        <select
          value={symbol}
          onChange={(e) => setPanelSymbol(panelIndex, e.target.value)}
          className="bg-accent text-muted-foreground text-[10px] rounded px-1 py-0.5 outline-none cursor-pointer border-none max-w-[80px]"
        >
          {CRYPTO_SYMBOLS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Quick indicator buttons */}
        <div className="flex items-center gap-0.5 ml-auto">
          <button
            onClick={() => handleToggleIndicator('RSI')}
            className={`text-[9px] px-1 py-0.5 rounded transition-colors ${
              indicators.some((i) => i.type === 'RSI' && i.visible)
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title="RSI"
          >
            RSI
          </button>
          <button
            onClick={() => handleToggleIndicator('MACD')}
            className={`text-[9px] px-1 py-0.5 rounded transition-colors ${
              indicators.some((i) => i.type === 'MACD' && i.visible)
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title="MACD"
          >
            MACD
          </button>
          <button
            onClick={() => handleToggleIndicator('BBANDS')}
            className={`text-[9px] px-1 py-0.5 rounded transition-colors ${
              indicators.some((i) => i.type === 'BBANDS' && i.visible)
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title="Bollinger Bands"
          >
            <Activity size={10} />
          </button>
          <button
            onClick={() => handleToggleIndicator('SUPERTREND')}
            className={`text-[9px] px-1 py-0.5 rounded transition-colors ${
              indicators.some((i) => i.type === 'SUPERTREND' && i.visible)
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title="Supertrend"
          >
            <Zap size={10} />
          </button>
          
          <div className="w-px h-3 bg-border mx-1" />
          
          <button
            onClick={() => setPanelMode(panelIndex, mode === 'chart' ? 'dom' : 'chart')}
            className={`text-[9px] px-1 py-0.5 rounded transition-colors flex items-center gap-1 ${
              mode === 'dom'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title="Toggle DOM Ladder"
          >
            <ListTree size={10} />
            <span className="sr-only">DOM</span>
          </button>
        </div>

        {/* OHLCV legend */}
        {crosshairData && (
          <div className="flex items-center gap-1 ml-1 text-[9px] font-mono">
            <span className="text-muted-foreground">O</span>
            <span className={crosshairData.close >= crosshairData.open ? 'text-green-400' : 'text-red-400'}>
              {crosshairData.open.toFixed(2)}
            </span>
            <span className="text-muted-foreground">H</span>
            <span className={crosshairData.close >= crosshairData.open ? 'text-green-400' : 'text-red-400'}>
              {crosshairData.high.toFixed(2)}
            </span>
            <span className="text-muted-foreground">L</span>
            <span className={crosshairData.close >= crosshairData.open ? 'text-green-400' : 'text-red-400'}>
              {crosshairData.low.toFixed(2)}
            </span>
            <span className="text-muted-foreground">C</span>
            <span className={crosshairData.close >= crosshairData.open ? 'text-green-400' : 'text-red-400'}>
              {crosshairData.close.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {mode === 'dom' ? (
        <div className="flex-1 overflow-hidden">
          <PanelDOM panelIndex={panelIndex} />
        </div>
      ) : (
        <>
          {/* Main chart area — flex-1 with min-h-[80px] so it always shrinks to make room for indicator panes */}
          <div className="flex-1 relative min-h-[80px]">
            <div ref={containerRef} className="w-full h-full" />
            <PanelDrawingOverlay chartRef={chartRef} seriesRef={candleSeriesRef} panelIndex={panelIndex} />
            <PanelVPVROverlay chartRef={chartRef} seriesRef={candleSeriesRef} panelIndex={panelIndex} />
            <PanelTPOOverlay chartRef={chartRef} seriesRef={candleSeriesRef} panelIndex={panelIndex} />
            <PanelVCFOverlay panelIndex={panelIndex} chartRef={chartRef} seriesRef={candleSeriesRef} />
            <PanelTrendlineToolbar chartRef={chartRef} seriesRef={candleSeriesRef} panelIndex={panelIndex} />
            <PanelRiskRewardToolbar chartRef={chartRef} seriesRef={candleSeriesRef} panelIndex={panelIndex} />
          </div>

          {/* Sub-chart indicator panes — each shrinkable, max 30% height of panel */}
          {subIndicators.map((ind) => (
            <PanelIndicatorPane key={ind.id} indicator={ind} panelIndex={panelIndex} subCount={subIndicators.length} />
          ))}
        </>
      )}
    </div>
  );
};
