import React, { useRef, useEffect, useCallback, useState } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { Trendline, FibonacciDrawing, AlertCondition } from '@/types/trading';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

type DrawPhase = 'idle' | 'drawing';
interface DrawState { phase: DrawPhase; startX: number; startY: number; currentX: number; currentY: number; }
const EMPTY_DRAW: DrawState = { phase: 'idle', startX: 0, startY: 0, currentX: 0, currentY: 0 };

interface MeasureState {
  phase: 'idle' | 'measuring';
  startX: number; startY: number;
  currentX: number; currentY: number;
  startPrice: number; currentPrice: number;
  startTime: number; currentTime: number;
}
const EMPTY_MEASURE: MeasureState = { phase: 'idle', startX: 0, startY: 0, currentX: 0, currentY: 0, startPrice: 0, currentPrice: 0, startTime: 0, currentTime: 0 };

interface FibDrawState {
  phase: 'idle' | 'drawing';
  startX: number; startY: number;
  currentX: number; currentY: number;
  startPrice: number; currentPrice: number;
  startTime: number; currentTime: number;
}
const EMPTY_FIB: FibDrawState = { phase: 'idle', startX: 0, startY: 0, currentX: 0, currentY: 0, startPrice: 0, currentPrice: 0, startTime: 0, currentTime: 0 };

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS: Record<number, string> = {
  0: '#787b86',
  0.236: '#f44336',
  0.382: '#ff9800',
  0.5: '#4caf50',
  0.618: '#089981',
  0.786: '#00bcd4',
  1: '#787b86',
};

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
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [, bump] = useState(0);
  const [selectedFibId, setSelectedFibId] = useState<string | null>(null);
  const [fibDeletePos, setFibDeletePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredAlertBtn, setHoveredAlertBtn] = useState<string | null>(null);
  const measureRef = useRef<MeasureState>(EMPTY_MEASURE);
  const fibRef = useRef<FibDrawState>(EMPTY_FIB);

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
    fibonacciDrawings,
    addFibonacci,
    removeFibonacci,
    addAlert,
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
      const style = line.lineStyle ?? 'solid';
      if (style === 'dashed') ctx.setLineDash([8, 5]);
      else if (style === 'dotted') ctx.setLineDash([2, 3]);
      else ctx.setLineDash([]);
      if (sel) {
        ctx.shadowColor = line.color;
        ctx.shadowBlur = 8;
      }
      ctx.stroke();
      ctx.setLineDash([]);
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

      // ⊕ Alert button for horizontal lines (startPrice === endPrice)
      const isHorizontal = Math.abs(line.startPrice - line.endPrice) < 0.0001;
      if (isHorizontal) {
        const btnX = w - 80; // Position near the right price scale
        const btnY = px.y1;
        const btnR = 10;
        const isHovered = hoveredAlertBtn === line.id;

        // Circle background
        ctx.beginPath();
        ctx.arc(btnX, btnY, btnR, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#2563eb' : 'rgba(37, 99, 235, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Plus icon
        ctx.beginPath();
        ctx.moveTo(btnX - 5, btnY);
        ctx.lineTo(btnX + 5, btnY);
        ctx.moveTo(btnX, btnY - 5);
        ctx.lineTo(btnX, btnY + 5);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    }

    // Horizontal tool hover preview
    if (activeTool === 'horizontal' && hoverY !== null) {
      ctx.beginPath();
      ctx.moveTo(0, hoverY);
      ctx.lineTo(w, hoverY);
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
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

    // Measure tool rendering
    const ms = measureRef.current;
    if (ms.phase === 'measuring') {
      const x1 = Math.min(ms.startX, ms.currentX);
      const y1 = Math.min(ms.startY, ms.currentY);
      const x2 = Math.max(ms.startX, ms.currentX);
      const y2 = Math.max(ms.startY, ms.currentY);

      // Shaded rectangle
      ctx.fillStyle = ms.currentPrice >= ms.startPrice ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeStyle = ms.currentPrice >= ms.startPrice ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.setLineDash([]);

      // Diagonal line
      ctx.beginPath();
      ctx.moveTo(ms.startX, ms.startY);
      ctx.lineTo(ms.currentX, ms.currentY);
      ctx.strokeStyle = ms.currentPrice >= ms.startPrice ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Info box
      const priceDiff = ms.currentPrice - ms.startPrice;
      const pctChange = ms.startPrice !== 0 ? (priceDiff / ms.startPrice) * 100 : 0;
      const { candles: c } = useChartStore.getState();
      let barCount = 0;
      if (c.length >= 2) {
        const interval = c[c.length - 1].time - c[c.length - 2].time;
        if (interval > 0) barCount = Math.round(Math.abs(ms.currentTime - ms.startTime) / interval);
      }

      const isUp = priceDiff >= 0;
      const sign = isUp ? '+' : '';
      const lines = [
        `${sign}${priceDiff.toFixed(2)}  (${sign}${pctChange.toFixed(2)}%)`,
        `${barCount} bars`,
      ];

      const boxW = 200;
      const boxH = 48;
      const boxX = ms.currentX + 12;
      const boxY = ms.currentY - boxH / 2;

      // Box background
      ctx.fillStyle = 'rgba(17,24,39,0.92)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 6);
      ctx.fill();
      ctx.strokeStyle = isUp ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 6);
      ctx.stroke();

      // Text
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = isUp ? '#22c55e' : '#ef4444';
      ctx.fillText(lines[0], boxX + 10, boxY + 20);
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(lines[1], boxX + 10, boxY + 38);

      // Start/end dots
      for (const [dx, dy] of [[ms.startX, ms.startY], [ms.currentX, ms.currentY]]) {
        ctx.beginPath();
        ctx.arc(dx, dy, 4, 0, Math.PI * 2);
        ctx.fillStyle = isUp ? '#22c55e' : '#ef4444';
        ctx.fill();
      }
    }

    // Render persisted Fibonacci drawings
    const series = seriesRef.current;
    if (series) {
      for (const fib of fibonacciDrawings) {
        const isSelected = selectedFibId === fib.id;
        renderFibLevels(ctx, fib, w, series, isSelected);
      }
    }

    // Render in-progress Fibonacci drawing
    const fs = fibRef.current;
    if (fs.phase === 'drawing' && series) {
      const tempFib: FibDrawState = fs;
      renderFibPreview(ctx, tempFib, w, series);
    }
  }, [trendlines, selectedTrendlineId, lineToPixels, activeTool, hoverY, fibonacciDrawings, selectedFibId, hoveredAlertBtn]);

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

      if (activeTool === 'horizontal') {
        // Single-click placement like TradingView
        const coords = pixelToCoords(mx, my);
        if (coords) {
          const { candles: c } = useChartStore.getState();
          const startTime = c.length > 0 ? c[0].time : coords.time - 86400;
          const endTime = c.length > 0 ? c[c.length - 1].time + (c.length > 1 ? (c[c.length - 1].time - c[0].time) : 86400) : coords.time + 86400;
          addTrendline({
            id: crypto.randomUUID(),
            symbol,
            timeframe,
            startTime,
            startPrice: coords.price,
            endTime,
            endPrice: coords.price,
            color: '#eab308',
            thickness: 2,
            createdAt: Date.now(),
          });
        }
        setActiveTool('cursor');
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (activeTool === 'trendline') {
        drawRef.current = { phase: 'drawing', startX: mx, startY: my, currentX: mx, currentY: my };
        setIsInteracting(true);
        bump((n) => n + 1);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (activeTool === 'fibonacci') {
        const coords = pixelToCoords(mx, my);
        if (coords) {
          fibRef.current = {
            phase: 'drawing', startX: mx, startY: my, currentX: mx, currentY: my,
            startPrice: coords.price, currentPrice: coords.price,
            startTime: coords.time, currentTime: coords.time,
          };
          setIsInteracting(true);
          bump((n) => n + 1);
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (activeTool === 'measure') {
        const coords = pixelToCoords(mx, my);
        if (coords) {
          measureRef.current = {
            phase: 'measuring', startX: mx, startY: my, currentX: mx, currentY: my,
            startPrice: coords.price, currentPrice: coords.price,
            startTime: coords.time, currentTime: coords.time,
          };
          setIsInteracting(true);
          bump((n) => n + 1);
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Cursor: check trendline hit first
      const hitId = hitTest(mx, my);
      if (hitId) {
        setSelectedTrendlineId(hitId);
        setSelectedFibId(null);
        setFibDeletePos(null);
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
        return;
      }

      // Check fibonacci hit
      const series = seriesRef.current;
      if (series && fibonacciDrawings.length > 0) {
        for (const fib of fibonacciDrawings) {
          const diff = fib.endPrice - fib.startPrice;
          for (const level of FIB_LEVELS) {
            const price = fib.endPrice - diff * level;
            const y = series.priceToCoordinate(price);
            if (y !== null && Math.abs(my - (y as number)) < 8) {
              setSelectedFibId(fib.id);
              setSelectedTrendlineId(null);
              // Position delete button near click
              const midY = series.priceToCoordinate(fib.endPrice - diff * 0.5);
              setFibDeletePos({ x: mx, y: midY !== null ? (midY as number) : my });
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
        }
      }

      setSelectedTrendlineId(null);
      setSelectedFibId(null);
      setFibDeletePos(null);
    },
    [activeTool, hitTest, trendlines, lineToPixels, setSelectedTrendlineId, pixelToCoords, addTrendline, symbol, timeframe, setActiveTool]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { mx, my } = getPos(e);

      if (drawRef.current.phase === 'drawing') {
        drawRef.current = { ...drawRef.current, currentX: mx, currentY: my };
        return;
      }

      if (measureRef.current.phase === 'measuring') {
        const coords = pixelToCoords(mx, my);
        if (coords) {
          measureRef.current = { ...measureRef.current, currentX: mx, currentY: my, currentPrice: coords.price, currentTime: coords.time };
          bump((n) => n + 1);
        }
        return;
      }

      if (fibRef.current.phase === 'drawing') {
        const coords = pixelToCoords(mx, my);
        if (coords) {
          fibRef.current = { ...fibRef.current, currentX: mx, currentY: my, currentPrice: coords.price, currentTime: coords.time };
          bump((n) => n + 1);
        }
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
      if (activeTool === 'horizontal' || activeTool === 'measure' || activeTool === 'fibonacci') {
        if (activeTool === 'horizontal') setHoverY(my);
        if (eventLayerRef.current) eventLayerRef.current.style.cursor = 'crosshair';
      } else if (eventLayerRef.current) {
        setHoverY(null);
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

      if (measureRef.current.phase === 'measuring') {
        measureRef.current = EMPTY_MEASURE;
        setIsInteracting(false);
        bump((n) => n + 1);
        return;
      }

      if (fibRef.current.phase === 'drawing') {
        const fs = fibRef.current;
        const dist = Math.hypot(mx - fs.startX, my - fs.startY);
        if (dist > 10) {
          // Ensure left-to-right ordering
          const [sTime, sPrice, eTime, ePrice] = fs.startTime <= fs.currentTime
            ? [fs.startTime, fs.startPrice, fs.currentTime, fs.currentPrice]
            : [fs.currentTime, fs.currentPrice, fs.startTime, fs.startPrice];
          addFibonacci({
            id: crypto.randomUUID(),
            symbol,
            timeframe,
            startTime: sTime,
            startPrice: sPrice,
            endTime: eTime,
            endPrice: ePrice,
            createdAt: Date.now(),
          });
        }
        fibRef.current = EMPTY_FIB;
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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTrendlineId) removeTrendline(selectedTrendlineId);
        if (selectedFibId) {
          removeFibonacci(selectedFibId);
          setSelectedFibId(null);
          setFibDeletePos(null);
        }
      }
      if (e.key === 'Escape') {
        setSelectedTrendlineId(null);
        setSelectedFibId(null);
        setFibDeletePos(null);
        drawRef.current = EMPTY_DRAW;
        measureRef.current = EMPTY_MEASURE;
        fibRef.current = EMPTY_FIB;
        setActiveTool('cursor');
        setIsInteracting(false);
        bump((n) => n + 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedTrendlineId, selectedFibId, removeTrendline, removeFibonacci, setSelectedTrendlineId, setActiveTool]);

  // Event layer should capture when: drawing tool active, or actively dragging, or trendlines exist in cursor mode
  const shouldCapture = activeTool === 'trendline' || activeTool === 'horizontal' || activeTool === 'measure' || activeTool === 'fibonacci' || isInteracting || (activeTool === 'cursor' && (trendlines.length > 0 || fibonacciDrawings.length > 0));

  return (
    <>
      {/* Render-only canvas - never captures events */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10 pointer-events-none" />

      {/* Event capture layer - leave right (price scale) and bottom (time scale) uncovered for resize dragging */}
      <div
        ref={eventLayerRef}
        className="absolute top-0 left-0 z-20"
        style={{ right: 65, bottom: 28, pointerEvents: shouldCapture ? 'auto' : 'none' }}
        onMouseDown={(e) => {
          const { mx, my } = getPos(e.nativeEvent);
          // In cursor mode, check trendline and fib hits
          if (activeTool === 'cursor' && !hitTest(mx, my)) {
            // Check if clicking on a fib level
            const series = seriesRef.current;
            let fibHit = false;
            if (series) {
              for (const fib of fibonacciDrawings) {
                const diff = fib.endPrice - fib.startPrice;
                for (const level of FIB_LEVELS) {
                  const price = fib.endPrice - diff * level;
                  const y = series.priceToCoordinate(price);
                  if (y !== null && Math.abs(my - (y as number)) < 8) {
                    fibHit = true;
                    handleMouseDown(e);
                    break;
                  }
                }
                if (fibHit) break;
              }
            }
            if (!fibHit) {
              // Temporarily disable pointer events so the chart gets this click
              if (eventLayerRef.current) {
                eventLayerRef.current.style.pointerEvents = 'none';
                const el = document.elementFromPoint(e.clientX, e.clientY);
                if (el) {
                  el.dispatchEvent(new MouseEvent('mousedown', {
                    clientX: e.clientX, clientY: e.clientY,
                    bubbles: true, cancelable: true,
                  }));
                }
                requestAnimationFrame(() => {
                  if (eventLayerRef.current) {
                    eventLayerRef.current.style.pointerEvents = shouldCapture ? 'auto' : 'none';
                  }
                });
              }
              setSelectedTrendlineId(null);
              setSelectedFibId(null);
              setFibDeletePos(null);
              return;
            }
          } else {
            handleMouseDown(e);
          }
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (dragRef.current) { dragRef.current = null; setIsInteracting(false); }
          setHoveringLine(false);
          setHoverY(null);
        }}
      />

      {/* Fibonacci delete button */}
      {selectedFibId && fibDeletePos && (
        <div
          className="absolute z-30 flex items-center gap-1 rounded-md px-1.5 py-1 shadow-lg border"
          style={{
            left: `${fibDeletePos.x}px`,
            top: `${fibDeletePos.y}px`,
            transform: 'translate(-50%, -50%)',
            background: 'hsl(var(--popover))',
            borderColor: 'hsl(var(--border))',
          }}
        >
          <button
            className="flex items-center justify-center w-7 h-7 rounded transition-colors"
            style={{ color: 'hsl(var(--destructive))' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--accent))')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            title="Delete Fibonacci"
            onClick={() => {
              removeFibonacci(selectedFibId);
              setSelectedFibId(null);
              setFibDeletePos(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>
      )}
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

function drawFibLines(
  ctx: CanvasRenderingContext2D,
  startPrice: number,
  endPrice: number,
  w: number,
  series: ISeriesApi<'Candlestick'>,
  selected?: boolean,
) {
  const diff = endPrice - startPrice;

  for (const level of FIB_LEVELS) {
    const price = endPrice - diff * level;
    const y = series.priceToCoordinate(price);
    if (y === null) continue;

    const color = FIB_COLORS[level] ?? '#787b86';

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, y as number);
    ctx.lineTo(w, y as number);
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 2.5 : 1;
    ctx.globalAlpha = selected ? 1 : 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Fill between levels
    const nextIdx = FIB_LEVELS.indexOf(level) + 1;
    if (nextIdx < FIB_LEVELS.length) {
      const nextPrice = endPrice - diff * FIB_LEVELS[nextIdx];
      const nextY = series.priceToCoordinate(nextPrice);
      if (nextY !== null) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.04;
        ctx.fillRect(0, Math.min(y as number, nextY as number), w, Math.abs((y as number) - (nextY as number)));
        ctx.globalAlpha = 1;
      }
    }

    // Label
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillText(`${(level * 100).toFixed(1)}%  ${price.toFixed(2)}`, 8, (y as number) - 4);
    ctx.globalAlpha = 1;
  }
}

function renderFibLevels(
  ctx: CanvasRenderingContext2D,
  fib: FibonacciDrawing,
  w: number,
  series: ISeriesApi<'Candlestick'>,
  selected?: boolean,
) {
  drawFibLines(ctx, fib.startPrice, fib.endPrice, w, series, selected);
}

function renderFibPreview(
  ctx: CanvasRenderingContext2D,
  fs: FibDrawState,
  w: number,
  series: ISeriesApi<'Candlestick'>,
) {
  drawFibLines(ctx, fs.startPrice, fs.currentPrice, w, series);

  // Draw the diagonal reference line
  const y1 = series.priceToCoordinate(fs.startPrice);
  const y2 = series.priceToCoordinate(fs.currentPrice);
  if (y1 !== null && y2 !== null) {
    ctx.beginPath();
    ctx.moveTo(fs.startX, y1 as number);
    ctx.lineTo(fs.currentX, y2 as number);
    ctx.strokeStyle = '#787b86';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
