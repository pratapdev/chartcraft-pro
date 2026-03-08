import React from 'react';
import { useChartStore } from '@/stores/chartStore';
import { Timeframe } from '@/types/trading';

const TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '15m', '1h', '4h', '1D', '1W'];

export const ChartHeader: React.FC = () => {
  const { symbol, timeframe, setTimeframe, candles, connected, loading } = useChartStore();
  const last = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2] : null;

  const change = last && prev ? last.close - prev.close : 0;
  const changePct = prev ? (change / prev.close) * 100 : 0;
  const isUp = change >= 0;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-card min-h-[40px]">
      {/* Symbol + live dot */}
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm text-foreground">{symbol}</span>
        {connected && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse-glow" />
            LIVE
          </span>
        )}
        {loading && (
          <span className="text-[10px] text-muted-foreground">Loading...</span>
        )}
        {last && (
          <>
            <span className={`font-mono text-sm font-semibold ${isUp ? 'text-bull' : 'text-bear'}`}>
              {last.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`font-mono text-xs ${isUp ? 'text-bull' : 'text-bear'}`}>
              {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
            </span>
          </>
        )}
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Timeframes */}
      <div className="flex items-center gap-0.5">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`trading-btn ${timeframe === tf ? 'active' : ''}`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* OHLCV */}
      {last && (
        <>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-muted-foreground">
              O <span className="text-foreground">{last.open.toFixed(2)}</span>
            </span>
            <span className="text-muted-foreground">
              H <span className="text-foreground">{last.high.toFixed(2)}</span>
            </span>
            <span className="text-muted-foreground">
              L <span className="text-foreground">{last.low.toFixed(2)}</span>
            </span>
            <span className="text-muted-foreground">
              C <span className={isUp ? 'text-bull' : 'text-bear'}>{last.close.toFixed(2)}</span>
            </span>
            <span className="text-muted-foreground">
              V <span className="text-foreground">{formatVolume(last.volume)}</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
};

function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}
