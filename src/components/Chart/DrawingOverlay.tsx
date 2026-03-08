import React, { useRef, useEffect, useCallback, useState } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { Trendline } from '@/types/trading';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

interface DrawState {
  phase: 'idle' | 'drawing';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const INITIAL_DRAW: DrawState = { phase: 'idle', startX: 0, startY: 0, currentX: 0, currentY: 0 };

export const DrawingOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawStateRef = useRef<DrawState>(INITIAL_DRAW);
  const draggingRef = useRef<{
    lineId: string;
    point: 'start' | 'end' | 'body';
    startMX: number;
    startMY: number;
    origLine: Trendline;
  } | null>(null);
  const [, forceRender] = useState(0);

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

  // Helper: pixel → price/time using the ACTUAL series API
  const pixelToCoords = useCallback(
    (x: number, y: number): { time: number; price: number } | null => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return null;
      const time = chart.timeScale().coordinateToTime(x);
      const price = series.coordinateToPrice(y);
      if (time === null || price === null) return null;
      return { time: time as unknown as number, price };
    },
    [chartRef, seriesRef]
  );

  // Helper: trendline → pixel positions
  const lineToPixels = useCallback(
    (line: Trendline): { x1: number; y1: number; x2: number; y2: number } | null => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return null;
      const x1 = chart.timeScale().timeToCoordinate(line.startTime as unknown as Time);
      const x2 = chart.timeScale().timeToCoordinate(line.endTime as unknown as Time);
      const y1 = series.priceToCoordinate(line.startPrice);
      const y2 = series.priceToCoordinate(line.endPrice);
      if (x1 === null || x2 === null || y1 === null || y2 === null) return null;
      return { x1, y1, x2, y2 };
    },
    [chartRef, seriesRef]
  );

  // Hit test
  const hitTest = useCallback(
    (mx: number, my: number): string | null => {
      for (let i = trendlines.length - 1; i >= 0; i--) {
        const line = trendlines[i];
        const px = lineToPixels(line);
        if (!px) continue;
        if (ptLineDist(mx, my, px.x1, px.y1, px.x2, px.y2) < 8) return line.id;
      }
      return null;
    },
    [trendlines, lineToPixels]
  );

  // ---- Render loop ----
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

    // Draw trendlines
    for (const line of trendlines) {
      const px = lineToPixels(line);
      if (!px) continue;
      const sel = selectedTrendlineId === line.id;

      // Extend line beyond endpoints (ray-style)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(px.x1, px.y1);
      ctx.lineTo(px.x2, px.y2);
      ctx.strokeStyle = line.color;
      ctx.lineWidth = sel ? line.thickness + 1.5 : line.thickness;
      if (sel) {
        ctx.shadowColor = line.color;
        ctx.shadowBlur = 6;
      }
      ctx.stroke();
      ctx.restore();

      // Endpoints
      if (sel) {
        for (const [ex, ey] of [
          [px.x1, px.y1],
          [px.x2, px.y2],
        ]) {
          ctx.beginPath();
          ctx.arc(ex, ey, 5, 0, Math.PI * 2);
          ctx.fillStyle = line.color;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ex, ey, 5, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // In-progress drawing
    const ds = drawStateRef.current;
    if (ds.phase === 'drawing') {
      ctx.beginPath();
      ctx.moveTo(ds.startX, ds.startY);
      ctx.lineTo(ds.currentX, ds.currentY);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start point dot
      ctx.beginPath();
      ctx.arc(ds.startX, ds.startY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#2563eb';
      ctx.fill();
    }
  }, [trendlines, selectedTrendlineId, lineToPixels]);

  useEffect(() => {
    let raf: number;
    const loop = () => {
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [render]);

  // ---- Mouse handlers ----
  const getMousePos = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { mx: 0, my: 0 };
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  };

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const { mx, my } = getMousePos(e);

      if (activeTool === 'trendline') {
        // Start drawing
        drawStateRef.current = { phase: 'drawing', startX: mx, startY: my, currentX: mx, currentY: my };
        forceRender((n) => n + 1);
        e.stopPropagation();
        return;
      }

      // Cursor mode
      const hitId = hitTest(mx, my);
      setSelectedTrendlineId(hitId);

      if (hitId) {
        const line = trendlines.find((t) => t.id === hitId)!;
        const px = lineToPixels(line);
        if (px) {
          const d1 = Math.hypot(mx - px.x1, my - px.y1);
          const d2 = Math.hypot(mx - px.x2, my - px.y2);
          const point = d1 < 12 ? 'start' : d2 < 12 ? 'end' : 'body';
          draggingRef.current = { lineId: hitId, point, startMX: mx, startMY: my, origLine: { ...line } };
        }
        e.stopPropagation();
        e.preventDefault();
      }
    },
    [activeTool, hitTest, trendlines, lineToPixels, setSelectedTrendlineId]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { mx, my } = getMousePos(e);
      const ds = drawStateRef.current;

      // Drawing in progress
      if (ds.phase === 'drawing') {
        drawStateRef.current = { ...ds, currentX: mx, currentY: my };
        return;
      }

      // Dragging a trendline
      const drag = draggingRef.current;
      if (drag) {
        const coords = pixelToCoords(mx, my);
        if (!coords) return;

        if (drag.point === 'start') {
          updateTrendline(drag.lineId, { startTime: coords.time, startPrice: coords.price });
        } else if (drag.point === 'end') {
          updateTrendline(drag.lineId, { endTime: coords.time, endPrice: coords.price });
        } else {
          // Body drag: move both endpoints by delta
          const startCoords = pixelToCoords(drag.startMX, drag.startMY);
          if (!startCoords) return;
          const dt = coords.time - startCoords.time;
          const dp = coords.price - startCoords.price;
          updateTrendline(drag.lineId, {
            startTime: drag.origLine.startTime + dt,
            startPrice: drag.origLine.startPrice + dp,
            endTime: drag.origLine.endTime + dt,
            endPrice: drag.origLine.endPrice + dp,
          });
        }
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // Cursor style
      if (canvasRef.current) {
        if (activeTool === 'trendline') {
          canvasRef.current.style.cursor = 'crosshair';
        } else {
          const hit = hitTest(mx, my);
          canvasRef.current.style.cursor = hit ? 'pointer' : '';
        }
      }
    },
    [activeTool, hitTest, pixelToCoords, updateTrendline]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const { mx, my } = getMousePos(e);
      const ds = drawStateRef.current;

      // Finish drawing trendline
      if (ds.phase === 'drawing') {
        const dist = Math.hypot(mx - ds.startX, my - ds.startY);
        if (dist > 10) {
          const startCoords = pixelToCoords(ds.startX, ds.startY);
          const endCoords = pixelToCoords(mx, my);
          if (startCoords && endCoords) {
            addTrendline({
              id: crypto.randomUUID(),
              symbol,
              timeframe,
              startTime: startCoords.time,
              startPrice: startCoords.price,
              endTime: endCoords.time,
              endPrice: endCoords.price,
              color: '#2563eb',
              thickness: 2,
              createdAt: Date.now(),
            });
          }
        }
        drawStateRef.current = INITIAL_DRAW;
        setActiveTool('cursor');
        forceRender((n) => n + 1);
        return;
      }

      // Finish dragging
      if (draggingRef.current) {
        draggingRef.current = null;
      }
    },
    [pixelToCoords, addTrendline, symbol, timeframe, setActiveTool]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTrendlineId) {
        removeTrendline(selectedTrendlineId);
      }
      if (e.key === 'Escape') {
        setSelectedTrendlineId(null);
        drawStateRef.current = INITIAL_DRAW;
        setActiveTool('cursor');
        forceRender((n) => n + 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedTrendlineId, removeTrendline, setSelectedTrendlineId, setActiveTool]);

  // Determine pointer-events: let chart handle events in cursor mode when not near lines
  const shouldCapture =
    activeTool === 'trendline' ||
    drawStateRef.current.phase === 'drawing' ||
    draggingRef.current !== null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10"
      style={{ pointerEvents: shouldCapture ? 'auto' : 'auto' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (draggingRef.current) draggingRef.current = null;
      }}
    />
  );
};

// Distance from point to line segment
function ptLineDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const A = px - x1,
    B = py - y1,
    C = x2 - x1,
    D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  const param = lenSq !== 0 ? dot / lenSq : -1;
  let xx: number, yy: number;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  return Math.hypot(px - xx, py - yy);
}
