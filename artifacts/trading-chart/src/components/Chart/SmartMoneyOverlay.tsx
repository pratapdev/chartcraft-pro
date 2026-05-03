import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { computeFVG, computeMarketStructure, computeSupplyDemand } from '@/lib/smartMoney';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export const SmartMoneyOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicators = useChartStore((s) => s.indicators);
  const candles = useChartStore((s) => s.candles);

  const fvgInd = indicators.find((i) => i.type === 'FVG' && i.visible);
  const msInd = indicators.find((i) => i.type === 'MARKET_STRUCTURE' && i.visible);
  const sdInd = indicators.find((i) => i.type === 'SUPPLY_DEMAND' && i.visible);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series || candles.length === 0) return;
    if (!fvgInd && !msInd && !sdInd) return;

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
    const fromT = visRange.from as unknown as number;
    const toT = visRange.to as unknown as number;

    const timeToX = (t: number): number | null => {
      const px = chart.timeScale().timeToCoordinate(t as unknown as Time);
      if (px !== null) return px as number;
      if (candles.length < 2) return null;
      const last = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      const lastX = chart.timeScale().timeToCoordinate(last.time as unknown as Time);
      const prevX = chart.timeScale().timeToCoordinate(prev.time as unknown as Time);
      if (lastX === null || prevX === null) return null;
      const pxPerSec = (lastX as number - (prevX as number)) / (last.time - prev.time);
      return (lastX as number) + (t - last.time) * pxPerSec;
    };

    const priceToY = (p: number): number | null => {
      const y = series.priceToCoordinate(p);
      return y !== null ? (y as number) : null;
    };

    // Rightmost X = edge of price scale (approx w - 70px)
    const rightEdgeX = w - 70;

    // ---- Fair Value Gaps ----
    if (fvgInd) {
      const showMitigated = fvgInd.showMitigated ?? false;
      const fvgs = computeFVG(candles, fvgInd.threshold ?? 0.1);

      for (const fvg of fvgs) {
        if (fvg.mitigated && !showMitigated) continue;
        // Only show gaps that overlap with the visible range
        if (fvg.endTime < fromT) continue;
        if (fvg.startTime > toT) continue;

        const x1 = timeToX(fvg.midTime);
        const x2 = fvg.mitigated && fvg.mitigatedTime
          ? timeToX(fvg.mitigatedTime)
          : rightEdgeX;
        const yTop = priceToY(fvg.top);
        const yBot = priceToY(fvg.bottom);

        if (x1 === null || yTop === null || yBot === null) continue;
        const x2Clamped = x2 !== null ? Math.min(x2, rightEdgeX) : rightEdgeX;

        const rectX = x1;
        const rectW = x2Clamped - x1;
        const rectY = Math.min(yTop, yBot);
        const rectH = Math.max(2, Math.abs(yTop - yBot));

        if (fvg.type === 'bullish') {
          ctx.fillStyle = fvg.mitigated ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.15)';
          ctx.strokeStyle = fvg.mitigated ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.7)';
        } else {
          ctx.fillStyle = fvg.mitigated ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.15)';
          ctx.strokeStyle = fvg.mitigated ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.7)';
        }
        ctx.lineWidth = 1;
        ctx.setLineDash(fvg.mitigated ? [3, 2] : []);
        ctx.fillRect(rectX, rectY, rectW, rectH);
        ctx.strokeRect(rectX, rectY, rectW, rectH);
        ctx.setLineDash([]);

        // Label
        if (rectH > 8) {
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.fillStyle = fvg.type === 'bullish' ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)';
          const label = fvg.type === 'bullish' ? 'FVG ▲' : 'FVG ▼';
          ctx.fillText(label, rectX + 3, rectY + Math.min(11, rectH - 2));
        }
      }
    }

    // ---- Market Structure: BOS / CHOCH / Sweeps ----
    if (msInd) {
      const swingLen = msInd.period ?? 5;
      const showSweeps = msInd.showSweeps ?? true;
      const showSwingDots = msInd.showSwingDots ?? true;
      const ms = computeMarketStructure(candles, swingLen);

      // Swing highs and lows as dots
      if (showSwingDots) {
        for (const sh of ms.swingHighs) {
          if (sh.time < fromT || sh.time > toT) continue;
          const x = timeToX(sh.time);
          const y = priceToY(sh.price);
          if (x === null || y === null) continue;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(239,68,68,0.5)';
          ctx.fill();
        }
        for (const sl of ms.swingLows) {
          if (sl.time < fromT || sl.time > toT) continue;
          const x = timeToX(sl.time);
          const y = priceToY(sl.price);
          if (x === null || y === null) continue;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(34,197,94,0.5)';
          ctx.fill();
        }
      }

      // BOS / CHOCH labels + horizontal dashed line to break point
      for (const lbl of ms.labels) {
        const x1 = timeToX(lbl.time);
        const x2 = timeToX(lbl.breakTime);
        const y = priceToY(lbl.price);
        if (x1 === null || x2 === null || y === null) continue;

        const isBullish = lbl.direction === 'bullish';
        const isChoch = lbl.kind === 'CHOCH';
        const lineColor = isChoch
          ? (isBullish ? 'rgba(168,85,247,0.85)' : 'rgba(168,85,247,0.85)')
          : (isBullish ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)');

        // Horizontal dashed line from swing point to break candle
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.5;
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label box
        const label = lbl.kind;
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        const textW = ctx.measureText(label).width;
        const midX = (x1 + x2) / 2 - textW / 2;
        const boxY = y - (isBullish ? 14 : -4);
        ctx.fillStyle = isChoch ? 'rgba(168,85,247,0.9)' : lineColor;
        ctx.fillRect(midX - 2, boxY, textW + 4, 11);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, midX, boxY + 9);
      }

      // Liquidity sweeps
      if (showSweeps) {
        for (const sw of ms.sweeps) {
          if (sw.sweepCandleTime < fromT || sw.sweepCandleTime > toT) continue;
          const isBull = sw.direction === 'bull_sweep';
          const x = timeToX(sw.sweepCandleTime);
          const y = priceToY(sw.sweptPrice);
          if (x === null || y === null) continue;

          const col = 'rgba(249,115,22,0.9)';
          ctx.beginPath();
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.5;
          ctx.moveTo(x - 20, y);
          ctx.lineTo(x + 20, y);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.font = '11px sans-serif';
          ctx.fillStyle = col;
          ctx.fillText(isBull ? '⚡▲' : '⚡▼', x - 10, isBull ? y - 4 : y + 12);
        }
      }
    }
    // ---- Supply & Demand Zones ----
    if (sdInd) {
      const pivotLen = sdInd.period ?? 5;
      const atrMult = sdInd.sdAtrMult ?? 0.5;
      const strengthThreshold = sdInd.sdStrength ?? 0.4;
      const zones = computeSupplyDemand(candles, pivotLen, atrMult, strengthThreshold);

      for (const z of zones) {
        if (z.endTime < fromT || z.startTime > toT) continue;
        const x1 = timeToX(z.startTime);
        const yTop = priceToY(z.top);
        const yBot = priceToY(z.bottom);
        if (x1 === null || yTop === null || yBot === null) continue;

        const rectX = x1;
        const rectW = rightEdgeX - x1;
        const rectY = Math.min(yTop, yBot);
        const rectH = Math.max(3, Math.abs(yTop - yBot));

        const alpha = 0.1 + z.strength * 0.12;
        const borderAlpha = 0.4 + z.strength * 0.35;

        if (z.type === 'supply') {
          ctx.fillStyle = z.broken
            ? `rgba(239,68,68,${alpha * 0.4})`
            : z.tested
              ? `rgba(239,68,68,${alpha * 0.7})`
              : `rgba(239,68,68,${alpha})`;
          ctx.strokeStyle = z.broken
            ? `rgba(239,68,68,0.15)`
            : `rgba(239,68,68,${borderAlpha})`;
        } else {
          ctx.fillStyle = z.broken
            ? `rgba(34,197,94,${alpha * 0.4})`
            : z.tested
              ? `rgba(34,197,94,${alpha * 0.7})`
              : `rgba(34,197,94,${alpha})`;
          ctx.strokeStyle = z.broken
            ? `rgba(34,197,94,0.15)`
            : `rgba(34,197,94,${borderAlpha})`;
        }

        ctx.lineWidth = 1;
        ctx.setLineDash(z.broken ? [3, 3] : []);
        ctx.fillRect(rectX, rectY, rectW, rectH);
        ctx.strokeRect(rectX, rectY, rectW, rectH);
        ctx.setLineDash([]);

        // Label
        if (rectH > 8) {
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.fillStyle = z.type === 'supply'
            ? `rgba(239,68,68,0.9)` : `rgba(34,197,94,0.9)`;
          const tag = z.type === 'supply'
            ? (z.broken ? 'SS ✗' : z.tested ? 'Supply ◇' : 'Supply')
            : (z.broken ? 'DS ✗' : z.tested ? 'Demand ◇' : 'Demand');
          ctx.fillText(tag, rectX + 3, rectY + Math.min(11, rectH - 2));
        }
      }
    }
  }, [chartRef, seriesRef, candles, fvgInd, msInd, sdInd]);

  // Re-render when data or indicators change
  useEffect(() => {
    if (!fvgInd && !msInd && !sdInd) return;
    render();
  }, [render, fvgInd, msInd, sdInd, candles]);

  // Re-render on zoom/pan
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || (!fvgInd && !msInd && !sdInd)) return;
    const handler = () => render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {}
    };
  }, [chartRef, fvgInd, msInd, sdInd, render]);

  // Also clear canvas when all indicators disabled
  useEffect(() => {
    if (!fvgInd && !msInd && !sdInd) {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [fvgInd, msInd, sdInd]);

  if (!fvgInd && !msInd && !sdInd) return null;

  return <canvas ref={canvasRef} className="absolute inset-0 z-[7] pointer-events-none" />;
};
