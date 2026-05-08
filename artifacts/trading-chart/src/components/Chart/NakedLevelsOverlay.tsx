import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { buildProfile, groupBySession } from '@/lib/volumeProfile';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

interface NakedLevel {
  kind: 'POC' | 'VAH' | 'VAL';
  price: number;
  startTime: number;
  endTime: number; // either time of touching candle or last candle time
  touched: boolean;
  sessionLabel: string;
}

/** Naked POC / VAH / VAL — per-session levels extended right until price touches them. */
export const NakedLevelsOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicators = useChartStore((s) => s.indicators);
  const candles = useChartStore((s) => s.candles);

  const ind = indicators.find((i) => i.type === 'NAKED_LEVELS' && i.visible);

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

    if (candles.length < 2) return;

    const sessions = groupBySession(candles, 86400);
    if (sessions.length < 2) return;

    const lastTime = candles[candles.length - 1].time;
    const levels: NakedLevel[] = [];

    // Compute profile for each completed session (skip the current/in-progress session)
    for (let i = 0; i < sessions.length - 1; i++) {
      const session = sessions[i];
      const profile = buildProfile(session, { targetRows: 24, valueAreaPct: 0.7 });
      if (!profile) continue;

      const sessionEnd = session[session.length - 1].time;
      const dateLabel = new Date(session[0].time * 1000).toISOString().slice(5, 10);
      const future = candles.filter((c) => c.time > sessionEnd);

      const checkLevel = (price: number, kind: 'POC' | 'VAH' | 'VAL') => {
        let touchTime: number | null = null;
        for (const c of future) {
          if (c.low <= price && c.high >= price) {
            touchTime = c.time;
            break;
          }
        }
        levels.push({
          kind,
          price,
          startTime: sessionEnd,
          endTime: touchTime ?? lastTime,
          touched: touchTime !== null,
          sessionLabel: dateLabel,
        });
      };
      checkLevel(profile.poc, 'POC');
      checkLevel(profile.vah, 'VAH');
      checkLevel(profile.val, 'VAL');
    }

    // Draw only naked (untouched) levels
    const naked = levels.filter((l) => !l.touched);

    const colorFor = (k: NakedLevel['kind']) =>
      k === 'POC' ? 'rgba(255, 215, 0, 0.85)' :
      k === 'VAH' ? 'rgba(96, 165, 250, 0.7)' :
                    'rgba(248, 113, 113, 0.7)';

    for (const lvl of naked) {
      const y = series.priceToCoordinate(lvl.price);
      if (y === null) continue;
      const xStart = chart.timeScale().timeToCoordinate(lvl.startTime as any);
      if (xStart === null) continue;
      const xEnd = w - 65; // extend to price scale

      ctx.strokeStyle = colorFor(lvl.kind);
      ctx.lineWidth = lvl.kind === 'POC' ? 1.4 : 1;
      ctx.setLineDash(lvl.kind === 'POC' ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(xStart as number, y as number);
      ctx.lineTo(xEnd, y as number);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label at right end
      ctx.fillStyle = colorFor(lvl.kind);
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`n${lvl.kind} ${lvl.sessionLabel} ${lvl.price.toFixed(2)}`, xEnd - 4, (y as number) - 3);
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
