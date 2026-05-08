import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { detectAbsorption, AbsorptionMark } from '@/lib/absorptionDetection';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export const AbsorptionOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const candles = useChartStore((s) => s.candles);
  const indicators = useChartStore((s) => s.indicators);
  const ind = indicators.find((i) => i.type === 'ABSORPTION' && i.visible);

  const volMult = (ind as any)?.volMult ?? 2.5;
  const maxBodyAtr = (ind as any)?.maxBodyAtr ?? 0.35;
  const lookback = ind?.period ?? 20;

  const marks = useMemo(() => {
    if (!ind || candles.length === 0) return [];
    return detectAbsorption(candles, { lookback, volMult, maxBodyAtr });
  }, [ind, candles, lookback, volMult, maxBodyAtr]);

  const [hover, setHover] = useState<{ x: number; y: number; m: AbsorptionMark } | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series || !ind) return;

    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';

    for (const m of marks) {
      const x = chart.timeScale().timeToCoordinate(m.time as unknown as Time);
      const y = series.priceToCoordinate(m.price);
      if (x === null || y === null) continue;
      const xc = x as number;
      const yc = y as number;

      const above = m.kind === 'seller'; // seller absorption icon above bar
      const iconY = above ? yc - 10 : yc + 14;
      const color = m.kind === 'buyer' ? '34,197,94' : m.kind === 'seller' ? '239,68,68' : '234,179,8';

      // Glow halo
      const grad = ctx.createRadialGradient(xc, iconY - 3, 0, xc, iconY - 3, 14);
      grad.addColorStop(0, `rgba(${color},0.55)`);
      grad.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(xc, iconY - 3, 14, 0, Math.PI * 2);
      ctx.fill();

      // Diamond marker
      ctx.fillStyle = `rgba(${color},0.95)`;
      ctx.strokeStyle = '#0d1117';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xc, iconY - 6);
      ctx.lineTo(xc + 5, iconY - 1);
      ctx.lineTo(xc, iconY + 4);
      ctx.lineTo(xc - 5, iconY - 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Letter A (absorption)
      ctx.fillStyle = '#0d1117';
      ctx.font = 'bold 8px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('A', xc, iconY - 1);
      ctx.font = '12px sans-serif';
    }
  }, [chartRef, seriesRef, marks, ind]);

  useEffect(() => { render(); }, [render]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ind) return;
    const handler = () => render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => { try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {} };
  }, [chartRef, ind, render]);

  const handleMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series) { setHover(null); return; }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best: { m: AbsorptionMark; d: number } | null = null;
    for (const m of marks) {
      const x = chart.timeScale().timeToCoordinate(m.time as unknown as Time);
      const y = series.priceToCoordinate(m.price);
      if (x === null || y === null) continue;
      const above = m.kind === 'seller';
      const iconY = (y as number) + (above ? -10 : 14);
      const d = Math.hypot(mx - (x as number), my - iconY);
      if (d < 10 && (!best || d < best.d)) best = { m, d };
    }
    setHover(best ? { x: mx, y: my, m: best.m } : null);
  }, [chartRef, seriesRef, marks]);

  if (!ind) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-[6]"
        style={{ pointerEvents: 'auto' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      />
      <div className="absolute top-2 right-[280px] z-[10] flex items-center gap-2 bg-card/90 border border-border rounded px-2 py-1 text-[10px]">
        <span className="text-yellow-400">⬥ Absorption</span>
        <span className="text-muted-foreground">{marks.length} bars • vol≥{volMult}× • body≤{maxBodyAtr}×ATR</span>
      </div>
      {hover && (
        <div
          className="absolute z-[11] pointer-events-none bg-popover border border-border rounded px-2 py-1 text-[10px] shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className={
            hover.m.kind === 'buyer' ? 'text-green-400 font-medium'
            : hover.m.kind === 'seller' ? 'text-red-400 font-medium'
            : 'text-yellow-400 font-medium'
          }>
            {hover.m.kind === 'buyer' ? 'Buyer absorption (iceberg bid)'
              : hover.m.kind === 'seller' ? 'Seller absorption (iceberg ask)'
              : 'Neutral absorption'}
          </div>
          <div>Vol: {hover.m.volume.toFixed(2)} ({hover.m.volRatio.toFixed(1)}× avg)</div>
          <div>Body: {hover.m.bodyRatio.toFixed(2)}× ATR</div>
          <div className="text-muted-foreground">@ {hover.m.close}</div>
          <div className="text-muted-foreground">{new Date(hover.m.time * 1000).toLocaleString()}</div>
        </div>
      )}
    </>
  );
};
