import React, { useRef, useEffect, useCallback, useState } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { Trendline } from '@/types/trading';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

type DrawPhase = 'idle' | 'drawing';
interface DrawState { phase: DrawPhase; startX: number; startY: number; currentX: number; currentY: number; }
const EMPTY_DRAW: DrawState = { phase: 'idle', startX: 0, startY: 0, currentX: 0, currentY: 0 };

export const DrawingOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eventLayerRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef(EMPTY_DRAW);
  const dragRef = useRef<{
    lineId: string;
    point: 'start' | 'end' | 'body';
    startMX: number;
    startMY: number;
    origLine: Trendline;
  } | null>(null);

  const [isInteracting, setIsInteracting] = useState(false);
  const [, bump] = useState(0);

  const {
    activeTool,
    setActiveTool,
    trendlines,
    addTrendline,
    updateTrendline,
    removeTrendline,
    selectedTrendlineId,
    setSelectedTrendlineId,
    symbol,
    timeframe,
  } = useChartStore();

  // ---- Coordinate helpers ----
  const pixelToCoords = useCallback(
    (x: number, y: number) => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return null;
      const price = series.coordinateToPrice(y);
      if (price === null) return null;

      let time = chart.timeScale().coordinateToTime(x);
      if (time === null) {
        // Extrapolate into the future using the last two candles' spacing
        const { candles: c } = useChartStore.getState();
        if (c.length < 2) return null;
        const lastTime = c[c.length - 1].time;
        const interval = c[c.length - 1].time - c[c.length - 2].time;
        const lastX = chart.timeScale().timeToCoordinate(lastTime as unknown as Time);
        if (lastX === null) return null;
        const pxPerBar = (() => {
          const prevX = chart.timeScale().timeToCoordinate(c[c.length - 2].time as unknown as Time);
          if (prevX === null) return 10;
          return lastX - prevX;
        })();
        if (pxPerBar <= 0) return null;
        const barsAhead = (x - lastX) / pxPerBar;
        time = (lastTime + Math.round(barsAhead) * interval) as unknown as Time;
      }
      return { time: time as unknown as number, price: price as number };
    },
    [chartRef, seriesRef]
  );

  const timeToPixel = useCallback(
    (t: number) => {
      const chart = chartRef.current;
      if (!chart) return null;
      const px = chart.timeScale().timeToCoordinate(t as unknown as Time);
      if (px !== null) return px;
      // Extrapolate for future times
      const { candles: c } = useChartStore.getState();
      if (c.length < 2) return null;
      const lastTime = c[c.length - 1].time;
      const interval = c[c.length - 1].time - c[c.length - 2].time;
      const lastX = chart.timeScale().timeToCoordinate(lastTime as unknown as Time);
      const prevX = chart.timeScale().timeToCoordinate(c[c.length - 2].time as unknown as Time);
      if (lastX === null || prevX === null) return null;
      const pxPerBar = lastX - prevX;
      if (pxPerBar <= 0) return null;
      return lastX + ((t - lastTime) / interval) * pxPerBar;
    },
    [chartRef]
  );

  const lineToPixels = useCallback(
    (line: Trendline) => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return null;
      const x1 = timeToPixel(line.startTime);
      const x2 = timeToPixel(line.endTime);
      const y1 = series.priceToCoordinate(line.startPrice);
      const y2 = series.priceToCoordinate(line.endPrice);
      if (x1 === null || x2 === null || y1 === null || y2 === null) return null;
      return { x1, y1: y1 as number, x2, y2: y2 as number };
    },
    [chartRef, seriesRef, timeToPixel]
  );

  const hitTest = useCallback(
    (mx: number, my: number) => {
      for (let i = trendlines.length - 1; i >= 0; i--) {
        const px = lineToPixels(trendlines[i]);
        if (!px) continue;
        if (ptLineDist(mx, my, px.x1, px.y1, px.x2, px.y2) < 8) return trendlines[i].id;
      }
      return null;
    },
    [trendlines, lineToPixels]
  );

  // ---- Canvas render ----
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);

    for (const line of trendlines) {
      const px = lineToPixels(line);
      if (!px) continue;
      const sel = selectedTrendlineId === line.id;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(px.x1, px.y1);
      ctx.lineTo(px.x2, px.y2);
      ctx.strokeStyle = line.color;
      ctx.lineWidth = sel ? line.thickness + 1.5 : line.thickness;
      if (sel) {
        ctx.shadowColor = line.color;
        ctx.shadowBlur = 8;
      }
      ctx.stroke();
      ctx.restore();

      if (sel) {
        for (const [ex, ey] of [[px.x1, px.y1], [px.x2, px.y2]]) {
          ctx.beginPath();
          ctx.arc(ex, ey, 5, 0, Math.PI * 2);
          ctx.fillStyle = line.color;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    const ds = drawRef.current;
    if (ds.phase === 'drawing') {
      ctx.beginPath();
      ctx.moveTo(ds.startX, ds.startY);
      ctx.lineTo(ds.currentX, ds.currentY);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(ds.startX, ds.startY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#2563eb';
      ctx.fill();
    }
  }, [trendlines, selectedTrendlineId, lineToPixels]);

  useEffect(() => {
    let raf: number;
    const loop = () => { render(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [render]);

  // ---- Event handlers ----
  const getPos = (e: MouseEvent | React.MouseEvent) => {
    const rect = eventLayerRef.current?.getBoundingClientRect();
    if (!rect) return { mx: 0, my: 0 };
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  };

  const [hoveringLine, setHoveringLine] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const { mx, my } = getPos(e);

      if (activeTool === 'trendline') {
        drawRef.current = { phase: 'drawing', startX: mx, startY: my, currentX: mx, currentY: my };
        setIsInteracting(true);
        bump((n) => n + 1);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Cursor: check hit
      const hitId = hitTest(mx, my);
      if (hitId) {
        setSelectedTrendlineId(hitId);
        const line = trendlines.find((t) => t.id === hitId)!;
        const px = lineToPixels(line);
        if (px) {
          const d1 = Math.hypot(mx - px.x1, my - px.y1);
          const d2 = Math.hypot(mx - px.x2, my - px.y2);
          const point = d1 < 12 ? 'start' : d2 < 12 ? 'end' : 'body';
          dragRef.current = { lineId: hitId, point, startMX: mx, startMY: my, origLine: { ...line } };
        }
        setIsInteracting(true);
        e.preventDefault();
        e.stopPropagation();
      } else {
        setSelectedTrendlineId(null);
      }
    },
    [activeTool, hitTest, trendlines, lineToPixels, setSelectedTrendlineId]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { mx, my } = getPos(e);

      if (drawRef.current.phase === 'drawing') {
        drawRef.current = { ...drawRef.current, currentX: mx, currentY: my };
        return;
      }

      if (dragRef.current) {
        const coords = pixelToCoords(mx, my);
        if (!coords) return;
        const drag = dragRef.current;

        if (drag.point === 'start') {
          updateTrendline(drag.lineId, { startTime: coords.time, startPrice: coords.price });
        } else if (drag.point === 'end') {
          updateTrendline(drag.lineId, { endTime: coords.time, endPrice: coords.price });
        } else {
          const startCoords = pixelToCoords(drag.startMX, drag.startMY);
          if (!startCoords) return;
          updateTrendline(drag.lineId, {
            startTime: drag.origLine.startTime + (coords.time - startCoords.time),
            startPrice: drag.origLine.startPrice + (coords.price - startCoords.price),
            endTime: drag.origLine.endTime + (coords.time - startCoords.time),
            endPrice: drag.origLine.endPrice + (coords.price - startCoords.price),
          });
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Update cursor and hover state
      if (eventLayerRef.current) {
        if (activeTool === 'trendline') {
          eventLayerRef.current.style.cursor = 'crosshair';
        } else {
          const isHit = !!hitTest(mx, my);
          setHoveringLine(isHit);
          eventLayerRef.current.style.cursor = isHit ? 'pointer' : '';
        }
      }
    },
    [activeTool, hitTest, pixelToCoords, updateTrendline]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const { mx, my } = getPos(e);

      if (drawRef.current.phase === 'drawing') {
        const ds = drawRef.current;
        const dist = Math.hypot(mx - ds.startX, my - ds.startY);
        if (dist > 10) {
          const start = pixelToCoords(ds.startX, ds.startY);
          const end = pixelToCoords(mx, my);
          if (start && end) {
            addTrendline({
              id: crypto.randomUUID(),
              symbol,
              timeframe,
              startTime: start.time,
              startPrice: start.price,
              endTime: end.time,
              endPrice: end.price,
              color: '#2563eb',
              thickness: 2,
              createdAt: Date.now(),
            });
          }
        }
        drawRef.current = EMPTY_DRAW;
        setActiveTool('cursor');
        setIsInteracting(false);
        bump((n) => n + 1);
        return;
      }

      if (dragRef.current) {
        dragRef.current = null;
        setIsInteracting(false);
      }
    },
    [pixelToCoords, addTrendline, symbol, timeframe, setActiveTool]
  );

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTrendlineId) {
        removeTrendline(selectedTrendlineId);
      }
      if (e.key === 'Escape') {
        setSelectedTrendlineId(null);
        drawRef.current = EMPTY_DRAW;
        setActiveTool('cursor');
        setIsInteracting(false);
        bump((n) => n + 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedTrendlineId, removeTrendline, setSelectedTrendlineId, setActiveTool]);

  // Event layer should capture when: drawing tool active, or actively interacting
  const shouldCapture = activeTool === 'trendline' || activeTool === 'cursor' || isInteracting;

  return (
    <>
      {/* Render-only canvas - never captures events */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10 pointer-events-none" />

      {/* Event capture layer - only active during drawing/dragging */}
      <div
        ref={eventLayerRef}
        className="absolute inset-0 z-20"
        style={{ pointerEvents: shouldCapture ? 'auto' : 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (dragRef.current) { dragRef.current = null; setIsInteracting(false); }
        }}
      />
    </>
  );
};

function ptLineDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  const param = lenSq ? dot / lenSq : -1;
  let xx: number, yy: number;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  return Math.hypot(px - xx, py - yy);
}
