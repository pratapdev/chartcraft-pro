import React, { useEffect, useRef, useCallback, useState } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { fetchAggTrades } from '@/lib/tradeData';
import { processTradesAndDetectImbalances, ImbalanceResult } from '@/lib/imbalanceDetection';
import { Loader2, Settings2 } from 'lucide-react';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export const ImbalanceOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicators = useChartStore((s) => s.indicators);
  const candles = useChartStore((s) => s.candles);
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);

  const imbalanceInd = indicators.find((i) => i.type === 'IMBALANCE' && i.visible);
  const threshold = (imbalanceInd as any)?.threshold ?? 3;
  const minStack = (imbalanceInd as any)?.minStack ?? 3;

  const [result, setResult] = useState<ImbalanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedKeyRef = useRef('');

  // Fetch trades and compute imbalances when visible range or config changes
  useEffect(() => {
    if (!imbalanceInd || candles.length === 0) {
      setResult(null);
      return;
    }

    const chart = chartRef.current;
    if (!chart) return;

    const visRange = chart.timeScale().getVisibleRange();
    if (!visRange) return;

    const from = (visRange.from as unknown as number) * 1000;
    const to = (visRange.to as unknown as number) * 1000;

    // Limit fetch window to avoid too many trades
    const maxWindowMs = 4 * 3600 * 1000; // 4 hours max
    const fetchFrom = Math.max(from, to - maxWindowMs);

    const key = `${symbol}:${timeframe}:${Math.floor(fetchFrom / 60000)}:${Math.floor(to / 60000)}:${threshold}:${minStack}`;
    if (key === fetchedKeyRef.current) return;
    fetchedKeyRef.current = key;

    setLoading(true);
    fetchAggTrades(symbol, fetchFrom, to, 50000)
      .then((trades) => {
        if (trades.length > 0) {
          const res = processTradesAndDetectImbalances(trades, timeframe, threshold, minStack);
          setResult(res);
        } else {
          setResult({ cells: [], zones: [] });
        }
      })
      .catch(() => setResult({ cells: [], zones: [] }))
      .finally(() => setLoading(false));
  }, [imbalanceInd, candles.length, symbol, timeframe, threshold, minStack]);

  // Re-fetch on viewport change (debounced)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !imbalanceInd) return;

    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        // Trigger re-fetch by invalidating key
        fetchedKeyRef.current = '';
        // Force re-run of the fetch effect
        setResult((prev) => prev ? { ...prev } : prev);
      }, 500);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => {
      clearTimeout(timeout);
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {}
    };
  }, [chartRef, imbalanceInd]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series || !result || !imbalanceInd) return;

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
    const from = visRange.from as unknown as number;
    const to = visRange.to as unknown as number;

    // Estimate bar width from candle spacing
    const visibleCandles = candles.filter((c) => c.time >= from && c.time <= to);
    if (visibleCandles.length < 2) return;

    // Get pixel positions of first and last visible candles for bar width
    const firstX = chart.timeScale().timeToCoordinate(visibleCandles[0].time as unknown as Time);
    const secondX = chart.timeScale().timeToCoordinate(visibleCandles[1].time as unknown as Time);
    if (firstX === null || secondX === null) return;
    const barWidth = Math.max(3, Math.abs((secondX as number) - (firstX as number)) * 0.6);

    // Determine tick size from price for coordinate mapping
    const avgPrice = visibleCandles.reduce((s, c) => s + c.close, 0) / visibleCandles.length;
    let tickSize: number;
    if (avgPrice >= 50000) tickSize = 50;
    else if (avgPrice >= 10000) tickSize = 25;
    else if (avgPrice >= 5000) tickSize = 10;
    else if (avgPrice >= 1000) tickSize = 5;
    else if (avgPrice >= 100) tickSize = 1;
    else if (avgPrice >= 10) tickSize = 0.5;
    else if (avgPrice >= 1) tickSize = 0.1;
    else tickSize = 0.01;

    // Draw individual imbalance cells
    for (const cell of result.cells) {
      if (cell.candleTime < from || cell.candleTime > to) continue;

      const x = chart.timeScale().timeToCoordinate(cell.candleTime as unknown as Time);
      const y = series.priceToCoordinate(cell.price);
      const yNext = series.priceToCoordinate(cell.price + tickSize);
      if (x === null || y === null || yNext === null) continue;

      const cellHeight = Math.max(2, Math.abs((y as number) - (yNext as number)));
      const cellY = Math.min(y as number, yNext as number);

      if (cell.type === 'buy') {
        ctx.fillStyle = 'rgba(0, 150, 255, 0.25)';
      } else {
        ctx.fillStyle = 'rgba(255, 140, 0, 0.25)';
      }

      ctx.fillRect((x as number) - barWidth / 2, cellY, barWidth, cellHeight);
    }

    // Draw stacked imbalance zones
    for (const zone of result.zones) {
      if (zone.candleTime < from || zone.candleTime > to) continue;

      const x = chart.timeScale().timeToCoordinate(zone.candleTime as unknown as Time);
      const yTop = series.priceToCoordinate(zone.topPrice + tickSize);
      const yBottom = series.priceToCoordinate(zone.bottomPrice);
      if (x === null || yTop === null || yBottom === null) continue;

      const zoneTop = Math.min(yTop as number, yBottom as number);
      const zoneHeight = Math.abs((yTop as number) - (yBottom as number));

      // Zone border
      if (zone.type === 'buy') {
        ctx.strokeStyle = 'rgba(0, 150, 255, 0.7)';
        ctx.fillStyle = 'rgba(0, 150, 255, 0.08)';
      } else {
        ctx.strokeStyle = 'rgba(255, 140, 0, 0.7)';
        ctx.fillStyle = 'rgba(255, 140, 0, 0.08)';
      }

      // Extend zone to the right edge
      const zoneX = (x as number) - barWidth / 2;
      const zoneW = w - 65 - zoneX; // extend to price scale

      ctx.fillRect(zoneX, zoneTop, zoneW, zoneHeight);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(zoneX, zoneTop, zoneW, zoneHeight);
      ctx.setLineDash([]);

      // Label
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = zone.type === 'buy' ? 'rgba(0, 150, 255, 0.9)' : 'rgba(255, 140, 0, 0.9)';
      const label = `${zone.type === 'buy' ? '▲' : '▼'} ${zone.cells.length}x Stack`;
      ctx.fillText(label, zoneX + 4, zoneTop + 12);
    }
  }, [chartRef, seriesRef, candles, result, imbalanceInd]);

  // Render when result changes
  useEffect(() => {
    if (!imbalanceInd || !result) return;
    render();
  }, [render, imbalanceInd, result]);

  // Re-render on zoom/pan
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !imbalanceInd) return;
    const handler = () => render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {}
    };
  }, [chartRef, imbalanceInd, render]);

  if (!imbalanceInd) return null;

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 z-[6] pointer-events-none" />
      {loading && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[10] flex items-center gap-1.5 bg-card/90 border border-border rounded px-2 py-1 text-[10px] text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          Loading imbalances…
        </div>
      )}
    </>
  );
};
