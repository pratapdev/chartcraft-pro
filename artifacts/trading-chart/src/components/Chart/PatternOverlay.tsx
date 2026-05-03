import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { computePatterns, PATTERN_LABELS, PATTERN_BIAS_COLOR } from '@/lib/patternDetection';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export const PatternOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicators = useChartStore((s) => s.indicators);
  const candles = useChartStore((s) => s.candles);

  const patInd = indicators.find((i) => i.type === 'PATTERN' && i.visible);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series || candles.length === 0 || !patInd) return;

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

    const pivotLen = patInd.pivotLen ?? 5;
    const patterns = computePatterns(candles, pivotLen);
    if (patterns.length === 0) return;

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
      const pxPerSec = ((lastX as number) - (prevX as number)) / (last.time - prev.time);
      return (lastX as number) + (t - last.time) * pxPerSec;
    };

    const priceToY = (p: number): number | null => {
      const y = series.priceToCoordinate(p);
      return y !== null ? (y as number) : null;
    };

    for (const pat of patterns) {
      // Only draw if overlaps visible range
      if (pat.endTime < fromT || pat.startTime > toT) continue;

      const color = PATTERN_BIAS_COLOR[pat.breakoutBias];
      const alpha = 0.5 + pat.strength * 0.4;

      // Draw upper and lower trendlines over the pattern range
      // We extend slightly past endTime to show projection
      const extendBy = (pat.endTime - pat.startTime) * 0.25;
      const drawEnd = Math.min(
        pat.apexTime != null && pat.apexTime > pat.endTime ? pat.apexTime : pat.endTime + extendBy,
        pat.endTime + extendBy,
      );

      const tPoints = [pat.startTime, drawEnd];

      const upperPts = tPoints.map((t) => {
        const x = timeToX(t);
        const price = pat.upperSlope * t + pat.upperIntercept;
        const y = priceToY(price);
        return x !== null && y !== null ? { x, y } : null;
      });

      const lowerPts = tPoints.map((t) => {
        const x = timeToX(t);
        const price = pat.lowerSlope * t + pat.lowerIntercept;
        const y = priceToY(price);
        return x !== null && y !== null ? { x, y } : null;
      });

      // Fill shaded area between upper and lower
      if (upperPts[0] && upperPts[1] && lowerPts[0] && lowerPts[1]) {
        ctx.beginPath();
        ctx.moveTo(upperPts[0].x, upperPts[0].y);
        ctx.lineTo(upperPts[1].x, upperPts[1].y);
        ctx.lineTo(lowerPts[1].x, lowerPts[1].y);
        ctx.lineTo(lowerPts[0].x, lowerPts[0].y);
        ctx.closePath();
        ctx.fillStyle = color.replace(')', `,${0.07 + pat.strength * 0.05})`).replace('rgb(', 'rgba(');
        // simpler: just use rgba directly
        if (pat.breakoutBias === 'bullish') ctx.fillStyle = `rgba(34,197,94,${0.07 + pat.strength * 0.05})`;
        else if (pat.breakoutBias === 'bearish') ctx.fillStyle = `rgba(239,68,68,${0.07 + pat.strength * 0.05})`;
        else ctx.fillStyle = `rgba(250,204,21,${0.07 + pat.strength * 0.05})`;
        ctx.fill();
      }

      // Upper trendline
      if (upperPts[0] && upperPts[1]) {
        ctx.beginPath();
        ctx.moveTo(upperPts[0].x, upperPts[0].y);
        ctx.lineTo(upperPts[1].x, upperPts[1].y);
        ctx.strokeStyle = pat.breakoutBias === 'bullish'
          ? `rgba(34,197,94,${alpha})`
          : pat.breakoutBias === 'bearish'
            ? `rgba(239,68,68,${alpha})`
            : `rgba(250,204,21,${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.stroke();
      }

      // Lower trendline
      if (lowerPts[0] && lowerPts[1]) {
        ctx.beginPath();
        ctx.moveTo(lowerPts[0].x, lowerPts[0].y);
        ctx.lineTo(lowerPts[1].x, lowerPts[1].y);
        ctx.strokeStyle = pat.breakoutBias === 'bullish'
          ? `rgba(34,197,94,${alpha})`
          : pat.breakoutBias === 'bearish'
            ? `rgba(239,68,68,${alpha})`
            : `rgba(250,204,21,${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Apex dot (converging patterns)
      if (pat.apexTime != null && pat.apexPrice != null) {
        const ax = timeToX(pat.apexTime);
        const ay = priceToY(pat.apexPrice);
        if (ax !== null && ay !== null && ax > 0 && ax < w) {
          ctx.beginPath();
          ctx.arc(ax, ay, 4, 0, Math.PI * 2);
          ctx.fillStyle = pat.breakoutBias === 'bullish' ? '#22c55e' : pat.breakoutBias === 'bearish' ? '#ef4444' : '#facc15';
          ctx.fill();
          ctx.strokeStyle = '#111';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Label badge near the start of the upper line
      if (upperPts[0]) {
        const label = PATTERN_LABELS[pat.kind];
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        const tw = ctx.measureText(label).width;
        const lx = upperPts[0].x + 4;
        const ly = upperPts[0].y - 14;
        const bgColor = pat.breakoutBias === 'bullish'
          ? 'rgba(34,197,94,0.85)'
          : pat.breakoutBias === 'bearish'
            ? 'rgba(239,68,68,0.85)'
            : 'rgba(250,204,21,0.85)';
        ctx.fillStyle = bgColor;
        ctx.fillRect(lx - 2, ly, tw + 8, 12);
        ctx.fillStyle = '#000';
        ctx.fillText(label, lx + 2, ly + 9);

        // Strength bar
        const barW = Math.round(pat.strength * 30);
        ctx.fillStyle = bgColor;
        ctx.fillRect(lx - 2, ly + 13, barW, 2);
      }
    }
  }, [chartRef, seriesRef, candles, patInd]);

  useEffect(() => {
    if (!patInd) {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      return;
    }
    render();
  }, [render, patInd, candles]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !patInd) return;
    const handler = () => render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => { try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {} };
  }, [chartRef, patInd, render]);

  if (!patInd) return null;
  return <canvas ref={canvasRef} className="absolute inset-0 z-[6] pointer-events-none" />;
};
