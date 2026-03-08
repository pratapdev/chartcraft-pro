import React, { useEffect, useRef } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  HistogramData,
  Time,
} from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { IndicatorConfig } from '@/types/trading';
import { computeRSI, computeStochRSI, computeMACD } from '@/lib/marketData';
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

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

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
          lineWidth: 1,
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
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
        });
        kSeries.setData(k.map((pt) => ({ time: pt.time as Time, value: pt.value })) as LineData[]);

        if (d.length > 0) {
          const dSeries = chart.addLineSeries({
            color: indicator.color2 ?? '#FF5722',
            lineWidth: 1,
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
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
        });
        macdSeries.setData(macdLine.map((d) => ({ time: d.time as Time, value: d.value })) as LineData[]);

        const sigSeries = chart.addLineSeries({
          color: indicator.color2 ?? '#FF5722',
          lineWidth: 1,
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

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, indicator]);

  const label = indicator.type === 'STOCH_RSI' ? `StochRSI(${indicator.period})` :
    indicator.type === 'MACD' ? 'MACD(12,26,9)' :
    `${indicator.type}(${indicator.period})`;

  return (
    <div className="relative border-t border-border" style={{ height: 120 }}>
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
