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
import { useChartStore } from '@/stores/chartStore';
import { useChartSync } from './ChartSyncContext';
import { useIndicatorRenderer } from './useIndicatorRenderer';
import { DrawingOverlay } from './DrawingOverlay';
import { TrendlineToolbar } from './TrendlineToolbar';
import { CrosshairLegend } from './CrosshairLegend';

export const CandlestickChart: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const chartSync = useChartSync();
  const hasDragged = useRef(false);
  const initialRangeRef = useRef<{ from: number; to: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const { candles, indicators, chartFontSize, timezone, loadCandles, startLiveUpdates, stopLiveUpdates } = useChartStore();

  const { clearLineSeries } = useIndicatorRenderer(chartRef, candleSeriesRef, candles, indicators);

  useEffect(() => {
    loadCandles().then(() => startLiveUpdates());
    return () => stopLiveUpdates();
  }, []);

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
        fontSize: chartFontSize,
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
        rightOffset: 50,
        shiftVisibleRangeOnNewBar: false,
        tickMarkFormatter: (time: number, tickMarkType: number) => {
          const tz = useChartStore.getState().timezone;
          const tzId = tz === 'Exchange' ? 'UTC' : tz;
          const d = new Date(time * 1000);
          // tickMarkType: 0=Year, 1=Month, 2=DayOfMonth, 3=Time, 4=TimeWithSeconds
          if (tickMarkType <= 2) {
            return d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: tzId });
          }
          // Check if this is the first bar of a new day (00:00)
          const hours = parseInt(d.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: tzId }));
          const minutes = parseInt(d.toLocaleString('en-US', { minute: '2-digit', timeZone: tzId }));
          if (hours === 0 && minutes === 0) {
            return d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: tzId });
          }
          return d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tzId });
        },
      },
      localization: {
        timeFormatter: (time: number) => {
          const tz = useChartStore.getState().timezone;
          const tzId = tz === 'Exchange' ? 'UTC' : tz;
          const d = new Date(time * 1000);
          return d.toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tzId,
          });
        },
      },
      handleScroll: { vertTouchDrag: false },
    });

    // Track user drag to enable "Reset Chart"
    let mouseDownOnChart = false;
    const onMouseDown = () => { mouseDownOnChart = true; };
    const onMouseUp = () => {
      if (mouseDownOnChart) {
        hasDragged.current = true;
        mouseDownOnChart = false;
      }
    };
    containerRef.current.addEventListener('mousedown', onMouseDown);
    containerRef.current.addEventListener('mouseup', onMouseUp);

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

    const containerEl = containerRef.current;
    return () => {
      ro.disconnect();
      if (chartSync) chartSync.unregisterChart('main');
      containerEl?.removeEventListener('mousedown', onMouseDown);
      containerEl?.removeEventListener('mouseup', onMouseUp);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [timezone]);

  // Update font size and timezone reactively
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({ layout: { fontSize: chartFontSize } });
  }, [chartFontSize]);

  // Force re-render tick marks when timezone changes
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;
    const candleData = candles.map((c) => ({
      time: c.time as Time,
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    const volumeData = candles.map((c) => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
    }));
    candleSeriesRef.current.setData(candleData as CandlestickData[]);
    volumeSeriesRef.current.setData(volumeData as HistogramData[]);
  }, [timezone]);

  // Update candle data
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !chartRef.current || candles.length === 0) return;

    const timeScale = chartRef.current.timeScale();
    const prevRange = timeScale.getVisibleLogicalRange();
    // With rightOffset=50, scrollPosition near 0 means we're at the latest data
    const scrollPos = timeScale.scrollPosition();
    const wasNearRealtime = scrollPos >= -2;

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

    // Keep user position if they are reviewing history, otherwise stay at latest candle
    if (wasNearRealtime) {
      // Use requestAnimationFrame to avoid mid-render jumps
      requestAnimationFrame(() => {
        try { timeScale.scrollToRealTime(); } catch {}
      });
    } else if (prevRange) {
      requestAnimationFrame(() => {
        try { timeScale.setVisibleLogicalRange(prevRange); } catch {}
      });
    }

    // Store initial range on first load
    if (!initialRangeRef.current) {
      const r = timeScale.getVisibleLogicalRange();
      if (r) initialRangeRef.current = { from: r.from, to: r.to };
    }
  }, [candles]);

  const resetChart = useCallback(() => {
    if (!chartRef.current) return;
    const ts = chartRef.current.timeScale();
    if (initialRangeRef.current) {
      ts.setVisibleLogicalRange(initialRangeRef.current);
    } else {
      ts.scrollToRealTime();
    }
    hasDragged.current = false;
    setContextMenu(null);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);


  return (
    <div className="relative w-full h-full" onContextMenu={handleContextMenu} onClick={() => setContextMenu(null)}>
      <div ref={containerRef} className="w-full h-full" />
      <CrosshairLegend />
      <DrawingOverlay chartRef={chartRef} seriesRef={candleSeriesRef} />
      <TrendlineToolbar chartRef={chartRef} seriesRef={candleSeriesRef} />
      {contextMenu && (
        <div
          className="fixed z-[100] min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
            disabled={!hasDragged.current}
            onClick={resetChart}
          >
            Reset Chart
          </button>
          <button
            className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => {
              chartRef.current?.timeScale().scrollToRealTime();
              setContextMenu(null);
            }}
          >
            Go to Latest
          </button>
        </div>
      )}
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
