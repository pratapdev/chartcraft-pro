import React, { useState } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { fetchCandles } from '@/lib/marketData';
import { Candle } from '@/types/trading';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const SYMBOLS = [
  { name: 'BTC/USD', label: 'Bitcoin' },
  { name: 'ETH/USD', label: 'Ethereum' },
  { name: 'SOL/USD', label: 'Solana' },
  { name: 'BNB/USD', label: 'BNB' },
  { name: 'XRP/USD', label: 'Ripple' },
  { name: 'ADA/USD', label: 'Cardano' },
  { name: 'DOGE/USD', label: 'Dogecoin' },
  { name: 'AVAX/USD', label: 'Avalanche' },
];

interface WatchItem {
  symbol: string;
  label: string;
  price: number | null;
  change24h: number | null;
  sparkline: number[];
  loading: boolean;
}

const MiniSparkline: React.FC<{ data: number[]; up: boolean }> = ({ data, up }) => {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 60;
  const h = 20;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');

  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={up ? 'hsl(var(--bull))' : 'hsl(var(--bear))'}
        strokeWidth={1.5}
      />
    </svg>
  );
};

export const WatchlistPanel: React.FC = () => {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const setSymbol = useChartStore((s) => s.setSymbol);

  const loadWatchlist = async () => {
    if (loaded) return;
    setLoaded(true);

    const results = await Promise.all(
      SYMBOLS.map(async (s) => {
        try {
          const candles = await fetchCandles(s.name, '1h', 24);
          const price = candles.length > 0 ? candles[candles.length - 1].close : null;
          const firstClose = candles.length > 0 ? candles[0].close : null;
          const change24h = price && firstClose ? ((price - firstClose) / firstClose) * 100 : null;
          const sparkline = candles.map((c) => c.close);
          return { symbol: s.name, label: s.label, price, change24h, sparkline, loading: false };
        } catch {
          return { symbol: s.name, label: s.label, price: null, change24h: null, sparkline: [], loading: false };
        }
      })
    );
    setItems(results);
  };

  React.useEffect(() => { loadWatchlist(); }, []);

  return (
    <div className="space-y-0.5">
      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-1 mb-1">
        Watchlist
      </div>
      {items.length === 0 && (
        <div className="text-xs text-muted-foreground px-1">Loading...</div>
      )}
      {items.map((item) => {
        const isUp = (item.change24h ?? 0) >= 0;
        return (
          <button
            key={item.symbol}
            onClick={() => setSymbol(item.symbol)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent transition-colors text-xs"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground">{item.symbol}</div>
              <div className="text-[10px] text-muted-foreground truncate">{item.label}</div>
            </div>
            <MiniSparkline data={item.sparkline} up={isUp} />
            <div className="text-right min-w-[60px]">
              <div className="font-mono text-foreground">
                {item.price != null ? item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </div>
              <div className={`text-[10px] font-mono flex items-center justify-end gap-0.5 ${isUp ? 'text-bull' : 'text-bear'}`}>
                {isUp ? <TrendingUp size={8} /> : item.change24h != null ? <TrendingDown size={8} /> : <Minus size={8} />}
                {item.change24h != null ? `${isUp ? '+' : ''}${item.change24h.toFixed(2)}%` : '—'}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
