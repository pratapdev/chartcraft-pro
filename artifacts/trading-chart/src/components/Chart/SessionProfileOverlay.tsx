import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { buildProfile, groupBySession } from '@/lib/volumeProfile';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

/** Per-session (daily) volume profile rendered inline at the right edge of each session. */
export const SessionProfileOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicators = useChartStore((s) => s.indicators);
  const candles = useChartStore((s) => s.candles);

  const ind = indicators.find((i) => i.type === 'SESSION_VPVR' && i.visible);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series || !ind) return;

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

    const sessionSec = 86400;
    const sessions = groupBySession(candles, sessionSec);

    for (const session of sessions) {
      const sStart = session[0].time;
      const sEnd = session[session.length - 1].time;
      if (sEnd < from || sStart > to) continue;

      const profile = buildProfile(session, { targetRows: 24, valueAreaPct: 0.7 });
      if (!profile) continue;

      const xStart = chart.timeScale().timeToCoordinate(sStart as any);
      const xEnd = chart.timeScale().timeToCoordinate(sEnd as any);
      if (xStart === null || xEnd === null) continue;

      const sessionWidth = Math.max(20, (xEnd as number) - (xStart as number));
      const maxBarWidth = Math.min(sessionWidth * 0.45, 90);
      const anchorX = xEnd as number; // right edge

      let maxVol = 0;
      for (const b of profile.buckets) {
        const t = b.up + b.down;
        if (t > maxVol) maxVol = t;
      }
      if (maxVol === 0) continue;

      // Draw value area background
      const vahY = series.priceToCoordinate(profile.vah);
      const valY = series.priceToCoordinate(profile.val);
      if (vahY !== null && valY !== null) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
        ctx.fillRect(anchorX - maxBarWidth, Math.min(vahY as number, valY as number), maxBarWidth, Math.abs((vahY as number) - (valY as number)));
      }

      for (const b of profile.buckets) {
        const y = series.priceToCoordinate(b.price);
        const yNext = series.priceToCoordinate(b.price + profile.tickSize);
        if (y === null || yNext === null) continue;
        const barH = Math.max(1, Math.abs((y as number) - (yNext as number)) - 0.5);
        const total = b.up + b.down;
        const barW = (total / maxVol) * maxBarWidth;
        const barY = Math.min(y as number, yNext as number);
        // Bars grow from anchor (right edge of session) to the LEFT
        const upW = (b.up / total) * barW;
        const dnW = barW - upW;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.fillRect(anchorX - barW, barY, dnW, barH);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
        ctx.fillRect(anchorX - barW + dnW, barY, upW, barH);
      }

      // POC line
      const pocY = series.priceToCoordinate(profile.poc);
      if (pocY !== null) {
        ctx.strokeStyle = 'rgba(255, 235, 59, 0.85)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(anchorX - maxBarWidth, pocY as number);
        ctx.lineTo(anchorX, pocY as number);
        ctx.stroke();
      }
    }
  }, [chartRef, seriesRef, candles, ind]);

  useEffect(() => { if (ind) render(); }, [render, ind]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ind) return;
    const handler = () => render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => { try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {} };
  }, [chartRef, ind, render]);

  if (!ind) return null;
  return <canvas ref={canvasRef} className="absolute inset-0 z-[5] pointer-events-none" />;
};
