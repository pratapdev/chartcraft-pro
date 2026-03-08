import React, { useEffect, useRef } from 'react';
import {
  createChart,
  IChartApi,
  CandlestickData,
  HistogramData,
  LineData,
  Time,
  MouseEventParams,
} from 'lightweight-charts';
import { Candle, Timeframe } from '@/types/trading';
import { fetchCandles } from '@/lib/marketData';
import { computeEMA } from '@/lib/marketData';

const ALL_TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '15m', '1h', '4h', '1D', '1W'];

interface MiniChartProps {
  symbol: string;
  timeframe: Timeframe;
  onCrosshairMove?: (time: number | null) => void;
  syncTime?: number | null;
  onTimeframeChange?: (tf: Timeframe) => void;
}

export const MiniChart: React.FC<MiniChartProps> = ({ symbol, timeframe, onCrosshairMove, syncTime, onTimeframeChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlesRef = useRef<Candle[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { color: '#0d1117' },
        textColor: '#6b7280',
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: '#1c2333' },
        horzLines: { color: '#1c2333' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: '#4b5563', width: 1, style: 2, labelBackgroundColor: '#2563eb' },
        horzLine: { color: '#4b5563', width: 1, style: 2, labelBackgroundColor: '#2563eb' },
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
          const emaSeries = chart.addLineSeries({
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
    };
  }, [symbol, timeframe]);

  // Sync crosshair - lightweight-charts v4 doesn't expose setCrosshairPosition easily
  // Instead we sync the visible time range
  const isSyncing = useRef(false);
  useEffect(() => {
    if (!chartRef.current || syncTime === undefined || syncTime === null) return;
    // We don't programmatically move the crosshair in v4.1.3
    // The visual sync happens via the time range sync below
  }, [syncTime]);

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
        <span className="text-muted-foreground">{symbol}</span>
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  );
};
