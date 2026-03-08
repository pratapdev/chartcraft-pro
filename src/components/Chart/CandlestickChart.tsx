import React, { useEffect, useRef, useCallback } from 'react';
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
import { useChartStore } from '@/stores/chartStore';
import { useChartSync } from './ChartSyncContext';
import { computeEMA, computeSMA, computeRSI, computeStochRSI, computeBollingerBands, computeVWAP, computeSupertrend } from '@/lib/marketData';
import { DrawingOverlay } from './DrawingOverlay';
import { TrendlineToolbar } from './TrendlineToolbar';
import { CrosshairLegend } from './CrosshairLegend';

export const CandlestickChart: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lineSeriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const chartSync = useChartSync();

  const { candles, indicators, loadCandles, startLiveUpdates, stopLiveUpdates } = useChartStore();

  useEffect(() => {
    loadCandles().then(() => startLiveUpdates());
    return () => stopLiveUpdates();
  }, []);

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

    // Helper to convert time to pixel, with future extrapolation
    const timeToPixelLocal = (t: number) => {
      const px = chart.timeScale().timeToCoordinate(t as unknown as Time);
      if (px !== null) return px;
      const store = useChartStore.getState();
      const c = store.candles;
      if (c.length < 2) return null;
      const lastTime = c[c.length - 1].time;
      const interval = c[c.length - 1].time - c[c.length - 2].time;
      const lastX = chart.timeScale().timeToCoordinate(lastTime as unknown as Time);
      const prevX = chart.timeScale().timeToCoordinate(c[c.length - 2].time as unknown as Time);
      if (lastX === null || prevX === null) return null;
      const pxPerBar = lastX - prevX;
      if (pxPerBar <= 0) return null;
      return lastX + ((t - lastTime) / interval) * pxPerBar;
    };

    // Subscribe to chart clicks for trendline selection
    chart.subscribeClick((param: MouseEventParams) => {
      if (!param.point) return;
      const { x, y } = param.point;
      const store = useChartStore.getState();
      if (store.activeTool !== 'cursor') return;

      const series = candleSeriesRef.current;
      if (!series) return;

      let hitId: string | null = null;
      for (let i = store.trendlines.length - 1; i >= 0; i--) {
        const line = store.trendlines[i];
        const x1 = timeToPixelLocal(line.startTime);
        const x2 = timeToPixelLocal(line.endTime);
        const y1 = series.priceToCoordinate(line.startPrice);
        const y2 = series.priceToCoordinate(line.endPrice);
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue;

        if (ptLineDist(x, y, x1, y1 as number, x2, y2 as number) < 10) {
          hitId = line.id;
          break;
        }
      }
      store.setSelectedTrendlineId(hitId);
    });

    // Subscribe to crosshair move for data legend
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!param.time || !param.seriesData) {
        useChartStore.getState().setCrosshairData(null);
        return;
      }
      const candleData = param.seriesData.get(candleSeries) as any;
      if (candleData && candleData.open !== undefined) {
        useChartStore.getState().setCrosshairData({
          time: param.time as unknown as number,
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          volume: (param.seriesData.get(volumeSeries) as any)?.value ?? 0,
        });
      } else {
        useChartStore.getState().setCrosshairData(null);
      }
    });

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    // Register with sync context
    if (chartSync) {
      chartSync.registerChart('main', chart);
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) chartSync.syncRange('main', range);
      });
    }

    return () => {
      ro.disconnect();
      if (chartSync) chartSync.unregisterChart('main');
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Update candle data
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !chartRef.current || candles.length === 0) return;

    // Preserve scroll position
    const range = chartRef.current.timeScale().getVisibleLogicalRange();

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

    // Restore scroll position if user had scrolled
    if (range) {
      chartRef.current.timeScale().setVisibleLogicalRange(range);
    }
  }, [candles]);

  // Update indicators
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    lineSeriesRefs.current.forEach((series) => {
      try { chartRef.current?.removeSeries(series); } catch {}
    });
    lineSeriesRefs.current.clear();

    for (const ind of indicators) {
      if (!ind.visible) continue;

      if (ind.type === 'EMA' || ind.type === 'SMA') {
        const data = ind.type === 'EMA' ? computeEMA(candles, ind.period) : computeSMA(candles, ind.period);
        if (data.length === 0) continue;
        const series = chartRef.current.addLineSeries({
          color: ind.color,
          lineWidth: (ind.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        series.setData(data.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        lineSeriesRefs.current.set(ind.id, series);
      }

      // RSI and StochRSI are now rendered in separate IndicatorPane components

      if (ind.type === 'BBANDS') {
        const { upper, middle, lower } = computeBollingerBands(candles, ind.period, ind.stdDev ?? 2);
        if (middle.length === 0) continue;

        const middleSeries = chartRef.current.addLineSeries({
          color: ind.color,
          lineWidth: (ind.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        middleSeries.setData(middle.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        lineSeriesRefs.current.set(ind.id + '-mid', middleSeries);

        const upperSeries = chartRef.current.addLineSeries({
          color: ind.color,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        upperSeries.setData(upper.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        lineSeriesRefs.current.set(ind.id + '-upper', upperSeries);

        const lowerSeries = chartRef.current.addLineSeries({
          color: ind.color,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        lowerSeries.setData(lower.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        lineSeriesRefs.current.set(ind.id + '-lower', lowerSeries);
      }

      if (ind.type === 'VWAP') {
        const data = computeVWAP(candles);
        if (data.length === 0) continue;
        const series = chartRef.current.addLineSeries({
          color: ind.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
        });
        series.setData(data.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        lineSeriesRefs.current.set(ind.id, series);
      }

      if (ind.type === 'SUPERTREND') {
        const { line, signals } = computeSupertrend(candles, ind.period, ind.multiplier ?? 3);
        if (line.length === 0) continue;

        // Split line into colored segments
        const greenData: (LineData | { time: Time; value: number })[] = [];
        const redData: (LineData | { time: Time; value: number })[] = [];

        for (let i = 0; i < line.length; i++) {
          const pt = { time: line[i].time as Time, value: line[i].value };
          if (line[i].color === '#22c55e') {
            greenData.push(pt);
            // Bridge: add NaN to red if previous was red
            if (i > 0 && line[i - 1].color === '#ef4444') {
              greenData.splice(greenData.length - 1, 0, { time: line[i - 1].time as Time, value: line[i - 1].value });
            }
          } else {
            redData.push(pt);
            if (i > 0 && line[i - 1].color === '#22c55e') {
              redData.splice(redData.length - 1, 0, { time: line[i - 1].time as Time, value: line[i - 1].value });
            }
          }
        }

        if (greenData.length > 0) {
          const greenSeries = chartRef.current.addLineSeries({
            color: ind.color || '#22c55e',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          greenSeries.setData(greenData as LineData[]);
          lineSeriesRefs.current.set(ind.id + '-green', greenSeries);
        }

        if (redData.length > 0) {
          const redSeries = chartRef.current.addLineSeries({
            color: ind.color2 || '#ef4444',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          redSeries.setData(redData as LineData[]);
          lineSeriesRefs.current.set(ind.id + '-red', redSeries);
        }

        // Add buy/sell markers on candle series
        if (signals.length > 0 && candleSeriesRef.current) {
          const markers = signals.map((s) => ({
            time: s.time as Time,
            position: s.direction === 'buy' ? 'belowBar' as const : 'aboveBar' as const,
            color: s.direction === 'buy' ? '#22c55e' : '#ef4444',
            shape: s.direction === 'buy' ? 'arrowUp' as const : 'arrowDown' as const,
            text: s.direction === 'buy' ? 'BUY' : 'SELL',
          }));
          candleSeriesRef.current.setMarkers(markers);
        }
      }
    }
  }, [candles, indicators]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <CrosshairLegend />
      <DrawingOverlay chartRef={chartRef} seriesRef={candleSeriesRef} />
      <TrendlineToolbar chartRef={chartRef} seriesRef={candleSeriesRef} />
    </div>
  );
};

function ptLineDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  const param = lenSq ? dot / lenSq : -1;
  let xx: number, yy: number;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  return Math.hypot(px - xx, py - yy);
}
