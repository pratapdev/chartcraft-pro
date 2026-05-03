import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { fetchAggTrades, subscribeToTrades, getTimeframeMs } from '@/lib/tradeData';
import { FootprintCandle, processTradesIntoFootprint, addTradeToFootprint, autoTickSize } from '@/lib/footprintProcessor';
import { Loader2 } from 'lucide-react';

function formatVol(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toString();
}

export const FootprintChart: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fpCandles, setFpCandles] = useState<FootprintCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fpCandlesRef = useRef<FootprintCandle[]>([]);
  const unsubRef = useRef<(() => void) | null>(null);

  // Pan/zoom state
  const [offsetX, setOffsetX] = useState(0);
  const [zoom, setZoom] = useState(1);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartOffset = useRef(0);

  const { symbol, timeframe, candles: ohlcCandles } = useChartStore();

  // Load historical trades
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFpCandles([]);
    fpCandlesRef.current = [];

    // Clean up previous subscription
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    const tfMs = getTimeframeMs(timeframe);
    // Fetch last N candles worth of trades
    const numCandles = 50;
    const endTime = Date.now();
    const startTime = endTime - numCandles * tfMs;

    (async () => {
      try {
        const trades = await fetchAggTrades(symbol, startTime, endTime);
        if (cancelled) return;

        if (!trades.length) {
          setError('No trade data available');
          setLoading(false);
          return;
        }

        const tickSize = autoTickSize(trades[0].price);
        const processed = processTradesIntoFootprint(trades, timeframe, tickSize);
        fpCandlesRef.current = processed;
        setFpCandles(processed);
        setLoading(false);

        // Start live subscription
        const unsub = subscribeToTrades(symbol, (trade) => {
          fpCandlesRef.current = addTradeToFootprint(fpCandlesRef.current, trade, timeframe, tickSize);
          setFpCandles([...fpCandlesRef.current]);
        });
        unsubRef.current = unsub;
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load trade data');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [symbol, timeframe]);

  // Draw footprint on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !fpCandles.length) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    // Clear
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    if (!fpCandles.length) return;

    const candleWidth = Math.max(60, 120 * zoom);
    const gap = 4;
    const totalWidth = fpCandles.length * (candleWidth + gap);

    // Price range across all visible candles
    const rightEdge = W - 60; // space for price axis
    const bottomEdge = H - 30; // space for time axis

    // Determine visible candle range based on offset
    const startPx = offsetX;
    const visibleStart = Math.max(0, Math.floor(-startPx / (candleWidth + gap)));
    const visibleEnd = Math.min(fpCandles.length, Math.ceil((W - startPx) / (candleWidth + gap)) + 1);

    const visibleCandles = fpCandles.slice(visibleStart, visibleEnd);

    if (!visibleCandles.length) return;

    // Find price range
    let minPrice = Infinity, maxPrice = -Infinity;
    for (const c of visibleCandles) {
      if (c.levels.length > 0) {
        minPrice = Math.min(minPrice, c.levels[0].price);
        maxPrice = Math.max(maxPrice, c.levels[c.levels.length - 1].price);
      }
    }

    if (minPrice === Infinity) return;

    const tickSize = visibleCandles[0].tickSize;
    const priceRange = maxPrice - minPrice + tickSize * 2;
    const chartTop = 20;
    const chartHeight = bottomEdge - chartTop;

    const priceToY = (p: number) => chartTop + ((maxPrice + tickSize - p) / priceRange) * chartHeight;
    const rowHeight = Math.max(12, (chartHeight / ((maxPrice - minPrice) / tickSize + 1)));

    // Find max volume at any level for color intensity scaling
    let maxLevelVol = 1;
    for (const c of visibleCandles) {
      for (const l of c.levels) {
        maxLevelVol = Math.max(maxLevelVol, l.buyVolume, l.sellVolume);
      }
    }

    // Draw candles
    for (let i = visibleStart; i < visibleEnd; i++) {
      const c = fpCandles[i];
      const x = startPx + i * (candleWidth + gap);

      if (x + candleWidth < 0 || x > rightEdge) continue;

      const halfWidth = candleWidth / 2;

      // Draw each price level
      for (const level of c.levels) {
        const y = priceToY(level.price);
        const rh = Math.max(rowHeight - 1, 10);

        // Background based on delta
        const isPositiveDelta = level.delta >= 0;
        const intensity = Math.min(0.4, (Math.abs(level.delta) / maxLevelVol) * 0.4);
        ctx.fillStyle = isPositiveDelta
          ? `rgba(34, 197, 94, ${intensity + 0.05})`
          : `rgba(239, 68, 68, ${intensity + 0.05})`;
        ctx.fillRect(x, y - rh / 2, candleWidth, rh);

        // Border
        ctx.strokeStyle = '#1c2333';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y - rh / 2, candleWidth, rh);

        // Text: sell | buy
        ctx.font = `${Math.min(10, rh - 2)}px "JetBrains Mono", monospace`;
        ctx.textBaseline = 'middle';

        const sellText = formatVol(level.sellVolume);
        const buyText = formatVol(level.buyVolume);

        // Sell side (left)
        ctx.fillStyle = level.sellVolume > 0 ? '#ef4444' : '#4b5563';
        ctx.textAlign = 'right';
        ctx.fillText(sellText, x + halfWidth - 4, y);

        // Divider
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x + halfWidth, y - rh / 2);
        ctx.lineTo(x + halfWidth, y + rh / 2);
        ctx.stroke();

        // Buy side (right)
        ctx.fillStyle = level.buyVolume > 0 ? '#22c55e' : '#4b5563';
        ctx.textAlign = 'left';
        ctx.fillText(buyText, x + halfWidth + 4, y);
      }

      // Draw candle body outline
      const openY = priceToY(c.open);
      const closeY = priceToY(c.close);
      const isBull = c.close >= c.open;
      ctx.strokeStyle = isBull ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1, Math.min(openY, closeY), candleWidth - 2, Math.abs(closeY - openY) || 1);

      // Delta bar at bottom of candle
      const deltaBarY = bottomEdge - 18;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = c.totalDelta >= 0 ? '#22c55e' : '#ef4444';
      ctx.fillText(`Δ${formatVol(Math.abs(c.totalDelta))}`, x + halfWidth, deltaBarY);

      // Time label
      const d = new Date(c.time * 1000);
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'center';
      ctx.fillText(
        d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        x + halfWidth,
        H - 8
      );
    }

    // Price axis (right)
    ctx.fillStyle = '#1c2333';
    ctx.fillRect(rightEdge, 0, 60, H);

    const numPriceLabels = Math.max(5, Math.floor(chartHeight / 40));
    const priceStep = priceRange / numPriceLabels;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'left';

    for (let i = 0; i <= numPriceLabels; i++) {
      const p = maxPrice + tickSize - i * priceStep;
      const y = priceToY(p);
      ctx.fillText(p.toFixed(tickSize >= 1 ? 0 : 2), rightEdge + 4, y);

      ctx.strokeStyle = '#1c233344';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rightEdge, y);
      ctx.stroke();
    }

    // Legend
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#9ca3af';
    ctx.textAlign = 'left';
    ctx.fillText('Delta Footprint', 8, 14);

    ctx.fillStyle = '#ef4444';
    ctx.fillText('Sell', 140, 14);
    ctx.fillStyle = '#6b7280';
    ctx.fillText(' | ', 162, 14);
    ctx.fillStyle = '#22c55e';
    ctx.fillText('Buy', 175, 14);

  }, [fpCandles, offsetX, zoom]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      // Trigger re-render
      setFpCandles((prev) => [...prev]);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Mouse handlers for pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartOffset.current = offsetX;
  }, [offsetX]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    setOffsetX(dragStartOffset.current + dx);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Scroll to zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.3, Math.min(3, z - e.deltaY * 0.001)));
  }, []);

  // Auto-scroll to show latest candles
  useEffect(() => {
    if (!containerRef.current || !fpCandles.length || isDragging.current) return;
    const W = containerRef.current.getBoundingClientRect().width;
    const candleWidth = Math.max(60, 120 * zoom);
    const gap = 4;
    const totalWidth = fpCandles.length * (candleWidth + gap);
    // Show the right edge with some padding
    const newOffset = Math.min(0, W - totalWidth - 80);
    setOffsetX(newOffset);
  }, [fpCandles.length, zoom]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-mono">Loading trade data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background">
        <span className="text-sm text-destructive font-mono">{error}</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};
