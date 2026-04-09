import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export const VPVROverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicators = useChartStore((s) => s.indicators);
  const candles = useChartStore((s) => s.candles);

  const vpvrIndicator = indicators.find((i) => i.type === 'VPVR' && i.visible);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series || !vpvrIndicator) return;

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

    const visRange = chart.timeScale().getVisibleRange();
    if (!visRange) return;

    const from = visRange.from as unknown as number;
    const to = visRange.to as unknown as number;

    const visible = candles.filter((c) => c.time >= from && c.time <= to);
    if (visible.length === 0) return;

    let minPrice = Infinity,
      maxPrice = -Infinity;
    for (const c of visible) {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    }

    const priceRange = maxPrice - minPrice;
    if (priceRange <= 0) return;

    // Auto tick size: aim for ~80-120 rows
    const targetRows = 100;
    const rawTick = priceRange / targetRows;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawTick)));
    const normalized = rawTick / magnitude;
    let tickSize: number;
    if (normalized <= 1.5) tickSize = magnitude;
    else if (normalized <= 3.5) tickSize = 2.5 * magnitude;
    else if (normalized <= 7.5) tickSize = 5 * magnitude;
    else tickSize = 10 * magnitude;

    // Bucket volume by price level
    const buckets = new Map<number, { up: number; down: number }>();

    for (const c of visible) {
      const isUp = c.close >= c.open;
      const cLow = Math.floor(c.low / tickSize) * tickSize;
      const cHigh = Math.ceil(c.high / tickSize) * tickSize;
      const levels = Math.max(1, Math.round((cHigh - cLow) / tickSize));
      const volPerLevel = c.volume / levels;

      for (let p = cLow; p <= cHigh; p += tickSize) {
        const key = Math.round(p / tickSize) * tickSize;
        const existing = buckets.get(key) || { up: 0, down: 0 };
        if (isUp) existing.up += volPerLevel;
        else existing.down += volPerLevel;
        buckets.set(key, existing);
      }
    }

    let maxVol = 0;
    for (const [, v] of buckets) {
      const total = v.up + v.down;
      if (total > maxVol) maxVol = total;
    }
    if (maxVol === 0) return;

    const maxBarWidth = Math.min(200, w * 0.25);
    const priceScaleWidth = 65;

    let pocPrice = 0;
    let pocVol = 0;

    for (const [price, vol] of buckets) {
      const y = series.priceToCoordinate(price);
      const yNext = series.priceToCoordinate(price + tickSize);
      if (y === null || yNext === null) continue;

      const barHeight = Math.max(1, Math.abs((y as number) - (yNext as number)) - 1);
      const totalVol = vol.up + vol.down;
      const barWidth = (totalVol / maxVol) * maxBarWidth;

      const barX = w - priceScaleWidth - barWidth;
      const barY = Math.min(y as number, yNext as number);

      const upWidth = (vol.up / totalVol) * barWidth;
      const downWidth = barWidth - upWidth;

      // Down volume (red) on the left
      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
      ctx.fillRect(barX, barY, downWidth, barHeight);

      // Up volume (green) on the right
      ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
      ctx.fillRect(barX + downWidth, barY, upWidth, barHeight);

      if (totalVol > pocVol) {
        pocVol = totalVol;
        pocPrice = price;
      }
    }

    // POC highlight
    if (pocPrice > 0) {
      const pocY = series.priceToCoordinate(pocPrice);
      const pocYNext = series.priceToCoordinate(pocPrice + tickSize);
      if (pocY !== null && pocYNext !== null) {
        const barHeight = Math.abs((pocY as number) - (pocYNext as number));
        const barY = Math.min(pocY as number, pocYNext as number);
        ctx.fillStyle = 'rgba(255, 235, 59, 0.25)';
        ctx.fillRect(w - priceScaleWidth - maxBarWidth, barY, maxBarWidth, barHeight);

        // POC dashed line
        ctx.beginPath();
        ctx.moveTo(0, barY + barHeight / 2);
        ctx.lineTo(w - priceScaleWidth, barY + barHeight / 2);
        ctx.strokeStyle = 'rgba(255, 235, 59, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [chartRef, seriesRef, candles, vpvrIndicator]);

  // Render once when data changes
  useEffect(() => {
    if (!vpvrIndicator) return;
    render();
  }, [render, vpvrIndicator]);

  // Re-render on visible range changes (zoom/pan)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !vpvrIndicator) return;
    const handler = () => render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {}
    };
  }, [chartRef, vpvrIndicator, render]);

  if (!vpvrIndicator) return null;

  return <canvas ref={canvasRef} className="absolute inset-0 z-[5] pointer-events-none" />;
};
