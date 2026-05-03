import React, { useState, useEffect } from 'react';
import { fetchScreenerData, ScreenerRow } from '@/lib/screenerService';
import { Timeframe } from '@/types/trading';
import { useChartStore } from '@/stores/chartStore';
import { useNavigate } from 'react-router-dom';
import { Star, Loader2 } from 'lucide-react';

const MTF_TIMEFRAMES: Timeframe[] = ['15m', '1h', '4h', '1D'];

interface MTFData {
  symbol: string;
  price: number;
  timeframes: Record<string, { rsi: number | null; supertrend: string | null; macdHist: number | null; change: number }>;
}

export const MultiTimeframePanel: React.FC = () => {
  const navigate = useNavigate();
  const { setSymbol, favorites, toggleFavorite } = useChartStore();
  const [data, setData] = useState<MTFData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Fetch data for each timeframe
      const results: Record<string, ScreenerRow[]> = {};
      await Promise.all(
        MTF_TIMEFRAMES.map(async (tf) => {
          try {
            results[tf] = await fetchScreenerData(tf);
          } catch { results[tf] = []; }
        })
      );

      // Merge by symbol
      const symbolSet = new Set<string>();
      Object.values(results).forEach(rows => rows.forEach(r => symbolSet.add(r.symbol)));

      const merged: MTFData[] = Array.from(symbolSet).map(symbol => {
        const firstRow = Object.values(results).flat().find(r => r.symbol === symbol);
        const timeframes: MTFData['timeframes'] = {};
        MTF_TIMEFRAMES.forEach(tf => {
          const row = results[tf]?.find(r => r.symbol === symbol);
          timeframes[tf] = {
            rsi: row?.rsi ?? null,
            supertrend: row?.supertrend ?? null,
            macdHist: row?.macd?.histogram ?? null,
            change: row?.change24h ?? 0,
          };
        });
        return { symbol, price: firstRow?.price ?? 0, timeframes };
      });

      setData(merged);
      setLoading(false);
    };
    load();
  }, []);

  const handleClick = (symbol: string) => {
    setSymbol(symbol);
    navigate('/');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading multi-timeframe data (this may take a moment)...</span>
      </div>
    );
  }

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-card border-b border-border z-10">
          <tr>
            <th className="text-left p-3 text-xs font-medium text-muted-foreground">COIN</th>
            <th className="text-right p-3 text-xs font-medium text-muted-foreground">PRICE</th>
            {MTF_TIMEFRAMES.map(tf => (
              <th key={tf} colSpan={3} className="text-center p-2 text-xs font-medium text-muted-foreground border-l border-border">
                {tf}
              </th>
            ))}
          </tr>
          <tr className="border-b border-border">
            <th colSpan={2}></th>
            {MTF_TIMEFRAMES.map(tf => (
              <React.Fragment key={tf}>
                <th className="text-center p-1.5 text-[10px] text-muted-foreground border-l border-border">RSI</th>
                <th className="text-center p-1.5 text-[10px] text-muted-foreground">TREND</th>
                <th className="text-center p-1.5 text-[10px] text-muted-foreground">MACD</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const isFav = favorites.includes(row.symbol);
            return (
              <tr
                key={row.symbol}
                className="border-b border-border hover:bg-accent/30 cursor-pointer transition-colors"
                onClick={() => handleClick(row.symbol)}
              >
                <td className="p-3 text-xs font-semibold font-mono flex items-center gap-1.5">
                  <button
                    className="shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(row.symbol); }}
                  >
                    <Star className={`h-3 w-3 ${isFav ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-foreground'}`} />
                  </button>
                  {row.symbol.replace('/USD', '')}
                </td>
                <td className="p-3 text-right font-mono text-xs">
                  ${row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                {MTF_TIMEFRAMES.map(tf => {
                  const d = row.timeframes[tf];
                  return (
                    <React.Fragment key={tf}>
                      <td className={`p-1.5 text-center font-mono text-[10px] border-l border-border ${d?.rsi != null ? (d.rsi < 30 ? 'text-bull' : d.rsi > 70 ? 'text-bear' : 'text-muted-foreground') : ''}`}>
                        {d?.rsi != null ? d.rsi.toFixed(0) : '-'}
                      </td>
                      <td className="p-1.5 text-center text-[10px]">
                        {d?.supertrend === 'bullish' ? (
                          <span className="text-bull">↑</span>
                        ) : d?.supertrend === 'bearish' ? (
                          <span className="text-bear">↓</span>
                        ) : '-'}
                      </td>
                      <td className="p-1.5 text-center text-[10px]">
                        {d?.macdHist != null ? (
                          <span className={d.macdHist > 0 ? 'text-bull' : 'text-bear'}>
                            {d.macdHist > 0 ? '↗' : '↘'}
                          </span>
                        ) : '-'}
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
