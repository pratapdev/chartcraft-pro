import React, { useState, useEffect } from 'react';
import { fetchCandles } from '@/lib/marketData';
import { useChartStore } from '@/stores/chartStore';
import { TrendingUp, TrendingDown } from 'lucide-react';

const HEATMAP_SYMBOLS = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD',
  'XRP/USD', 'ADA/USD', 'DOGE/USD', 'AVAX/USD',
];

const TIMEFRAMES = ['1h', '1D', '1W'] as const;

interface HeatCell {
  symbol: string;
  changes: Record<string, number | null>; // timeframe -> % change
}

function getHeatColor(pct: number | null): string {
  if (pct == null) return 'hsl(var(--muted))';
  const clamped = Math.max(-10, Math.min(10, pct));
  if (clamped >= 0) {
    const intensity = Math.min(1, clamped / 10);
    return `hsl(142 ${40 + intensity * 30}% ${50 - intensity * 20}%)`;
  } else {
    const intensity = Math.min(1, Math.abs(clamped) / 10);
    return `hsl(0 ${40 + intensity * 30}% ${50 - intensity * 20}%)`;
  }
}

export const HeatmapView: React.FC = () => {
  const [data, setData] = useState<HeatCell[]>([]);
  const [loading, setLoading] = useState(true);
  const setSymbol = useChartStore((s) => s.setSymbol);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const results = await Promise.all(
        HEATMAP_SYMBOLS.map(async (symbol) => {
          const changes: Record<string, number | null> = {};
          await Promise.all(
            TIMEFRAMES.map(async (tf) => {
              try {
                const limit = tf === '1h' ? 2 : tf === '1D' ? 2 : 2;
                const candles = await fetchCandles(symbol, tf as any, limit);
                if (candles.length >= 2) {
                  const prev = candles[0].close;
                  const curr = candles[candles.length - 1].close;
                  changes[tf] = ((curr - prev) / prev) * 100;
                } else {
                  changes[tf] = null;
                }
              } catch {
                changes[tf] = null;
              }
            })
          );
          return { symbol, changes };
        })
      );
      setData(results);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-4 text-xs text-muted-foreground">Loading heatmap data...</div>
    );
  }

  return (
    <div className="p-2">
      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">
        Market Heatmap
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1 px-2 text-muted-foreground font-medium">Symbol</th>
              {TIMEFRAMES.map((tf) => (
                <th key={tf} className="text-center py-1 px-2 text-muted-foreground font-medium">{tf}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.symbol}
                className="hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => setSymbol(row.symbol)}
              >
                <td className="py-1.5 px-2 font-medium text-foreground">{row.symbol}</td>
                {TIMEFRAMES.map((tf) => {
                  const val = row.changes[tf];
                  const isUp = (val ?? 0) >= 0;
                  return (
                    <td key={tf} className="py-1.5 px-2 text-center">
                      <span
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded font-mono text-[11px] font-semibold"
                        style={{
                          backgroundColor: getHeatColor(val),
                          color: 'white',
                        }}
                      >
                        {val != null ? (
                          <>
                            {isUp ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                            {isUp ? '+' : ''}{val.toFixed(2)}%
                          </>
                        ) : '—'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
