import React, { useEffect, useRef, useCallback, useState } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { Candle, Timeframe } from '@/types/trading';
import { HTFLayerConfig, TF_SECONDS } from '@/types/htfOverlay';
import { fetchHTFCandles, getAutoLayers, getTrend } from '@/lib/htfService';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export const HTFOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const htfOverlay = useChartStore((s) => s.htfOverlay);
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const candles = useChartStore((s) => s.candles);

  const [htfData, setHtfData] = useState<Map<Timeframe, Candle[]>>(new Map());

  const activeLayers = htfOverlay.autoMode
    ? getAutoLayers(timeframe, htfOverlay.layers).filter(l => l.enabled)
    : htfOverlay.layers.filter(l => l.enabled);

  // Fetch HTF candles when layers change
  useEffect(() => {
    if (activeLayers.length === 0) return;
    let cancelled = false;

    const load = async () => {
      const newData = new Map<Timeframe, Candle[]>();
      await Promise.all(
        activeLayers.map(async (layer) => {
          const data = await fetchHTFCandles(symbol, layer.timeframe);
          if (!cancelled) newData.set(layer.timeframe, data);
        })
      );
      if (!cancelled) setHtfData(newData);
    };
    load();

    // Refresh periodically
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [symbol, activeLayers.map(l => `${l.timeframe}:${l.enabled}`).join(',')]);

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series) return;

    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    if (activeLayers.length === 0) return;

    const visRange = chart.timeScale().getVisibleRange();
    if (!visRange) return;
    const from = visRange.from as unknown as number;
    const to = visRange.to as unknown as number;

    const baseTfSec = TF_SECONDS[timeframe];
    const baseTrend = htfOverlay.trendAlignment ? getTrend(candles) : null;

    for (const layer of activeLayers) {
      const htfCandles = htfData.get(layer.timeframe);
      if (!htfCandles || htfCandles.length === 0) continue;

      const htfSec = TF_SECONDS[layer.timeframe];
      const { r, g, b } = hexToRgb(layer.color);
      const htfTrend = htfOverlay.trendAlignment ? getTrend(htfCandles) : null;

      // Filter visible HTF candles (with some margin)
      const visible = htfCandles.filter(c => {
        const end = c.time + htfSec;
        return end >= from && c.time <= to;
      });

      for (const c of visible) {
        const startTime = c.time;
        const endTime = c.time + htfSec;

        // Get pixel coordinates
        const x1 = chart.timeScale().timeToCoordinate(startTime as unknown as Time);
        const x2 = chart.timeScale().timeToCoordinate(endTime as unknown as Time);
        if (x1 === null || x2 === null) continue;

        const x1n = x1 as number;
        const x2n = x2 as number;
        const candleWidth = Math.abs(x2n - x1n);
        if (candleWidth < 1) continue;

        const isUp = c.close >= c.open;
        let opacity = layer.opacity;

        // Trend alignment highlighting
        if (htfOverlay.trendAlignment && baseTrend && htfTrend) {
          if (baseTrend === htfTrend && baseTrend !== 'neutral') {
            opacity = Math.min(1, opacity * 1.5); // boost aligned
          } else if (baseTrend !== htfTrend && baseTrend !== 'neutral' && htfTrend !== 'neutral') {
            // Draw warning border for conflicting trends
            ctx.strokeStyle = `rgba(255, 200, 0, 0.6)`;
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            const yHigh = series.priceToCoordinate(c.high);
            const yLow = series.priceToCoordinate(c.low);
            if (yHigh !== null && yLow !== null) {
              ctx.strokeRect(x1n, yHigh as number, candleWidth, (yLow as number) - (yHigh as number));
            }
            ctx.setLineDash([]);
          }
        }

        if (layer.mode === 'candles') {
          const yOpen = series.priceToCoordinate(c.open);
          const yClose = series.priceToCoordinate(c.close);
          const yHigh = series.priceToCoordinate(c.high);
          const yLow = series.priceToCoordinate(c.low);
          if (yOpen === null || yClose === null || yHigh === null || yLow === null) continue;

          const bodyTop = Math.min(yOpen as number, yClose as number);
          const bodyBottom = Math.max(yOpen as number, yClose as number);
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);

          // Wicks
          if (layer.showWicks) {
            ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.7})`;
            ctx.lineWidth = 1;
            const midX = x1n + candleWidth / 2;
            ctx.beginPath();
            ctx.moveTo(midX, yHigh as number);
            ctx.lineTo(midX, bodyTop);
            ctx.moveTo(midX, bodyBottom);
            ctx.lineTo(midX, yLow as number);
            ctx.stroke();
          }

          // Body
          const fillColor = isUp
            ? `rgba(${r},${g},${b},${opacity})`
            : `rgba(${r},${g},${b},${opacity * 0.6})`;
          ctx.fillStyle = fillColor;
          ctx.fillRect(x1n + 1, bodyTop, candleWidth - 2, bodyHeight);

          // Border
          ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.8})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(x1n + 1, bodyTop, candleWidth - 2, bodyHeight);

        } else if (layer.mode === 'zones') {
          const yHigh = series.priceToCoordinate(c.high);
          const yLow = series.priceToCoordinate(c.low);
          if (yHigh === null || yLow === null) continue;

          const top = Math.min(yHigh as number, yLow as number);
          const height = Math.max(1, Math.abs((yLow as number) - (yHigh as number)));

          ctx.fillStyle = `rgba(${r},${g},${b},${opacity * 0.5})`;
          ctx.fillRect(x1n, top, candleWidth, height);

          // Open-close zone inside
          const yOpen = series.priceToCoordinate(c.open);
          const yClose = series.priceToCoordinate(c.close);
          if (yOpen !== null && yClose !== null) {
            const bodyTop = Math.min(yOpen as number, yClose as number);
            const bodyHeight = Math.max(1, Math.abs((yClose as number) - (yOpen as number)));
            ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`;
            ctx.fillRect(x1n, bodyTop, candleWidth, bodyHeight);
          }

        } else if (layer.mode === 'highlow') {
          const yHigh = series.priceToCoordinate(c.high);
          const yLow = series.priceToCoordinate(c.low);
          if (yHigh === null || yLow === null) continue;

          ctx.strokeStyle = `rgba(${r},${g},${b},${opacity})`;
          ctx.lineWidth = 2;
          ctx.setLineDash([]);

          // High line
          ctx.beginPath();
          ctx.moveTo(x1n, yHigh as number);
          ctx.lineTo(x1n + candleWidth, yHigh as number);
          ctx.stroke();

          // Low line
          ctx.beginPath();
          ctx.moveTo(x1n, yLow as number);
          ctx.lineTo(x1n + candleWidth, yLow as number);
          ctx.stroke();

          // Vertical connectors at edges
          ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.4})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(x1n, yHigh as number);
          ctx.lineTo(x1n, yLow as number);
          ctx.moveTo(x1n + candleWidth, yHigh as number);
          ctx.lineTo(x1n + candleWidth, yLow as number);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }, [chartRef, seriesRef, htfData, activeLayers, candles, timeframe, htfOverlay.trendAlignment]);

  // Render on data changes
  useEffect(() => {
    if (activeLayers.length === 0) return;
    render();
  }, [render]);

  // Re-render on zoom/pan
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || activeLayers.length === 0) return;
    const handler = () => render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {}
    };
  }, [chartRef, activeLayers.length, render]);

  if (activeLayers.length === 0) return null;

  return <canvas ref={canvasRef} className="absolute inset-0 z-[4] pointer-events-none" />;
};
