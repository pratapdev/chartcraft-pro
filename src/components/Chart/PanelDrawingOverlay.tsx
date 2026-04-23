import React, { useRef, useEffect, useCallback, useState } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useMultiPanelStore } from '@/stores/multiPanelStore';
import { Trendline, FibonacciDrawing, RiskRewardDrawing } from '@/types/trading';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
  panelIndex: number;
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

interface RRDrawState {
  phase: 'idle' | 'drawing';
  entryPrice: number; entryTime: number;
  currentPrice: number;
  startX: number; startY: number;
  currentX: number; currentY: number;
}
const EMPTY_RR: RRDrawState = { phase: 'idle', entryPrice: 0, entryTime: 0, currentPrice: 0, startX: 0, startY: 0, currentX: 0, currentY: 0 };

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS: Record<number, string> = {
  0: '#787b86', 0.236: '#f44336', 0.382: '#ff9800', 0.5: '#4caf50',
  0.618: '#089981', 0.786: '#00bcd4', 1: '#787b86',
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

export const PanelDrawingOverlay: React.FC<Props> = ({ chartRef, seriesRef, panelIndex }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eventLayerRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef(EMPTY_DRAW);
  const measureRef = useRef<MeasureState>(EMPTY_MEASURE);
  const fibRef = useRef<FibDrawState>(EMPTY_FIB);
  const rrRef = useRef<RRDrawState>(EMPTY_RR);
  const dragRef = useRef<{
    lineId: string; point: 'start' | 'end' | 'body';
    startMX: number; startMY: number; origLine: Trendline;
  } | null>(null);

  const [isInteracting, setIsInteracting] = useState(false);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [, bump] = useState(0);
  const [selectedFibId, setSelectedFibId] = useState<string | null>(null);

  // Read from multiPanelStore
  const panel = useMultiPanelStore((s) => s.panels[panelIndex]);
  const setPanelActiveTool = useMultiPanelStore((s) => s.setPanelActiveTool);
  const addPanelTrendline = useMultiPanelStore((s) => s.addPanelTrendline);
  const updatePanelTrendline = useMultiPanelStore((s) => s.updatePanelTrendline);
  const removePanelTrendline = useMultiPanelStore((s) => s.removePanelTrendline);
  const setPanelSelectedTrendlineId = useMultiPanelStore((s) => s.setPanelSelectedTrendlineId);
  const addPanelFibonacci = useMultiPanelStore((s) => s.addPanelFibonacci);
  const removePanelFibonacci = useMultiPanelStore((s) => s.removePanelFibonacci);
  const addPanelRiskReward = useMultiPanelStore((s) => s.addPanelRiskReward);
  const setPanelSelectedRiskRewardId = useMultiPanelStore((s) => s.setPanelSelectedRiskRewardId);

  const activeTool = panel?.activeTool ?? 'cursor';
  const symbol = panel?.symbol ?? 'BTC/USD';
  const syncDrawings = useMultiPanelStore((s) => s.syncDrawings);
  const allPanels = useMultiPanelStore((s) => s.panels);

  const trendlines = React.useMemo(() => {
    if (!syncDrawings) return panel?.trendlines ?? [];
    const aggregated: Trendline[] = [];
    for (const p of Object.values(allPanels)) {
      if (p.symbol === symbol) aggregated.push(...p.trendlines);
    }
    return Array.from(new Map(aggregated.map(t => [t.id, t])).values());
  }, [syncDrawings, panel?.trendlines, allPanels, symbol]);

  const fibonacciDrawings = React.useMemo(() => {
    if (!syncDrawings) return panel?.fibonacciDrawings ?? [];
    const aggregated: FibonacciDrawing[] = [];
    for (const p of Object.values(allPanels)) {
      if (p.symbol === symbol) aggregated.push(...p.fibonacciDrawings);
    }
    return Array.from(new Map(aggregated.map(f => [f.id, f])).values());
  }, [syncDrawings, panel?.fibonacciDrawings, allPanels, symbol]);

  const riskRewardDrawings = React.useMemo(() => {
    if (!syncDrawings) return panel?.riskRewardDrawings ?? [];
    const aggregated: RiskRewardDrawing[] = [];
    for (const p of Object.values(allPanels)) {
      if (p.symbol === symbol) aggregated.push(...p.riskRewardDrawings);
    }
    return Array.from(new Map(aggregated.map(r => [r.id, r])).values());
  }, [syncDrawings, panel?.riskRewardDrawings, allPanels, symbol]);

  const selectedTrendlineId = panel?.selectedTrendlineId ?? null;
  const timeframe = panel?.timeframe ?? '1h';
  const drawingDefaults = panel?.drawingDefaults;
  const panelCandles = panel?.candles ?? [];

  // ── Coordinate helpers ──────────────────────────────────────────

  const pixelToCoords = useCallback(
    (x: number, y: number) => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return null;
      const price = series.coordinateToPrice(y);
      if (price === null) return null;
      let time = chart.timeScale().coordinateToTime(x);
      if (time === null) {
        if (panelCandles.length < 2) return null;
        const lastTime = panelCandles[panelCandles.length - 1].time;
        const interval = panelCandles[panelCandles.length - 1].time - panelCandles[panelCandles.length - 2].time;
        const lastX = chart.timeScale().timeToCoordinate(lastTime as unknown as Time);
        if (lastX === null) return null;
        const prevX = chart.timeScale().timeToCoordinate(panelCandles[panelCandles.length - 2].time as unknown as Time);
        const pxPerBar = prevX !== null ? lastX - prevX : 10;
        if (pxPerBar <= 0) return null;
        const barsAhead = (x - lastX) / pxPerBar;
        time = (lastTime + Math.round(barsAhead) * interval) as unknown as Time;
      }
      return { time: time as unknown as number, price: price as number };
    },
    [chartRef, seriesRef, panelCandles]
  );

  const timeToPixel = useCallback(
    (t: number) => {
      const chart = chartRef.current;
      if (!chart) return null;
      const px = chart.timeScale().timeToCoordinate(t as unknown as Time);
      if (px !== null) return px;
      if (panelCandles.length < 2) return null;
      const lastTime = panelCandles[panelCandles.length - 1].time;
      const interval = panelCandles[panelCandles.length - 1].time - panelCandles[panelCandles.length - 2].time;
      const lastX = chart.timeScale().timeToCoordinate(lastTime as unknown as Time);
      const prevX = chart.timeScale().timeToCoordinate(panelCandles[panelCandles.length - 2].time as unknown as Time);
      if (lastX === null || prevX === null) return null;
      const pxPerBar = lastX - prevX;
      if (pxPerBar <= 0) return null;
      return lastX + ((t - lastTime) / interval) * pxPerBar;
    },
    [chartRef, panelCandles]
  );

  const lineToPixels = useCallback(
    (line: Trendline) => {
      const series = seriesRef.current;
      if (!series) return null;
      const x1 = timeToPixel(line.startTime);
      const x2 = timeToPixel(line.endTime);
      const y1 = series.priceToCoordinate(line.startPrice);
      const y2 = series.priceToCoordinate(line.endPrice);
      if (x1 === null || x2 === null || y1 === null || y2 === null) return null;
      return { x1, y1: y1 as number, x2, y2: y2 as number };
    },
    [seriesRef, timeToPixel]
  );

  const hitTest = useCallback(
    (mx: number, my: number) => {
      for (let i = trendlines.length - 1; i >= 0; i--) {
        const line = trendlines[i];
        const isVertical = line.startTime === line.endTime && Math.abs(line.startPrice - line.endPrice) > 1e10;
        if (isVertical) {
          const x = timeToPixel(line.startTime);
          if (x !== null && Math.abs(mx - x) < 8) return line.id;
          continue;
        }
        const px = lineToPixels(line);
        if (!px) continue;
        if (ptLineDist(mx, my, px.x1, px.y1, px.x2, px.y2) < 8) return line.id;
      }
      return null;
    },
    [trendlines, lineToPixels, timeToPixel]
  );

  // ── Canvas render ───────────────────────────────────────────────

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

    // Render trendlines
    for (const line of trendlines) {
      const sel = selectedTrendlineId === line.id;
      const isVertical = line.startTime === line.endTime && Math.abs(line.startPrice - line.endPrice) > 1e10;

      if (isVertical) {
        const x = timeToPixel(line.startTime);
        if (x === null) continue;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.strokeStyle = line.color;
        ctx.lineWidth = sel ? line.thickness + 1.5 : line.thickness;
        const style = line.lineStyle ?? 'solid';
        if (style === 'dashed') ctx.setLineDash([8, 5]);
        else if (style === 'dotted') ctx.setLineDash([2, 3]);
        else ctx.setLineDash([]);
        if (sel) { ctx.shadowColor = line.color; ctx.shadowBlur = 8; }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        if (sel) {
          for (const ey of [20, h - 20]) {
            ctx.beginPath(); ctx.arc(x, ey, 5, 0, Math.PI * 2);
            ctx.fillStyle = line.color; ctx.fill();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
          }
        }
        continue;
      }

      const px = lineToPixels(line);
      if (!px) continue;
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
      if (sel) { ctx.shadowColor = line.color; ctx.shadowBlur = 8; }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      if (sel) {
        for (const [ex, ey] of [[px.x1, px.y1], [px.x2, px.y2]]) {
          ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2);
          ctx.fillStyle = line.color; ctx.fill();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
    }

    // Horizontal tool hover preview
    if (activeTool === 'horizontal' && hoverY !== null) {
      ctx.beginPath();
      ctx.moveTo(0, hoverY); ctx.lineTo(w, hoverY);
      ctx.strokeStyle = drawingDefaults?.horizontal.color ?? '#eab308';
      ctx.lineWidth = drawingDefaults?.horizontal.thickness ?? 2;
      ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    }

    // In-progress trendline
    const ds = drawRef.current;
    if (ds.phase === 'drawing') {
      ctx.beginPath();
      ctx.moveTo(ds.startX, ds.startY); ctx.lineTo(ds.currentX, ds.currentY);
      ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(ds.startX, ds.startY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#2563eb'; ctx.fill();
    }

    // Measure tool
    const ms = measureRef.current;
    if (ms.phase === 'measuring') {
      const x1m = Math.min(ms.startX, ms.currentX);
      const y1m = Math.min(ms.startY, ms.currentY);
      const x2m = Math.max(ms.startX, ms.currentX);
      const y2m = Math.max(ms.startY, ms.currentY);
      const isUp = ms.currentPrice >= ms.startPrice;
      ctx.fillStyle = isUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
      ctx.fillRect(x1m, y1m, x2m - x1m, y2m - y1m);
      ctx.strokeStyle = isUp ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.strokeRect(x1m, y1m, x2m - x1m, y2m - y1m); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(ms.startX, ms.startY); ctx.lineTo(ms.currentX, ms.currentY);
      ctx.strokeStyle = isUp ? '#22c55e' : '#ef4444'; ctx.lineWidth = 1.5; ctx.stroke();

      const priceDiff = ms.currentPrice - ms.startPrice;
      const pctChange = ms.startPrice !== 0 ? (priceDiff / ms.startPrice) * 100 : 0;
      let barCount = 0;
      if (panelCandles.length >= 2) {
        const interval = panelCandles[panelCandles.length - 1].time - panelCandles[panelCandles.length - 2].time;
        if (interval > 0) barCount = Math.round(Math.abs(ms.currentTime - ms.startTime) / interval);
      }
      const sign = isUp ? '+' : '';
      const boxW = 200; const boxH = 48;
      const boxX = ms.currentX + 12; const boxY = ms.currentY - boxH / 2;
      ctx.fillStyle = 'rgba(17,24,39,0.92)';
      ctx.beginPath(); ctx.roundRect(boxX, boxY, boxW, boxH, 6); ctx.fill();
      ctx.strokeStyle = isUp ? '#22c55e' : '#ef4444'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(boxX, boxY, boxW, boxH, 6); ctx.stroke();
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = isUp ? '#22c55e' : '#ef4444';
      ctx.fillText(`${sign}${priceDiff.toFixed(2)}  (${sign}${pctChange.toFixed(2)}%)`, boxX + 10, boxY + 20);
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(`${barCount} bars`, boxX + 10, boxY + 38);
    }

    // Fibonacci drawings
    const series = seriesRef.current;
    if (series) {
      for (const fib of fibonacciDrawings) {
        const isSelected = selectedFibId === fib.id;
        renderFibLevels(ctx, fib, w, series, isSelected);
      }
    }

    // In-progress fibonacci
    const fs = fibRef.current;
    if (fs.phase === 'drawing' && series) {
      renderFibPreview(ctx, fs, w, series);
    }

    // Risk/Reward drawings
    if (series) {
      for (const rr of riskRewardDrawings) {
        renderRiskReward(ctx, rr, w, h, series, timeToPixel);
      }
    }

    // In-progress R/R
    const rs = rrRef.current;
    if (rs.phase === 'drawing' && series) {
      const entryY = series.priceToCoordinate(rs.entryPrice);
      const slY = series.priceToCoordinate(rs.currentPrice);
      if (entryY !== null && slY !== null) {
        const isLong = rs.currentPrice < rs.entryPrice;
        const risk = Math.abs(rs.entryPrice - rs.currentPrice);
        const tpPrice = isLong ? rs.entryPrice + risk * 2 : rs.entryPrice - risk * 2;
        const tpY = series.priceToCoordinate(tpPrice);
        if (tpY !== null) {
          const x1 = rs.startX; const boxW = 120;
          ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
          ctx.fillRect(x1, Math.min(entryY as number, tpY as number), boxW, Math.abs((tpY as number) - (entryY as number)));
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
          ctx.fillRect(x1, Math.min(entryY as number, slY as number), boxW, Math.abs((slY as number) - (entryY as number)));
          ctx.beginPath(); ctx.moveTo(x1, entryY as number); ctx.lineTo(x1 + boxW, entryY as number);
          ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.stroke();
          ctx.font = '11px "JetBrains Mono", monospace';
          ctx.fillStyle = '#3b82f6'; ctx.fillText(`Entry: ${rs.entryPrice.toFixed(2)}`, x1 + 4, (entryY as number) - 5);
          ctx.fillStyle = '#22c55e'; ctx.fillText(`TP: ${tpPrice.toFixed(2)}`, x1 + 4, (tpY as number) + (isLong ? -5 : 14));
          ctx.fillStyle = '#ef4444'; ctx.fillText(`SL: ${rs.currentPrice.toFixed(2)}`, x1 + 4, (slY as number) + (isLong ? 14 : -5));
        }
      }
    }
  }, [trendlines, selectedTrendlineId, lineToPixels, activeTool, hoverY, fibonacciDrawings, selectedFibId, riskRewardDrawings, isInteracting, panelCandles]);

  useEffect(() => {
    let raf: number;
    const loop = () => { render(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [render]);

  // ── Event helpers ───────────────────────────────────────────────

  const getPos = (e: MouseEvent | React.MouseEvent) => {
    const rect = eventLayerRef.current?.getBoundingClientRect();
    if (!rect) return { mx: 0, my: 0 };
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  };

  const [hoveringLine, setHoveringLine] = useState(false);

  // ── Mouse handlers ──────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const { mx, my } = getPos(e);

      if (activeTool === 'horizontal') {
        const coords = pixelToCoords(mx, my);
        if (coords) {
          const startTime = panelCandles.length > 0 ? panelCandles[0].time : coords.time - 86400;
          const endTime = panelCandles.length > 0 ? panelCandles[panelCandles.length - 1].time + (panelCandles.length > 1 ? (panelCandles[panelCandles.length - 1].time - panelCandles[0].time) : 86400) : coords.time + 86400;
          addPanelTrendline(panelIndex, {
            id: crypto.randomUUID(), symbol, timeframe, startTime,
            startPrice: coords.price, endTime, endPrice: coords.price,
            color: drawingDefaults?.horizontal.color ?? '#eab308',
            thickness: drawingDefaults?.horizontal.thickness ?? 2,
            lineStyle: drawingDefaults?.horizontal.lineStyle ?? 'solid',
            createdAt: Date.now(),
          });
        }
        setPanelActiveTool(panelIndex, 'cursor');
        e.preventDefault(); e.stopPropagation(); return;
      }

      if (activeTool === 'vertical') {
        const coords = pixelToCoords(mx, my);
        if (coords) {
          addPanelTrendline(panelIndex, {
            id: crypto.randomUUID(), symbol, timeframe,
            startTime: coords.time, startPrice: 1e12,
            endTime: coords.time, endPrice: -1e12,
            color: drawingDefaults?.trendline.color ?? '#2563eb',
            thickness: drawingDefaults?.trendline.thickness ?? 2,
            lineStyle: drawingDefaults?.trendline.lineStyle ?? 'solid',
            createdAt: Date.now(),
          });
        }
        setPanelActiveTool(panelIndex, 'cursor');
        e.preventDefault(); e.stopPropagation(); return;
      }

      if (activeTool === 'trendline') {
        drawRef.current = { phase: 'drawing', startX: mx, startY: my, currentX: mx, currentY: my };
        setIsInteracting(true); bump((n) => n + 1);
        e.preventDefault(); e.stopPropagation(); return;
      }

      if (activeTool === 'fibonacci') {
        const coords = pixelToCoords(mx, my);
        if (coords) {
          fibRef.current = {
            phase: 'drawing', startX: mx, startY: my, currentX: mx, currentY: my,
            startPrice: coords.price, currentPrice: coords.price,
            startTime: coords.time, currentTime: coords.time,
          };
          setIsInteracting(true); bump((n) => n + 1);
        }
        e.preventDefault(); e.stopPropagation(); return;
      }

      if (activeTool === 'riskreward') {
        const coords = pixelToCoords(mx, my);
        if (coords) {
          rrRef.current = {
            phase: 'drawing', entryPrice: coords.price, entryTime: coords.time,
            currentPrice: coords.price, startX: mx, startY: my, currentX: mx, currentY: my,
          };
          setIsInteracting(true); bump((n) => n + 1);
        }
        e.preventDefault(); e.stopPropagation(); return;
      }

      if (activeTool === 'measure') {
        const coords = pixelToCoords(mx, my);
        if (coords) {
          measureRef.current = {
            phase: 'measuring', startX: mx, startY: my, currentX: mx, currentY: my,
            startPrice: coords.price, currentPrice: coords.price,
            startTime: coords.time, currentTime: coords.time,
          };
          setIsInteracting(true); bump((n) => n + 1);
        }
        e.preventDefault(); e.stopPropagation(); return;
      }

      // Cursor: hit test trendlines
      const hitId = hitTest(mx, my);
      if (hitId) {
        setPanelSelectedTrendlineId(panelIndex, hitId);
        setSelectedFibId(null);
        const line = trendlines.find((t) => t.id === hitId)!;
        const px = lineToPixels(line);
        if (px) {
          const d1 = Math.hypot(mx - px.x1, my - px.y1);
          const d2 = Math.hypot(mx - px.x2, my - px.y2);
          const point = d1 < 12 ? 'start' : d2 < 12 ? 'end' : 'body';
          dragRef.current = { lineId: hitId, point, startMX: mx, startMY: my, origLine: { ...line } };
        }
        setIsInteracting(true);
        e.preventDefault(); e.stopPropagation(); return;
      }

      // Hit test fibonacci
      const series = seriesRef.current;
      if (series && fibonacciDrawings.length > 0) {
        for (const fib of fibonacciDrawings) {
          const diff = fib.endPrice - fib.startPrice;
          for (const level of FIB_LEVELS) {
            const price = fib.endPrice - diff * level;
            const y = series.priceToCoordinate(price);
            if (y !== null && Math.abs(my - (y as number)) < 8) {
              setSelectedFibId(fib.id);
              setPanelSelectedTrendlineId(panelIndex, null);
              e.preventDefault(); e.stopPropagation(); return;
            }
          }
        }
      }

      setPanelSelectedTrendlineId(panelIndex, null);
      setSelectedFibId(null);
      setPanelSelectedRiskRewardId(panelIndex, null);
    },
    [activeTool, hitTest, trendlines, lineToPixels, pixelToCoords, panelIndex, symbol, timeframe, panelCandles, drawingDefaults]
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
      if (rrRef.current.phase === 'drawing') {
        const coords = pixelToCoords(mx, my);
        if (coords) {
          rrRef.current = { ...rrRef.current, currentX: mx, currentY: my, currentPrice: coords.price };
          bump((n) => n + 1);
        }
        return;
      }
      if (dragRef.current) {
        const coords = pixelToCoords(mx, my);
        if (!coords) return;
        const drag = dragRef.current;
        if (drag.point === 'start') {
          updatePanelTrendline(panelIndex, drag.lineId, { startTime: coords.time, startPrice: coords.price });
        } else if (drag.point === 'end') {
          updatePanelTrendline(panelIndex, drag.lineId, { endTime: coords.time, endPrice: coords.price });
        } else {
          const startCoords = pixelToCoords(drag.startMX, drag.startMY);
          if (!startCoords) return;
          updatePanelTrendline(panelIndex, drag.lineId, {
            startTime: drag.origLine.startTime + (coords.time - startCoords.time),
            startPrice: drag.origLine.startPrice + (coords.price - startCoords.price),
            endTime: drag.origLine.endTime + (coords.time - startCoords.time),
            endPrice: drag.origLine.endPrice + (coords.price - startCoords.price),
          });
        }
        e.preventDefault(); e.stopPropagation(); return;
      }

      // Hover preview for horizontal line
      if (activeTool === 'horizontal') {
        setHoverY(my);
        return;
      }

      // Hover detection for cursor change
      const id = hitTest(mx, my);
      setHoveringLine(!!id);
    },
    [activeTool, hitTest, pixelToCoords, panelIndex]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const { mx, my } = getPos(e);

      if (drawRef.current.phase === 'drawing') {
        const startCoords = pixelToCoords(drawRef.current.startX, drawRef.current.startY);
        const endCoords = pixelToCoords(mx, my);
        if (startCoords && endCoords) {
          addPanelTrendline(panelIndex, {
            id: crypto.randomUUID(), symbol, timeframe,
            startTime: startCoords.time, startPrice: startCoords.price,
            endTime: endCoords.time, endPrice: endCoords.price,
            color: drawingDefaults?.trendline.color ?? '#2563eb',
            thickness: drawingDefaults?.trendline.thickness ?? 2,
            lineStyle: drawingDefaults?.trendline.lineStyle ?? 'solid',
            createdAt: Date.now(),
          });
        }
        drawRef.current = EMPTY_DRAW;
        setIsInteracting(false);
        setPanelActiveTool(panelIndex, 'cursor');
        return;
      }

      if (measureRef.current.phase === 'measuring') {
        measureRef.current = EMPTY_MEASURE;
        setIsInteracting(false);
        setPanelActiveTool(panelIndex, 'cursor');
        bump((n) => n + 1);
        return;
      }

      if (fibRef.current.phase === 'drawing') {
        const fs = fibRef.current;
        addPanelFibonacci(panelIndex, {
          id: crypto.randomUUID(), symbol, timeframe,
          startTime: fs.startTime, startPrice: fs.startPrice,
          endTime: fs.currentTime, endPrice: fs.currentPrice,
          createdAt: Date.now(),
        });
        fibRef.current = EMPTY_FIB;
        setIsInteracting(false);
        setPanelActiveTool(panelIndex, 'cursor');
        bump((n) => n + 1);
        return;
      }

      if (rrRef.current.phase === 'drawing') {
        const rs = rrRef.current;
        const isLong = rs.currentPrice < rs.entryPrice;
        const risk = Math.abs(rs.entryPrice - rs.currentPrice);
        addPanelRiskReward(panelIndex, {
          id: crypto.randomUUID(), symbol, timeframe,
          entryPrice: rs.entryPrice, stopLoss: rs.currentPrice,
          takeProfit: isLong ? rs.entryPrice + risk * 2 : rs.entryPrice - risk * 2,
          entryTime: rs.entryTime, createdAt: Date.now(),
        });
        rrRef.current = EMPTY_RR;
        setIsInteracting(false);
        setPanelActiveTool(panelIndex, 'cursor');
        bump((n) => n + 1);
        return;
      }

      if (dragRef.current) {
        dragRef.current = null;
        setIsInteracting(false);
        return;
      }
    },
    [pixelToCoords, panelIndex, symbol, timeframe, drawingDefaults]
  );

  // Delete selected trendline on key press
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTrendlineId) {
          removePanelTrendline(panelIndex, selectedTrendlineId);
        }
        if (selectedFibId) {
          removePanelFibonacci(panelIndex, selectedFibId);
          setSelectedFibId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedTrendlineId, selectedFibId, panelIndex]);

  const shouldCapture = activeTool === 'trendline' || activeTool === 'horizontal' || activeTool === 'vertical' || activeTool === 'measure' || activeTool === 'fibonacci' || activeTool === 'riskreward' || isInteracting || activeTool === 'cursor';

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10 pointer-events-none"
      />
      <div
        ref={eventLayerRef}
        className="absolute top-0 left-0 z-20"
        style={{
          right: 65, bottom: 28,
          pointerEvents: shouldCapture ? 'auto' : 'none',
          cursor: activeTool === 'cursor' ? (hoveringLine ? 'pointer' : 'default') : 'crosshair',
        }}
        onMouseDown={(e) => {
          const { mx, my } = getPos(e.nativeEvent);
          if (activeTool === 'cursor' && !hitTest(mx, my)) {
            let fibHit = false;
            const series = seriesRef.current;
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
              setPanelSelectedTrendlineId(panelIndex, null);
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
        onMouseLeave={() => { setHoverY(null); setHoveringLine(false); }}
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
              removePanelFibonacci(panelIndex, selectedFibId);
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

// ── Fibonacci rendering helpers ─────────────────────────────────────

function renderFibLevels(
  ctx: CanvasRenderingContext2D,
  fib: FibonacciDrawing,
  w: number,
  series: ISeriesApi<'Candlestick'>,
  isSelected: boolean
) {
  const diff = fib.endPrice - fib.startPrice;
  for (const level of FIB_LEVELS) {
    const price = fib.endPrice - diff * level;
    const y = series.priceToCoordinate(price);
    if (y === null) continue;

    ctx.beginPath();
    ctx.moveTo(0, y as number);
    ctx.lineTo(w, y as number);
    ctx.strokeStyle = FIB_COLORS[level] ?? '#787b86';
    ctx.lineWidth = isSelected ? 1.5 : 1;
    ctx.globalAlpha = isSelected ? 1 : 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = FIB_COLORS[level] ?? '#787b86';
    ctx.fillText(`${(level * 100).toFixed(1)}% — ${price.toFixed(2)}`, 8, (y as number) - 4);
  }

  // Fill between 0 and 1 levels
  const y0 = series.priceToCoordinate(fib.endPrice);
  const y1 = series.priceToCoordinate(fib.startPrice);
  if (y0 !== null && y1 !== null) {
    ctx.fillStyle = 'rgba(33,150,243,0.04)';
    ctx.fillRect(0, Math.min(y0 as number, y1 as number), w, Math.abs((y1 as number) - (y0 as number)));
  }
}

function renderFibPreview(
  ctx: CanvasRenderingContext2D,
  fs: FibDrawState,
  w: number,
  series: ISeriesApi<'Candlestick'>
) {
  const diff = fs.currentPrice - fs.startPrice;
  for (const level of FIB_LEVELS) {
    const price = fs.currentPrice - diff * level;
    const y = series.priceToCoordinate(price);
    if (y === null) continue;

    ctx.beginPath();
    ctx.moveTo(0, y as number);
    ctx.lineTo(w, y as number);
    ctx.strokeStyle = FIB_COLORS[level] ?? '#787b86';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = FIB_COLORS[level] ?? '#787b86';
    ctx.fillText(`${(level * 100).toFixed(1)}%`, 8, (y as number) - 4);
  }
}

function renderRiskReward(
  ctx: CanvasRenderingContext2D,
  rr: RiskRewardDrawing,
  w: number,
  h: number,
  series: ISeriesApi<'Candlestick'>,
  timeToPixel: (t: number) => number | null
) {
  const entryY = series.priceToCoordinate(rr.entryPrice);
  const slY = series.priceToCoordinate(rr.stopLoss);
  const tpY = series.priceToCoordinate(rr.takeProfit);
  if (entryY === null || slY === null || tpY === null) return;

  const x1 = timeToPixel(rr.entryTime) ?? 100;
  const boxW = 120;

  // Profit zone
  ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
  ctx.fillRect(x1, Math.min(entryY as number, tpY as number), boxW, Math.abs((tpY as number) - (entryY as number)));
  ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 1;
  ctx.strokeRect(x1, Math.min(entryY as number, tpY as number), boxW, Math.abs((tpY as number) - (entryY as number)));

  // Loss zone
  ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
  ctx.fillRect(x1, Math.min(entryY as number, slY as number), boxW, Math.abs((slY as number) - (entryY as number)));
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1;
  ctx.strokeRect(x1, Math.min(entryY as number, slY as number), boxW, Math.abs((slY as number) - (entryY as number)));

  // Entry line
  ctx.beginPath(); ctx.moveTo(x1, entryY as number); ctx.lineTo(x1 + boxW, entryY as number);
  ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.stroke();

  // Labels
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#3b82f6'; ctx.fillText(`Entry: ${rr.entryPrice.toFixed(2)}`, x1 + 4, (entryY as number) - 5);
  ctx.fillStyle = '#22c55e'; ctx.fillText(`TP: ${rr.takeProfit.toFixed(2)}`, x1 + 4, (tpY as number) - 5);
  ctx.fillStyle = '#ef4444'; ctx.fillText(`SL: ${rr.stopLoss.toFixed(2)}`, x1 + 4, (slY as number) + 14);

  const ratio = Math.abs(rr.takeProfit - rr.entryPrice) / Math.abs(rr.stopLoss - rr.entryPrice);
  ctx.fillStyle = '#e5e7eb'; ctx.font = 'bold 12px "JetBrains Mono", monospace';
  ctx.fillText(`R:R 1:${ratio.toFixed(1)}`, x1 + boxW - 76, (entryY as number) - 5);
}
