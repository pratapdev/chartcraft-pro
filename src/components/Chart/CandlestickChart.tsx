import React, { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  LineData,
  Time,
} from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { computeEMA, computeSMA } from '@/lib/marketData';
import { DrawingOverlay } from './DrawingOverlay';

export const CandlestickChart: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lineSeriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());

  const { candles, indicators, loadCandles, startLiveUpdates, stopLiveUpdates } = useChartStore();

  // Load data and start live feed
  useEffect(() => {
    loadCandles().then(() => startLiveUpdates());
    return () => stopLiveUpdates();
  }, []);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      lineSeriesRefs.current.clear();
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { color: '#0d1117' },
        textColor: '#6b7280',
        fontSize: 11,
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
        scaleMargins: { top: 0.1, bottom: 0.25 },
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
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

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
  }, []);

  // Update candle data
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

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

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
  }, [candles]);

  // Update indicators
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    lineSeriesRefs.current.forEach((series) => {
      try {
        chartRef.current?.removeSeries(series);
      } catch {}
    });
    lineSeriesRefs.current.clear();

    for (const ind of indicators) {
      if (!ind.visible) continue;

      let data: { time: number; value: number }[] = [];
      if (ind.type === 'EMA') data = computeEMA(candles, ind.period);
      if (ind.type === 'SMA') data = computeSMA(candles, ind.period);
      if (data.length === 0) continue;

      const series = chartRef.current.addLineSeries({
        color: ind.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      series.setData(
        data.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]
      );
      lineSeriesRefs.current.set(ind.id, series);
    }
  }, [candles, indicators]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <DrawingOverlay chartRef={chartRef} seriesRef={candleSeriesRef} />
    </div>
  );
};
