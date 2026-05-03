import React from 'react';
import { ScreenerRow } from '@/lib/screenerService';
import { Star } from 'lucide-react';
import { useChartStore } from '@/stores/chartStore';
import { useNavigate } from 'react-router-dom';

interface Props {
  data: ScreenerRow[];
}

function getHeatColor(value: number): string {
  const clamped = Math.max(-10, Math.min(10, value));
  if (clamped >= 0) {
    const intensity = Math.min(1, clamped / 10);
    return `hsl(145 ${40 + intensity * 30}% ${45 - intensity * 20}%)`;
  } else {
    const intensity = Math.min(1, Math.abs(clamped) / 10);
    return `hsl(0 ${40 + intensity * 30}% ${45 - intensity * 20}%)`;
  }
}

function getSize(volume: number, maxVolume: number): number {
  const minSize = 80;
  const maxSize = 200;
  if (maxVolume === 0) return minSize;
  return minSize + (volume / maxVolume) * (maxSize - minSize);
}

export const ScreenerHeatmap: React.FC<Props> = ({ data }) => {
  const navigate = useNavigate();
  const { setSymbol, favorites, toggleFavorite } = useChartStore();
  const maxVolume = Math.max(...data.map(r => r.volume24h), 1);

  const handleClick = (symbol: string) => {
    setSymbol(symbol);
    navigate('/');
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-2 justify-center">
        {data.map((row) => {
          const size = getSize(row.volume24h, maxVolume);
          const isFav = favorites.includes(row.symbol);
          return (
            <div
              key={row.symbol}
              className="relative rounded-lg cursor-pointer transition-all hover:scale-105 hover:shadow-lg flex flex-col items-center justify-center text-center"
              style={{
                width: size,
                height: size * 0.7,
                backgroundColor: getHeatColor(row.change24h),
                minWidth: 80,
              }}
              onClick={() => handleClick(row.symbol)}
            >
              <button
                className="absolute top-1 right-1 p-0.5 opacity-60 hover:opacity-100 z-10"
                onClick={(e) => { e.stopPropagation(); toggleFavorite(row.symbol); }}
              >
                <Star className={`h-3 w-3 ${isFav ? 'fill-yellow-400 text-yellow-400' : 'text-white/70'}`} />
              </button>
              <span className="text-white font-bold text-xs">
                {row.symbol.replace('/USD', '')}
              </span>
              <span className="text-white/90 font-mono text-[10px]">
                {row.change24h >= 0 ? '+' : ''}{row.change24h.toFixed(2)}%
              </span>
              <span className="text-white/60 font-mono text-[9px]">
                ${row.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
