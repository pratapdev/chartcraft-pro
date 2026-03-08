import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  HistogramData,
  Time,
} from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { IndicatorConfig, LineStyleType } from '@/types/trading';
import { computeRSI, computeStochRSI, computeMACD, computeADX, computeATR, computeOBV } from '@/lib/marketData';

const toLWLineStyle = (s?: LineStyleType) => s === 'dashed' ? 2 : s === 'dotted' ? 1 : 0;
import { useChartSync } from './ChartSyncContext';
import { X } from 'lucide-react';

interface IndicatorPaneProps {
  indicator: IndicatorConfig;
}

export const IndicatorPane: React.FC<IndicatorPaneProps> = ({ indicator }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { candles, removeIndicator } = useChartStore();
  const chartSync = useChartSync();
  const chartId = `indicator-${indicator.id}`;
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    // Save visible range before destroying
    if (chartRef.current) {
      const range = chartRef.current.timeScale().getVisibleLogicalRange();
      if (range) savedRangeRef.current = range;
      if (chartSync) chartSync.unregisterChart(chartId);
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
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#1c2333',
        timeVisible: true,
        secondsVisible: false,
        visible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    if (indicator.type === 'RSI') {
      const data = computeRSI(candles, indicator.period);
      if (data.length > 0) {
        const series = chart.addLineSeries({
          color: indicator.color,
          lineWidth: (indicator.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          lineStyle: toLWLineStyle(indicator.lineStyle),
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
        });
        series.setData(data.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);

        // Add overbought/oversold reference lines
        const ob = chart.addLineSeries({
          color: 'rgba(239,68,68,0.3)',
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        ob.setData(data.map((d) => ({ time: d.time as Time, value: 70 })) as LineData[]);

        const os = chart.addLineSeries({
          color: 'rgba(34,197,94,0.3)',
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        os.setData(data.map((d) => ({ time: d.time as Time, value: 30 })) as LineData[]);
      }
    }

    if (indicator.type === 'STOCH_RSI') {
      const { k, d } = computeStochRSI(candles, indicator.period, indicator.period, indicator.kPeriod ?? 3, indicator.dPeriod ?? 3);
      if (k.length > 0) {
        const kSeries = chart.addLineSeries({
          color: indicator.color,
          lineWidth: (indicator.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          lineStyle: toLWLineStyle(indicator.lineStyle),
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
        });
        kSeries.setData(k.map((pt) => ({ time: pt.time as Time, value: pt.value })) as LineData[]);

        if (d.length > 0) {
          const dSeries = chart.addLineSeries({
            color: indicator.color2 ?? '#FF5722',
            lineWidth: (indicator.lineWidth ?? 1) as 1 | 2 | 3 | 4,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: false,
          });
          dSeries.setData(d.map((pt) => ({ time: pt.time as Time, value: pt.value })) as LineData[]);
        }

        // Overbought/oversold
        const ob = chart.addLineSeries({ color: 'rgba(239,68,68,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        ob.setData(k.map((pt) => ({ time: pt.time as Time, value: 80 })) as LineData[]);
        const os = chart.addLineSeries({ color: 'rgba(34,197,94,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        os.setData(k.map((pt) => ({ time: pt.time as Time, value: 20 })) as LineData[]);
      }
    }

    if (indicator.type === 'MACD') {
      const { macdLine, signalLine, histogram } = computeMACD(candles, 12, 26, 9);
      if (macdLine.length > 0) {
        const macdSeries = chart.addLineSeries({
          color: indicator.color,
          lineWidth: (indicator.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
        });
        macdSeries.setData(macdLine.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);

        const sigSeries = chart.addLineSeries({
          color: indicator.color2 ?? '#FF5722',
          lineWidth: (indicator.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
        });
        sigSeries.setData(signalLine.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);

        const histSeries = chart.addHistogramSeries({
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
          priceScaleId: '',
        });
        histSeries.priceScale().applyOptions({ scaleMargins: { top: 0.0, bottom: 0.0 } });
        histSeries.setData(histogram.map((d) => ({
          time: d.time as Time,
          value: d.value,
          color: d.value >= 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)',
        })) as HistogramData[]);

        // Zero line
        const zeroLine = chart.addLineSeries({ color: 'rgba(107,114,128,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        zeroLine.setData(macdLine.map((d) => ({ time: d.time as Time, value: 0 })) as LineData[]);
      }
    }

    if (indicator.type === 'ADX') {
      const { adx, plusDI, minusDI } = computeADX(candles, indicator.period);
      if (adx.length > 0) {
        const adxSeries = chart.addLineSeries({
          color: indicator.color,
          lineWidth: (indicator.lineWidth ?? 2) as 1 | 2 | 3 | 4,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
        });
        adxSeries.setData(adx.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);

        const plusSeries = chart.addLineSeries({
          color: '#22c55e',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        plusSeries.setData(plusDI.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);

        const minusSeries = chart.addLineSeries({
          color: '#ef4444',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        minusSeries.setData(minusDI.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);

        // Reference lines at 20 and 40
        const ref20 = chart.addLineSeries({ color: 'rgba(107,114,128,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        ref20.setData(adx.map((d) => ({ time: d.time as Time, value: 20 })) as LineData[]);
        const ref40 = chart.addLineSeries({ color: 'rgba(107,114,128,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        ref40.setData(adx.map((d) => ({ time: d.time as Time, value: 40 })) as LineData[]);
      }
    }

    if (indicator.type === 'ATR') {
      const data = computeATR(candles, indicator.period);
      if (data.length > 0) {
        const series = chart.addLineSeries({
          color: indicator.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
        });
        series.setData(data.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);
      }
    }

    if (indicator.type === 'OBV') {
      const data = computeOBV(candles);
      if (data.length > 0) {
        const series = chart.addLineSeries({
          color: indicator.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
        });
        series.setData(data.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);

        const zeroLine = chart.addLineSeries({ color: 'rgba(107,114,128,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        zeroLine.setData(data.map((d) => ({ time: d.time as Time, value: 0 })) as LineData[]);
      }
    }

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    // Restore saved range or sync from main chart
    if (savedRangeRef.current) {
      chart.timeScale().setVisibleLogicalRange(savedRangeRef.current);
    }

    // Register with sync context (after restoring range to avoid triggering sync)
    if (chartSync) {
      chartSync.registerChart(chartId, chart);
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) chartSync.syncRange(chartId, range);
      });
    }

    return () => {
      ro.disconnect();
      if (chartRef.current) {
        const range = chartRef.current.timeScale().getVisibleLogicalRange();
        if (range) savedRangeRef.current = range;
      }
      if (chartSync) chartSync.unregisterChart(chartId);
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, indicator]);

  const label = indicator.type === 'STOCH_RSI' ? `StochRSI(${indicator.period})` :
    indicator.type === 'MACD' ? 'MACD(12,26,9)' :
    indicator.type === 'ADX' ? `ADX(${indicator.period})` :
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
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 left-0 right-0 h-1 cursor-row-resize z-20 border-t border-border hover:border-primary hover:bg-primary/10 transition-colors"
      />
      <div className="absolute top-1 left-2 z-10 flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground pointer-events-auto">
        <span style={{ color: indicator.color }}>{label}</span>
        <button
          onClick={() => removeIndicator(indicator.id)}
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
