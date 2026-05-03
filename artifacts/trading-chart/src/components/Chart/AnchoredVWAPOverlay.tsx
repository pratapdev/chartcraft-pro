import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { computeAnchoredVWAP, computeSessionVWAP } from '@/lib/anchoredVWAP';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export const AnchoredVWAPOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicators = useChartStore((s) => s.indicators);
  const candles = useChartStore((s) => s.candles);

  const avwapInds = indicators.filter((i) => i.type === 'ANCHORED_VWAP' && i.visible);
  const sessionInds = indicators.filter((i) => i.type === 'SESSION_VWAP' && i.visible);
  const active = avwapInds.length > 0 || sessionInds.length > 0;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series || candles.length === 0 || !active) return;

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

    const timeToX = (t: number): number | null => {
      const px = chart.timeScale().timeToCoordinate(t as unknown as Time);
      if (px !== null) return px as number;
      if (candles.length < 2) return null;
      const last = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      const lastX = chart.timeScale().timeToCoordinate(last.time as unknown as Time);
      const prevX = chart.timeScale().timeToCoordinate(prev.time as unknown as Time);
      if (lastX === null || prevX === null) return null;
      const pxPerSec = ((lastX as number) - (prevX as number)) / (last.time - prev.time);
      return (lastX as number) + (t - last.time) * pxPerSec;
    };

    const priceToY = (p: number): number | null => {
      const y = series.priceToCoordinate(p);
      return y !== null ? (y as number) : null;
    };

    const drawVWAPLine = (
      points: { time: number; vwap: number; upper1: number; lower1: number; upper2: number; lower2: number }[],
      color: string,
      showBands: boolean,
      label: string,
    ) => {
      if (points.length < 2) return;

      // Filter to visible range with some margin
      const visRange = chart.timeScale().getVisibleRange();
      if (!visRange) return;
      const fromT = (visRange.from as unknown as number);
      const toT = (visRange.to as unknown as number);
      const visible = points.filter(p => p.time >= fromT - 3600 && p.time <= toT + 3600);
      if (visible.length < 2) return;

      // Parse color for rgba
      let r = 148, g = 85, b = 247; // default purple
      const hex = color.replace('#', '');
      if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      }

      if (showBands) {
        // Draw +/-2σ band (very transparent)
        ctx.beginPath();
        visible.forEach((p, i) => {
          const x = timeToX(p.time);
          const y = priceToY(p.upper2);
          if (x === null || y === null) return;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        for (let i = visible.length - 1; i >= 0; i--) {
          const p = visible[i];
          const x = timeToX(p.time);
          const y = priceToY(p.lower2);
          if (x === null || y === null) continue;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(${r},${g},${b},0.05)`;
        ctx.fill();

        // Draw +/-1σ band
        ctx.beginPath();
        visible.forEach((p, i) => {
          const x = timeToX(p.time);
          const y = priceToY(p.upper1);
          if (x === null || y === null) return;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        for (let i = visible.length - 1; i >= 0; i--) {
          const p = visible[i];
          const x = timeToX(p.time);
          const y = priceToY(p.lower1);
          if (x === null || y === null) continue;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(${r},${g},${b},0.09)`;
        ctx.fill();

        // +/-1σ lines
        for (const field of ['upper1', 'lower1'] as const) {
          ctx.beginPath();
          let started = false;
          for (const p of visible) {
            const x = timeToX(p.time);
            const y = priceToY(p[field]);
            if (x === null || y === null) continue;
            if (!started) { ctx.moveTo(x, y); started = true; }
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(${r},${g},${b},0.35)`;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // +/-2σ lines
        for (const field of ['upper2', 'lower2'] as const) {
          ctx.beginPath();
          let started = false;
          for (const p of visible) {
            const x = timeToX(p.time);
            const y = priceToY(p[field]);
            if (x === null || y === null) continue;
            if (!started) { ctx.moveTo(x, y); started = true; }
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(${r},${g},${b},0.2)`;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Main VWAP line
      ctx.beginPath();
      let started = false;
      for (const p of visible) {
        const x = timeToX(p.time);
        const y = priceToY(p.vwap);
        if (x === null || y === null) continue;
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.stroke();

      // Label at right edge
      const last = visible[visible.length - 1];
      if (last) {
        const x = timeToX(last.time);
        const y = priceToY(last.vwap);
        if (x !== null && y !== null) {
          ctx.font = 'bold 9px JetBrains Mono, monospace';
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
          ctx.fillRect(Math.min(x + 4, w - tw - 8), y - 6, tw + 6, 12);
          ctx.fillStyle = '#fff';
          ctx.fillText(label, Math.min(x + 7, w - tw - 5), y + 4);
        }
      }
    };

    // Draw all ANCHORED_VWAP indicators
    avwapInds.forEach((ind, idx) => {
      const anchorTime = ind.anchorTime ?? 0;
      const points = computeAnchoredVWAP(candles, anchorTime);
      const label = anchorTime === 0 ? 'AVWAP' : `AVWAP${idx + 1}`;
      drawVWAPLine(points, ind.color, ind.showBands ?? true, label);
    });

    // Draw all SESSION_VWAP indicators
    sessionInds.forEach((ind) => {
      const points = computeSessionVWAP(candles);
      drawVWAPLine(points, ind.color, ind.showBands ?? true, 'SVWAP');
    });

  }, [chartRef, seriesRef, candles, avwapInds, sessionInds, active]);

  useEffect(() => {
    if (!active) {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      return;
    }
    render();
  }, [render, active, candles]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !active) return;
    const handler = () => render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => { try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {} };
  }, [chartRef, active, render]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="absolute inset-0 z-[5] pointer-events-none" />;
};
