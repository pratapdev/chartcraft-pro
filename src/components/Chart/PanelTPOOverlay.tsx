import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMultiPanelStore } from '@/stores/multiPanelStore';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
  panelIndex: number;
}

export const PanelTPOOverlay: React.FC<Props> = ({ chartRef, seriesRef, panelIndex }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panel = useMultiPanelStore((s) => s.panels[panelIndex]);
  const indicators = panel?.indicators ?? [];
  const candles = panel?.candles ?? [];

  const tpoIndicator = indicators.find((i) => i.type === 'TPO' && i.visible);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series || !tpoIndicator) return;

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

    // Auto tick size: aim for ~60 rows for thicker TPO blocks
    const targetRows = 60;
    const rawTick = priceRange / targetRows;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawTick)));
    const normalized = rawTick / magnitude;
    let tickSize: number;
    if (normalized <= 1.5) tickSize = magnitude;
    else if (normalized <= 3.5) tickSize = 2.5 * magnitude;
    else if (normalized <= 7.5) tickSize = 5 * magnitude;
    else tickSize = 10 * magnitude;

    // Time segmentation: we divide the visible range into brackets (e.g., 20 time brackets)
    const TIME_BRACKETS = 20;
    const timePerBracket = (visible[visible.length - 1].time - visible[0].time) / TIME_BRACKETS;
    if (timePerBracket <= 0) return;

    // Map of Price -> set of Bracket Indices that touched this price
    const tpoProfile = new Map<number, Set<number>>();

    for (const c of visible) {
      const cLow = Math.floor(c.low / tickSize) * tickSize;
      const cHigh = Math.ceil(c.high / tickSize) * tickSize;
      
      const bracketIndex = Math.min(TIME_BRACKETS - 1, Math.floor((c.time - visible[0].time) / timePerBracket));

      for (let p = cLow; p <= cHigh; p += tickSize) {
        const key = Math.round(p / tickSize) * tickSize;
        if (!tpoProfile.has(key)) tpoProfile.set(key, new Set());
        tpoProfile.get(key)!.add(bracketIndex);
      }
    }

    let maxTpoCount = 0;
    let pocPrice = 0;

    for (const [price, brackets] of tpoProfile) {
      if (brackets.size > maxTpoCount) {
        maxTpoCount = brackets.size;
        pocPrice = price;
      }
    }
    if (maxTpoCount === 0) return;

    const maxBarWidth = Math.min(250, w * 0.35); // Max width of the TPO profile
    const priceScaleWidth = 65;
    const blockWidth = maxBarWidth / Math.max(15, maxTpoCount); // Fixed width per block for uniform rendering

    // Color palette for time brackets to give the classic Market Profile gradient look
    const heatColors = [
      'rgba(59, 130, 246, 0.6)',  // Blue
      'rgba(16, 185, 129, 0.6)',  // Green
      'rgba(245, 158, 11, 0.6)',  // Yellow/Orange
      'rgba(239, 68, 68, 0.6)',   // Red
      'rgba(139, 92, 246, 0.6)'   // Purple
    ];

    for (const [price, brackets] of tpoProfile) {
      const y = series.priceToCoordinate(price);
      const yNext = series.priceToCoordinate(price + tickSize);
      if (y === null || yNext === null) continue;

      const barHeight = Math.max(1, Math.abs((y as number) - (yNext as number)) - 1);
      const barY = Math.min(y as number, yNext as number);
      
      // Sort brackets sequentially so time reads left to right
      const sortedBrackets = Array.from(brackets).sort((a, b) => a - b);

      let xOffset = 0;
      for (const bracket of sortedBrackets) {
        const colorIdx = Math.floor((bracket / TIME_BRACKETS) * heatColors.length);
        ctx.fillStyle = heatColors[Math.min(colorIdx, heatColors.length - 1)];
        
        ctx.fillRect(w - priceScaleWidth - maxBarWidth + xOffset, barY, blockWidth - 1, barHeight);
        xOffset += blockWidth;
      }
    }

    // POC highlight line
    if (pocPrice > 0) {
      const pocY = series.priceToCoordinate(pocPrice);
      const pocYNext = series.priceToCoordinate(pocPrice + tickSize);
      if (pocY !== null && pocYNext !== null) {
        const barHeight = Math.abs((pocY as number) - (pocYNext as number));
        const barY = Math.min(pocY as number, pocYNext as number);

        // POC dashed line extending full width of profile
        ctx.beginPath();
        ctx.moveTo(w - priceScaleWidth - maxBarWidth, barY + barHeight / 2);
        ctx.lineTo(w - priceScaleWidth, barY + barHeight / 2);
        ctx.strokeStyle = '#ef4444'; // Red POC line
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [chartRef, seriesRef, candles, tpoIndicator]);

  // Render once when data changes
  useEffect(() => {
    if (!tpoIndicator) return;
    render();
  }, [render, tpoIndicator]);

  // Re-render on visible range changes (zoom/pan)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !tpoIndicator) return;
    const handler = () => render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {}
    };
  }, [chartRef, tpoIndicator, render]);

  if (!tpoIndicator) return null;

  return <canvas ref={canvasRef} className="absolute inset-0 z-[5] pointer-events-none" />;
};
