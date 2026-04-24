import React, { useEffect, useRef, useState } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { orderBookManager, OrderBookSnapshot } from '@/lib/orderbookData';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

// Width of each orderbook snapshot column in pixels
const SNAP_COL_WIDTH = 3;
// Price scale width estimate (right side axis in LW-Charts)
const PRICE_SCALE_WIDTH = 65;

export const LiquidityHeatmapOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { indicators, symbol, candles } = useChartStore();
  const [tick, setTick] = useState(0);

  const config = indicators.find((i) => i.type === 'LIQUIDITY_HEATMAP');
  const visible = config?.visible ?? false;
  const intensity = config?.heatmapIntensity ?? 1;
  const colorScheme = config?.heatmapColorScheme ?? 'thermal';
  const transparency = config?.transparency ?? 60;

  // ── WebSocket Connection ──────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !symbol) {
      orderBookManager.disconnect();
      return;
    }
    orderBookManager.connect(symbol);
    const handleSnapshot = () => setTick((t) => t + 1);
    orderBookManager.on('snapshot', handleSnapshot);
    return () => {
      orderBookManager.off('snapshot', handleSnapshot);
      orderBookManager.disconnect();
    };
  }, [visible, symbol]);

  // ── Canvas Render Loop ────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !canvasRef.current || !chartRef.current || !seriesRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const chart = chartRef.current;
    const series = seriesRef.current;
    let rafId: number;

    const getColor = (vol: number, maxVol: number): string | null => {
      if (vol === 0 || maxVol === 0) return null;
      let p = Math.min(1, (vol / maxVol) * intensity);
      if (p < 0.04) return null;

      if (colorScheme === 'fire') {
        const r = Math.floor(255 * Math.min(1, p * 2));
        const g = Math.floor(255 * Math.max(0, Math.min(1, p * 2 - 1)));
        const b = Math.floor(255 * Math.max(0, p * 2 - 1.5));
        return `rgba(${r},${g},${b},${p.toFixed(2)})`;
      } else if (colorScheme === 'ocean') {
        const r = Math.floor(255 * Math.max(0, p * 2 - 1));
        const g = Math.floor(255 * p);
        return `rgba(${r},${g},255,${p.toFixed(2)})`;
      } else {
        // Thermal: blue → green → yellow → red
        const h = (1.0 - p) * 240;
        return `hsla(${h},100%,50%,${p.toFixed(2)})`;
      }
    };

    const render = () => {
      rafId = requestAnimationFrame(render);

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);

      const history = orderBookManager.history;
      if (history.length === 0) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.fillText('L2 Heatmap: Connecting to Binance...', 12, 28);
        ctx.globalAlpha = 1;
        return;
      }

      // ── Find last candle X (start of the right margin) ───────────────
      const timeScale = chart.timeScale();
      let lastCandleX = w - PRICE_SCALE_WIDTH - 60; // fallback

      if (candles.length > 0) {
        const coord = timeScale.timeToCoordinate(candles[candles.length - 1].time as unknown as Time);
        if (coord !== null) lastCandleX = coord;
      }

      // ── Compute the right margin (future area) ───────────────────────
      // rightEdge = full canvas minus the price scale
      const rightEdge = w - PRICE_SCALE_WIDTH;

      // How many pixel-columns fit in the right margin?
      const marginWidthPx = Math.max(0, rightEdge - lastCandleX);
      const maxCols = Math.max(1, Math.floor(marginWidthPx / SNAP_COL_WIDTH));

      // Take only the most recent maxCols snapshots
      const startIdx = Math.max(0, history.length - maxCols);
      const visible_snaps = history.slice(startIdx);

      if (visible_snaps.length === 0) return;

      // ── Alpha from transparency setting ──────────────────────────────
      const alpha = 1 - Math.max(0, Math.min(100, transparency)) / 100;
      ctx.globalAlpha = alpha;

      // ── Global max volume for this window ────────────────────────────
      let globalMax = 0;
      for (const snap of visible_snaps) {
        if (snap.maxVol > globalMax) globalMax = snap.maxVol;
      }
      if (globalMax === 0) return;

      const ROW_H = 2; // pixels tall per price level cell — tighter = more Bookmap-like

      // Render from left to right within the margin zone
      // - i=0 is oldest, rendered at lastCandleX
      // - i=last is newest, rendered near rightEdge
      for (let i = 0; i < visible_snaps.length; i++) {
        const snap = visible_snaps[i];
        const colX = lastCandleX + i * SNAP_COL_WIDTH;
        if (colX < lastCandleX || colX > rightEdge) continue;

        // Draw Bids (below market: buyers waiting)
        for (const bid of snap.bids) {
          const y = series.priceToCoordinate(bid.price);
          if (y === null || y < 0 || y > h) continue;
          const color = getColor(bid.quantity, globalMax);
          if (!color) continue;
          ctx.fillStyle = color;
          ctx.fillRect(colX, y - ROW_H / 2, SNAP_COL_WIDTH, ROW_H);
        }

        // Draw Asks (above market: sellers waiting)
        for (const ask of snap.asks) {
          const y = series.priceToCoordinate(ask.price);
          if (y === null || y < 0 || y > h) continue;
          const color = getColor(ask.quantity, globalMax);
          if (!color) continue;
          ctx.fillStyle = color;
          ctx.fillRect(colX, y - ROW_H / 2, SNAP_COL_WIDTH, ROW_H);
        }
      }

      // ── Draw a thin separator line at the last candle boundary ───────
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lastCandleX, 0);
      ctx.lineTo(lastCandleX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // ── Debug HUD ────────────────────────────────────────────────────
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(6, 6, 300, 32);
      ctx.fillStyle = '#00ffcc';
      ctx.font = '11px monospace';
      ctx.fillText(
        `L2 Heatmap ✓  Snaps: ${history.length}  Cols: ${visible_snaps.length}/${maxCols}`,
        10, 27
      );
    };

    render();
    return () => cancelAnimationFrame(rafId);
  }, [visible, transparency, colorScheme, intensity, candles, tick]);

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%', zIndex: 2 }}
    />
  );
};
