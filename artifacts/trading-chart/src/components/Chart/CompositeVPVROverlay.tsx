import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { buildProfile } from '@/lib/volumeProfile';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

/** Composite VPVR — uses ALL loaded candles (not just visible range). Pinned to right edge. */
export const CompositeVPVROverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicators = useChartStore((s) => s.indicators);
  const candles = useChartStore((s) => s.candles);

  const ind = indicators.find((i) => i.type === 'COMPOSITE_VPVR' && i.visible);

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

    const profile = buildProfile(candles, { targetRows: 120, valueAreaPct: 0.7 });
    if (!profile) return;

    let maxVol = 0;
    for (const b of profile.buckets) {
      const t = b.up + b.down;
      if (t > maxVol) maxVol = t;
    }
    if (maxVol === 0) return;

    const priceScaleWidth = 65;
    const maxBarWidth = Math.min(220, w * 0.28);
    const anchorX = w - priceScaleWidth;

    // Value area shading
    const vahY = series.priceToCoordinate(profile.vah);
    const valY = series.priceToCoordinate(profile.val);
    if (vahY !== null && valY !== null) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
      ctx.fillRect(anchorX - maxBarWidth, Math.min(vahY as number, valY as number), maxBarWidth, Math.abs((vahY as number) - (valY as number)));
    }

    for (const b of profile.buckets) {
      const y = series.priceToCoordinate(b.price);
      const yNext = series.priceToCoordinate(b.price + profile.tickSize);
      if (y === null || yNext === null) continue;
      const barH = Math.max(1, Math.abs((y as number) - (yNext as number)) - 1);
      const total = b.up + b.down;
      const barW = (total / maxVol) * maxBarWidth;
      const barY = Math.min(y as number, yNext as number);
      const upW = (b.up / total) * barW;
      const dnW = barW - upW;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.32)';
      ctx.fillRect(anchorX - barW, barY, dnW, barH);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.32)';
      ctx.fillRect(anchorX - barW + dnW, barY, upW, barH);
    }

    // POC line full-width dashed
    const pocY = series.priceToCoordinate(profile.poc);
    if (pocY !== null) {
      ctx.strokeStyle = 'rgba(255, 235, 59, 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(0, pocY as number);
      ctx.lineTo(anchorX, pocY as number);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 235, 59, 0.95)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Composite POC ${profile.poc.toFixed(2)}`, 4, (pocY as number) - 3);
    }

    // VAH/VAL labels
    if (vahY !== null) {
      ctx.fillStyle = 'rgba(96, 165, 250, 0.9)';
      ctx.font = '10px sans-serif';
      ctx.fillText(`VAH ${profile.vah.toFixed(2)}`, 4, (vahY as number) - 3);
    }
    if (valY !== null) {
      ctx.fillStyle = 'rgba(96, 165, 250, 0.9)';
      ctx.font = '10px sans-serif';
      ctx.fillText(`VAL ${profile.val.toFixed(2)}`, 4, (valY as number) + 11);
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
