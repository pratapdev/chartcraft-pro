import React, { useEffect, useRef, useState, useCallback } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { subscribeLiquidations, subscribeLiquidationStatus, Liquidation } from '@/lib/liquidationData';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

const MAX_LIQS = 1000;

export const LiquidationsOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const symbol = useChartStore((s) => s.symbol);
  const marketType = useChartStore((s) => s.marketType);
  const indicators = useChartStore((s) => s.indicators);
  const liqInd = indicators.find((i) => i.type === 'LIQUIDATIONS' && i.visible);

  const minUsd = (liqInd as any)?.threshold ?? 10000;
  const [liqs, setLiqs] = useState<Liquidation[]>([]);
  const liqsRef = useRef<Liquidation[]>([]);
  const [hover, setHover] = useState<{ x: number; y: number; liq: Liquidation } | null>(null);
  const [connected, setConnected] = useState(false);

  // Subscribe to live liquidations
  useEffect(() => {
    if (!liqInd || marketType !== 'crypto') return;
    setLiqs([]);
    liqsRef.current = [];

    const unsub = subscribeLiquidations(symbol, (liq) => {
      liqsRef.current = [...liqsRef.current, liq].slice(-MAX_LIQS);
      setLiqs(liqsRef.current);
    });
    const unsubStatus = subscribeLiquidationStatus(setConnected);
    return () => { unsub(); unsubStatus(); };
  }, [symbol, marketType, liqInd]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series || !liqInd) return;

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

    const visible = liqs.filter((l) => l.usd >= minUsd);
    if (visible.length === 0) return;

    // Find max usd for scaling
    const maxUsd = Math.max(...visible.map((l) => l.usd));

    for (const liq of visible) {
      const x = chart.timeScale().timeToCoordinate(liq.time as unknown as Time);
      const y = series.priceToCoordinate(liq.price);
      if (x === null || y === null) continue;

      // Bubble radius: log-scaled, 4-30px
      const ratio = Math.log10(liq.usd) / Math.log10(maxUsd || 1);
      const r = Math.max(4, Math.min(30, 4 + ratio * 22));

      // SELL = long liquidated → red, BUY = short liquidated → green
      const isLong = liq.side === 'SELL';
      const color = isLong ? '239,68,68' : '34,197,94';

      // Glow
      const grad = ctx.createRadialGradient(x as number, y as number, 0, x as number, y as number, r);
      grad.addColorStop(0, `rgba(${color},0.7)`);
      grad.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x as number, y as number, r, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = `rgba(${color},0.9)`;
      ctx.beginPath();
      ctx.arc(x as number, y as number, Math.max(2, r * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
  }, [chartRef, seriesRef, liqs, minUsd, liqInd]);

  useEffect(() => { render(); }, [render]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !liqInd) return;
    const handler = () => render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {}
    };
  }, [chartRef, liqInd, render]);

  // Hover tooltip
  const handleMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series) { setHover(null); return; }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const visible = liqs.filter((l) => l.usd >= minUsd);
    const maxUsd = Math.max(...visible.map((l) => l.usd), 1);
    let best: { liq: Liquidation; d: number } | null = null;
    for (const liq of visible) {
      const x = chart.timeScale().timeToCoordinate(liq.time as unknown as Time);
      const y = series.priceToCoordinate(liq.price);
      if (x === null || y === null) continue;
      const ratio = Math.log10(liq.usd) / Math.log10(maxUsd);
      const r = Math.max(4, Math.min(30, 4 + ratio * 22));
      const d = Math.hypot(mx - (x as number), my - (y as number));
      if (d < r && (!best || d < best.d)) best = { liq, d };
    }
    setHover(best ? { x: mx, y: my, liq: best.liq } : null);
  }, [chartRef, seriesRef, liqs, minUsd]);

  if (!liqInd || marketType !== 'crypto') return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-[7]"
        style={{ pointerEvents: 'auto' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      />
      {/* Stats badge */}
      <div className="absolute top-2 right-20 z-[10] flex items-center gap-2 bg-card/90 border border-border rounded px-2 py-1 text-[10px]">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-yellow-500 animate-pulse'}`} title={connected ? 'Live' : 'Connecting…'} />
        <span className="text-red-400">L: ${(liqs.filter(l => l.side === 'SELL').reduce((s, l) => s + l.usd, 0) / 1000).toFixed(1)}k</span>
        <span className="text-green-400">S: ${(liqs.filter(l => l.side === 'BUY').reduce((s, l) => s + l.usd, 0) / 1000).toFixed(1)}k</span>
        <span className="text-muted-foreground">{liqs.length} • ≥${(minUsd / 1000).toFixed(0)}k</span>
      </div>
      {hover && (
        <div
          className="absolute z-[11] pointer-events-none bg-popover border border-border rounded px-2 py-1 text-[10px] shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className={hover.liq.side === 'SELL' ? 'text-red-400 font-medium' : 'text-green-400 font-medium'}>
            {hover.liq.side === 'SELL' ? 'Long liquidated' : 'Short liquidated'}
          </div>
          <div>${hover.liq.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="text-muted-foreground">@ {hover.liq.price}</div>
          <div className="text-muted-foreground">{new Date(hover.liq.time * 1000).toLocaleTimeString()}</div>
        </div>
      )}
    </>
  );
};
