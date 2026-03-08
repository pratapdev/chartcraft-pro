import React, { useRef, useEffect, useCallback, useState } from 'react';
import { IChartApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { Trendline } from '@/types/trading';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
}

interface DrawState {
  drawing: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export const DrawingOverlay: React.FC<Props> = ({ chartRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  const [drawState, setDrawState] = useState<DrawState>({
    drawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0,
  });

  const [dragging, setDragging] = useState<{ lineId: string; point: 'start' | 'end' | 'body'; offsetX: number; offsetY: number } | null>(null);

  const coordToPrice = useCallback((x: number, y: number) => {
    const chart = chartRef.current;
    if (!chart) return null;
    const ts = chart.timeScale();
    const time = ts.coordinateToTime(x);
    const series = (chart as any)._private__seriesMap?.values()?.next()?.value;
    // Use first series for price conversion
    let price: number | null = null;
    try {
      // Get all series and use first one
      const mainSeries = (chart as any).options ? chart : null;
      if (mainSeries) {
        // lightweight-charts doesn't expose coordinateToPrice directly on chart
        // We need to use the price scale
      }
    } catch {}

    // Approximate price from pixel using chart dimensions
    const container = canvasRef.current?.parentElement;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const visibleRange = ts.getVisibleLogicalRange();
    if (!visibleRange) return null;

    return { time: time ? (time as number) : null, x, y };
  }, [chartRef]);

  // Convert trendline coordinates to pixel positions
  const lineToPixels = useCallback((line: Trendline) => {
    const chart = chartRef.current;
    if (!chart) return null;
    const ts = chart.timeScale();

    const x1 = ts.timeToCoordinate(line.startTime as unknown as Time);
    const x2 = ts.timeToCoordinate(line.endTime as unknown as Time);

    if (x1 === null || x2 === null) return null;

    // Get price to coordinate - we need the candlestick series
    // Access internal series for coordinate conversion
    try {
      const serieses = (chart as any)._private__seriesMap;
      if (serieses) {
        const firstSeries = serieses.values().next().value;
        if (firstSeries) {
          const y1 = firstSeries.priceToCoordinate(line.startPrice);
          const y2 = firstSeries.priceToCoordinate(line.endPrice);
          if (y1 !== null && y2 !== null) {
            return { x1, y1, x2, y2 };
          }
        }
      }
    } catch {}

    return null;
  }, [chartRef]);

  // Render all trendlines
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const line of trendlines) {
      const px = lineToPixels(line);
      if (!px) continue;

      const isSelected = selectedTrendlineId === line.id;

      ctx.beginPath();
      ctx.moveTo(px.x1, px.y1);
      ctx.lineTo(px.x2, px.y2);
      ctx.strokeStyle = line.color;
      ctx.lineWidth = isSelected ? line.thickness + 1 : line.thickness;
      ctx.stroke();

      // Draw endpoints if selected
      if (isSelected) {
        for (const [ex, ey] of [[px.x1, px.y1], [px.x2, px.y2]]) {
          ctx.beginPath();
          ctx.arc(ex, ey, 5, 0, Math.PI * 2);
          ctx.fillStyle = line.color;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // Draw in-progress line
    if (drawState.drawing) {
      ctx.beginPath();
      ctx.moveTo(drawState.startX, drawState.startY);
      ctx.lineTo(drawState.currentX, drawState.currentY);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [trendlines, selectedTrendlineId, drawState, lineToPixels]);

  // Animation loop
  useEffect(() => {
    let raf: number;
    const loop = () => {
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [render]);

  // Hit test - find nearest line within threshold
  const hitTest = useCallback((mx: number, my: number): string | null => {
    const threshold = 8;
    for (const line of trendlines) {
      const px = lineToPixels(line);
      if (!px) continue;

      const dist = pointToLineDistance(mx, my, px.x1, px.y1, px.x2, px.y2);
      if (dist < threshold) return line.id;
    }
    return null;
  }, [trendlines, lineToPixels]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (activeTool === 'trendline') {
      if (!drawState.drawing) {
        setDrawState({ drawing: true, startX: mx, startY: my, currentX: mx, currentY: my });
      }
      return;
    }

    // Cursor mode - select or drag
    if (activeTool === 'cursor') {
      const hitId = hitTest(mx, my);
      setSelectedTrendlineId(hitId);

      if (hitId) {
        const line = trendlines.find((t) => t.id === hitId);
        const px = lineToPixels(line!);
        if (px) {
          // Check if near endpoint
          const d1 = Math.hypot(mx - px.x1, my - px.y1);
          const d2 = Math.hypot(mx - px.x2, my - px.y2);
          if (d1 < 10) {
            setDragging({ lineId: hitId, point: 'start', offsetX: 0, offsetY: 0 });
          } else if (d2 < 10) {
            setDragging({ lineId: hitId, point: 'end', offsetX: 0, offsetY: 0 });
          } else {
            setDragging({ lineId: hitId, point: 'body', offsetX: mx, offsetY: my });
          }
        }
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, [activeTool, drawState.drawing, hitTest, trendlines, lineToPixels, setSelectedTrendlineId]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (drawState.drawing) {
      setDrawState((s) => ({ ...s, currentX: mx, currentY: my }));
      return;
    }

    if (dragging) {
      const chart = chartRef.current;
      if (!chart) return;
      const ts = chart.timeScale();
      const time = ts.coordinateToTime(mx) as unknown as number;

      // Get price from coordinate
      let price: number | null = null;
      try {
        const serieses = (chart as any)._private__seriesMap;
        if (serieses) {
          const firstSeries = serieses.values().next().value;
          if (firstSeries) {
            price = firstSeries.coordinateToPrice(my);
          }
        }
      } catch {}

      if (time && price !== null) {
        if (dragging.point === 'start') {
          updateTrendline(dragging.lineId, { startTime: time, startPrice: price });
        } else if (dragging.point === 'end') {
          updateTrendline(dragging.lineId, { endTime: time, endPrice: price });
        }
      }
      e.preventDefault();
      e.stopPropagation();
    }

    // Update cursor
    if (activeTool === 'cursor') {
      const hitId = hitTest(mx, my);
      if (canvasRef.current) {
        canvasRef.current.style.cursor = hitId ? 'pointer' : 'default';
      }
    } else if (activeTool === 'trendline') {
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'crosshair';
      }
    }
  }, [drawState.drawing, dragging, activeTool, hitTest, chartRef, updateTrendline]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (drawState.drawing && activeTool === 'trendline') {
      const chart = chartRef.current;
      if (!chart) return;

      const ts = chart.timeScale();
      const t1 = ts.coordinateToTime(drawState.startX) as unknown as number;
      const t2 = ts.coordinateToTime(mx) as unknown as number;

      let p1: number | null = null;
      let p2: number | null = null;
      try {
        const serieses = (chart as any)._private__seriesMap;
        if (serieses) {
          const firstSeries = serieses.values().next().value;
          if (firstSeries) {
            p1 = firstSeries.coordinateToPrice(drawState.startY);
            p2 = firstSeries.coordinateToPrice(my);
          }
        }
      } catch {}

      if (t1 && t2 && p1 !== null && p2 !== null) {
        const dist = Math.hypot(mx - drawState.startX, my - drawState.startY);
        if (dist > 10) {
          addTrendline({
            id: crypto.randomUUID(),
            symbol,
            timeframe,
            startTime: t1,
            startPrice: p1,
            endTime: t2,
            endPrice: p2,
            color: '#2563eb',
            thickness: 2,
            createdAt: Date.now(),
          });
        }
      }

      setDrawState({ drawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
      setActiveTool('cursor');
      return;
    }

    if (dragging) {
      setDragging(null);
    }
  }, [drawState, activeTool, chartRef, addTrendline, symbol, timeframe, setActiveTool, dragging]);

  // Handle delete key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTrendlineId) {
        removeTrendline(selectedTrendlineId);
      }
      if (e.key === 'Escape') {
        setSelectedTrendlineId(null);
        setDrawState({ drawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
        setActiveTool('cursor');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedTrendlineId, removeTrendline, setSelectedTrendlineId, setActiveTool]);

  const pointerEvents = activeTool !== 'cursor' || drawState.drawing || dragging || hitTest
    ? 'auto' : 'none';

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10"
      style={{
        pointerEvents: activeTool === 'trendline' || dragging ? 'auto' : 'auto',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    />
  );
};

// Utility: distance from point to line segment
function pointToLineDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): number {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = lenSq !== 0 ? dot / lenSq : -1;
  let xx: number, yy: number;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  return Math.hypot(px - xx, py - yy);
}
