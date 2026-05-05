import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  LineData,
  Time,
  MouseEventParams,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from 'lightweight-charts';
import { Candle, Timeframe } from '@/types/trading';
import { fetchCandles } from '@/lib/marketData';
import { computeEMA } from '@/lib/marketData';
import { useChartStore } from '@/stores/chartStore';
import { DrawingOverlay } from './DrawingOverlay';
import { TrendlineToolbar } from './TrendlineToolbar';
import { RiskRewardToolbar } from './RiskRewardToolbar';

const ALL_TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '15m', '1h', '4h', '1D', '1W'];

const CRYPTO_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD', 'ADA/USD', 'DOGE/USD', 'AVAX/USD'];

interface MiniChartProps {
  symbol: string;
  timeframe: Timeframe;
  onCrosshairMove?: (time: number | null) => void;
  syncTime?: number | null;
  onTimeframeChange?: (tf: Timeframe) => void;
  onSymbolChange?: (symbol: string) => void;
  availableSymbols?: string[];
  isActive?: boolean;
  onActivate?: () => void;
}

export const MiniChart: React.FC<MiniChartProps> = ({ symbol, timeframe, onCrosshairMove, syncTime, onTimeframeChange, onSymbolChange, availableSymbols, isActive, onActivate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const chartFontSize = useChartStore((s) => s.chartFontSize);

  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
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
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#1c2333',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Crosshair sync
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (onCrosshairMove) {
        onCrosshairMove(param.time ? (param.time as unknown as number) : null);
      }
    });

    const loadData = () => {
      fetchCandles(symbol, timeframe, 300).then((candles) => {
        candlesRef.current = candles;

        const candleData: CandlestickData[] = candles.map((c) => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        const volumeData: HistogramData[] = candles.map((c) => ({
          time: c.time as Time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
        }));

        candleSeries.setData(candleData);
        volumeSeries.setData(volumeData);

        // Add EMA 20
        const ema = computeEMA(candles, 20);
        if (ema.length > 0) {
          const emaSeries = chart.addSeries(LineSeries, {
            color: '#2962FF',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          emaSeries.setData(ema.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        }
      });
    };

    loadData();

    // Auto-refresh every 10 seconds for near-live updates
    const interval = setInterval(loadData, 10_000);

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    return () => {
      clearInterval(interval);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [symbol, timeframe]);

  return (
    <div className="flex flex-col h-full border-r border-border last:border-r-0">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border bg-card text-xs">
        {onTimeframeChange ? (
          <select
            value={timeframe}
            onChange={(e) => onTimeframeChange(e.target.value as Timeframe)}
            className="bg-accent text-foreground text-xs font-semibold rounded px-1 py-0.5 outline-none cursor-pointer border-none"
          >
            {ALL_TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        ) : (
          <span className="font-semibold text-foreground">{timeframe}</span>
        )}
        {onSymbolChange ? (
          <select
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            className="bg-accent text-muted-foreground text-[10px] rounded px-1 py-0.5 outline-none cursor-pointer border-none max-w-[90px]"
          >
            {(availableSymbols || CRYPTO_SYMBOLS).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : (
          <span className="text-muted-foreground">{symbol}</span>
        )}
      </div>
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="w-full h-full" />
        <DrawingOverlay chartRef={chartRef} seriesRef={candleSeriesRef} />
        <TrendlineToolbar chartRef={chartRef} seriesRef={candleSeriesRef} />
      </div>
    </div>
  );
};
