import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  HistogramData,
  Time,
  LogicalRange,
  LineSeries,
  HistogramSeries,
} from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { IndicatorConfig, LineStyleType } from '@/types/trading';
import { computeRSI, computeStochRSI, computeMACD, computeADX, computeATR, computeOBV, computePctDiffDonchian } from '@/lib/marketData';
import { useChartSync } from './ChartSyncContext';
import { X } from 'lucide-react';

const toLWLineStyle = (s?: LineStyleType) => s === 'dashed' ? 2 : s === 'dotted' ? 1 : 0;

interface IndicatorPaneProps {
  indicator: IndicatorConfig;
}

export const IndicatorPane: React.FC<IndicatorPaneProps> = ({ indicator }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<ISeriesApi<'Line' | 'Histogram'>[]>([]);
  const { candles, removeIndicator, chartFontSize } = useChartStore();
  const chartId = `indicator-${indicator.id}`;
  const chartSync = useChartSync();
  const lastMainRangeRef = useRef<LogicalRange | null>(null);
  const pendingRangeRef = useRef<LogicalRange | null>(null);

  // Helper: apply the main chart's current logical range to this pane
  const applyMainRange = useCallback(() => {
    if (!chartRef.current || !chartSync) return;
    const range = chartSync.getMainLogicalRange() ?? lastMainRangeRef.current;
    if (!range) return;
    lastMainRangeRef.current = range;
    try {
      chartRef.current.timeScale().setVisibleLogicalRange(range);
    } catch {}
  }, [chartSync]);

  // --- Chart creation / destruction ---
  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      if (chartSync) chartSync.unregisterChart(chartId);
      chartRef.current.remove();
      chartRef.current = null;
      seriesRefs.current = [];
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
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#1c2333',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 50,
        shiftVisibleRangeOnNewBar: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    const series: ISeriesApi<'Line' | 'Histogram'>[] = [];

    if (indicator.type === 'RSI') {
      series.push(chart.addSeries(LineSeries, { color: indicator.color, lineWidth: (indicator.lineWidth ?? 1) as 1|2|3|4, lineStyle: toLWLineStyle(indicator.lineStyle), priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true }));
      series.push(chart.addSeries(LineSeries, { color: 'rgba(239,68,68,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
      series.push(chart.addSeries(LineSeries, { color: 'rgba(34,197,94,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
    }

    if (indicator.type === 'STOCH_RSI') {
      series.push(chart.addSeries(LineSeries, { color: indicator.color, lineWidth: (indicator.lineWidth ?? 1) as 1|2|3|4, lineStyle: toLWLineStyle(indicator.lineStyle), priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true }));
      series.push(chart.addSeries(LineSeries, { color: indicator.color2 ?? '#FF5722', lineWidth: (indicator.lineWidth ?? 1) as 1|2|3|4, lineStyle: toLWLineStyle(indicator.lineStyle), priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false }));
      series.push(chart.addSeries(LineSeries, { color: 'rgba(239,68,68,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
      series.push(chart.addSeries(LineSeries, { color: 'rgba(34,197,94,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
    }

    if (indicator.type === 'MACD') {
      series.push(chart.addSeries(LineSeries, { color: indicator.color, lineWidth: (indicator.lineWidth ?? 1) as 1|2|3|4, lineStyle: toLWLineStyle(indicator.lineStyle), priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true }));
      series.push(chart.addSeries(LineSeries, { color: indicator.color2 ?? '#FF5722', lineWidth: (indicator.lineWidth ?? 1) as 1|2|3|4, lineStyle: toLWLineStyle(indicator.lineStyle), priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false }));
      const hist = chart.addSeries(HistogramSeries, { priceFormat: { type: 'price', precision: 2, minMove: 0.01 }, priceScaleId: '' });
      hist.priceScale().applyOptions({ scaleMargins: { top: 0.0, bottom: 0.0 } });
      series.push(hist);
      series.push(chart.addSeries(LineSeries, { color: 'rgba(107,114,128,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
    }

    if (indicator.type === 'ADX') {
      series.push(chart.addSeries(LineSeries, { color: indicator.color, lineWidth: (indicator.lineWidth ?? 2) as 1|2|3|4, lineStyle: toLWLineStyle(indicator.lineStyle), priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true }));
      series.push(chart.addSeries(LineSeries, { color: '#22c55e', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
      series.push(chart.addSeries(LineSeries, { color: '#ef4444', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
      series.push(chart.addSeries(LineSeries, { color: 'rgba(107,114,128,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
      series.push(chart.addSeries(LineSeries, { color: 'rgba(107,114,128,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
    }

    if (indicator.type === 'ATR') {
      series.push(chart.addSeries(LineSeries, { color: indicator.color, lineWidth: (indicator.lineWidth ?? 1) as 1|2|3|4, lineStyle: toLWLineStyle(indicator.lineStyle), priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true }));
    }

    if (indicator.type === 'OBV') {
      series.push(chart.addSeries(LineSeries, { color: indicator.color, lineWidth: (indicator.lineWidth ?? 1) as 1|2|3|4, lineStyle: toLWLineStyle(indicator.lineStyle), priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true }));
      series.push(chart.addSeries(LineSeries, { color: 'rgba(107,114,128,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
    }

    if (indicator.type === 'PCT_DIFF_DON') {
      series.push(chart.addSeries(LineSeries, { color: indicator.color, lineWidth: 2 as 1|2|3|4, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true }));
      series.push(chart.addSeries(LineSeries, { color: '#ffffff', lineWidth: 2 as 1|2|3|4, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
      series.push(chart.addSeries(LineSeries, { color: '#FF6D00', lineWidth: 1 as 1|2|3|4, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
      series.push(chart.addSeries(LineSeries, { color: 'rgba(255,255,255,0.4)', lineWidth: 1 as 1|2|3|4, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
      series.push(chart.addSeries(LineSeries, { color: 'rgba(255,255,255,0.4)', lineWidth: 1 as 1|2|3|4, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
      series.push(chart.addSeries(LineSeries, { color: 'rgba(255,255,255,0.2)', lineWidth: 1 as 1|2|3|4, lineStyle: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
      series.push(chart.addSeries(LineSeries, { color: 'rgba(255,255,255,0.2)', lineWidth: 1 as 1|2|3|4, lineStyle: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
      series.push(chart.addSeries(LineSeries, { color: 'rgba(107,114,128,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
    }

    seriesRefs.current = series;

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    if (chartSync) {
      // Register so syncRange can push the main chart's range here
      chartSync.registerChart(chartId, chart);

      // When the main chart pans/zooms, mirror it here (FIX #1 & #2: now actually fires, uses logical range)
      const unsubscribeMain = chartSync.subscribeMainRange((range: LogicalRange) => {
        lastMainRangeRef.current = range;
        pendingRangeRef.current = range;
        if (seriesRefs.current.length > 0) {
          try { chart.timeScale().setVisibleLogicalRange(range); } catch {}
          pendingRangeRef.current = null;
        }
      });

      const onPaneRange = (range: LogicalRange | null) => {
        if (!range) return;
        lastMainRangeRef.current = range;
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(onPaneRange);

      return () => {
        ro.disconnect();
        unsubscribeMain();
        try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(onPaneRange); } catch {}
        chartSync.unregisterChart(chartId);
        chart.remove();
        chartRef.current = null;
        seriesRefs.current = [];
      };
    }

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRefs.current = [];
    };
  }, [indicator.type, indicator.id, indicator.color, indicator.color2, indicator.lineWidth, indicator.lineStyle, chartFontSize]);

  // --- Data loading ---
  // FIX #3: after setData (which resets the view to fit-all), re-apply the main range
  useEffect(() => {
    if (!chartRef.current || seriesRefs.current.length === 0 || candles.length === 0) return;

    const toLD = (d: { time: number; value: number }) => ({ time: d.time as Time, value: d.value });

    if (indicator.type === 'RSI') {
      const data = computeRSI(candles, indicator.period);
      if (data.length > 0 && seriesRefs.current[0]) {
        seriesRefs.current[0].setData(data.map(toLD) as LineData[]);
        seriesRefs.current[1]?.setData(data.map((d) => ({ time: d.time as Time, value: 70 })) as LineData[]);
        seriesRefs.current[2]?.setData(data.map((d) => ({ time: d.time as Time, value: 30 })) as LineData[]);
      }
    }

    if (indicator.type === 'STOCH_RSI') {
      const { k, d } = computeStochRSI(candles, indicator.period, indicator.period, indicator.kPeriod ?? 3, indicator.dPeriod ?? 3);
      if (k.length > 0) {
        seriesRefs.current[0]?.setData(k.map(toLD) as LineData[]);
        seriesRefs.current[1]?.setData(d.map(toLD) as LineData[]);
        seriesRefs.current[2]?.setData(k.map((pt) => ({ time: pt.time as Time, value: 80 })) as LineData[]);
        seriesRefs.current[3]?.setData(k.map((pt) => ({ time: pt.time as Time, value: 20 })) as LineData[]);
      }
    }

    if (indicator.type === 'MACD') {
      const { macdLine, signalLine, histogram } = computeMACD(candles, 12, 26, 9);
      if (macdLine.length > 0) {
        seriesRefs.current[0]?.setData(macdLine.map(toLD) as LineData[]);
        seriesRefs.current[1]?.setData(signalLine.map(toLD) as LineData[]);
        seriesRefs.current[2]?.setData(histogram.map((d) => ({
          time: d.time as Time, value: d.value,
          color: d.value >= 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)',
        })) as HistogramData[]);
        seriesRefs.current[3]?.setData(macdLine.map((d) => ({ time: d.time as Time, value: 0 })) as LineData[]);
      }
    }

    if (indicator.type === 'ADX') {
      const { adx, plusDI, minusDI } = computeADX(candles, indicator.period);
      if (adx.length > 0) {
        seriesRefs.current[0]?.setData(adx.map(toLD) as LineData[]);
        seriesRefs.current[1]?.setData(plusDI.map(toLD) as LineData[]);
        seriesRefs.current[2]?.setData(minusDI.map(toLD) as LineData[]);
        seriesRefs.current[3]?.setData(adx.map((d) => ({ time: d.time as Time, value: 20 })) as LineData[]);
        seriesRefs.current[4]?.setData(adx.map((d) => ({ time: d.time as Time, value: 40 })) as LineData[]);
      }
    }

    if (indicator.type === 'ATR') {
      const data = computeATR(candles, indicator.period);
      if (data.length > 0) seriesRefs.current[0]?.setData(data.map(toLD) as LineData[]);
    }

    if (indicator.type === 'OBV') {
      const data = computeOBV(candles);
      if (data.length > 0) {
        seriesRefs.current[0]?.setData(data.map(toLD) as LineData[]);
        seriesRefs.current[1]?.setData(data.map((d) => ({ time: d.time as Time, value: 0 })) as LineData[]);
      }
    }

    if (indicator.type === 'PCT_DIFF_DON') {
      const { pctDiff, emaLine, basis, upper, lower, upperNew, lowerNew } = computePctDiffDonchian(
        candles, indicator.period, indicator.lookbackWindow ?? 10,
        indicator.emaSmoothing ?? 5, indicator.donchianLength ?? 20, indicator.donLineDiff ?? 0.2,
      );
      if (pctDiff.length > 0) {
        seriesRefs.current[0]?.setData(pctDiff.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        seriesRefs.current[1]?.setData(emaLine.map(toLD) as LineData[]);
        seriesRefs.current[2]?.setData(basis.map(toLD) as LineData[]);
        seriesRefs.current[3]?.setData(upper.map(toLD) as LineData[]);
        seriesRefs.current[4]?.setData(lower.map(toLD) as LineData[]);
        seriesRefs.current[5]?.setData(upperNew.map(toLD) as LineData[]);
        seriesRefs.current[6]?.setData(lowerNew.map(toLD) as LineData[]);
        seriesRefs.current[7]?.setData(pctDiff.map((d) => ({ time: d.time as Time, value: 0 })) as LineData[]);
      }
    }

    // After setData the chart auto-fits to all data — snap back to the main chart's range
    applyMainRange();
    if (pendingRangeRef.current) {
      try {
        chartRef.current.timeScale().setVisibleLogicalRange(pendingRangeRef.current);
      } catch {}
      pendingRangeRef.current = null;
    }

  }, [candles, indicator.type, indicator.period, indicator.kPeriod, indicator.dPeriod, indicator.lookbackWindow, indicator.emaSmoothing, indicator.donchianLength, indicator.donLineDiff, applyMainRange]);

  const label = indicator.type === 'STOCH_RSI' ? `StochRSI(${indicator.period})` :
    indicator.type === 'MACD' ? 'MACD(12,26,9)' :
    indicator.type === 'ADX' ? `ADX(${indicator.period})` :
    indicator.type === 'PCT_DIFF_DON' ? `%Diff Don(${indicator.period},${indicator.lookbackWindow ?? 10})` :
    `${indicator.type}(${indicator.period})`;

  const [height, setHeight] = useState(120);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(120);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = height;

    const handleMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientY - startY.current;
      setHeight(Math.max(60, Math.min(400, startHeight.current + delta)));
    };
    const handleUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [height]);

  return (
    <div className="relative" style={{ height }}>
      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 left-0 right-0 h-1 cursor-row-resize z-20 border-t border-border hover:border-primary hover:bg-primary/10 transition-colors"
      />
      <div className="absolute top-1 left-2 z-10 flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground pointer-events-auto">
        <span style={{ color: indicator.color }}>{label}</span>
        <button
          onClick={() => {
            if (window.confirm(`Remove ${label}?`)) {
              removeIndicator(indicator.id);
            }
          }}
          className="hover:text-destructive transition-colors"
          title="Remove"
        >
          <X size={10} />
        </button>
      </div>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
