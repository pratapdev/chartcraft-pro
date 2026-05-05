import React, { useState, useCallback } from 'react';
import { MiniChart } from './MiniChart';
import { useChartStore } from '@/stores/chartStore';
import { Timeframe } from '@/types/trading';
import { LayoutGrid, Columns2 } from 'lucide-react';

const DEFAULT_TWO: Timeframe[] = ['1h', '1D'];
const DEFAULT_FOUR: Timeframe[] = ['15m', '1h', '4h', '1D'];
const CRYPTO_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD', 'ADA/USD', 'DOGE/USD', 'AVAX/USD'];

type GridMode = 2 | 4;

export const MultiTimeframeView: React.FC = () => {
  const globalSymbol = useChartStore((s) => s.symbol);
  const [syncTime, setSyncTime] = useState<number | null>(null);
  const [gridMode, setGridMode] = useState<GridMode>(4);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [twoTf, setTwoTf] = useState<Timeframe[]>([...DEFAULT_TWO]);
  const [fourTf, setFourTf] = useState<Timeframe[]>([...DEFAULT_FOUR]);
  const [twoSymbols, setTwoSymbols] = useState<string[]>([globalSymbol, globalSymbol]);
  const [fourSymbols, setFourSymbols] = useState<string[]>([globalSymbol, globalSymbol, globalSymbol, globalSymbol]);

  const timeframes = gridMode === 2 ? twoTf : fourTf;
  const symbols = gridMode === 2 ? twoSymbols : fourSymbols;

  const handleCrosshairMove = useCallback((time: number | null) => {
    setSyncTime(time);
  }, []);

  const handleTimeframeChange = useCallback((index: number, newTf: Timeframe) => {
    if (gridMode === 2) {
      setTwoTf((prev) => { const next = [...prev]; next[index] = newTf; return next; });
    } else {
      setFourTf((prev) => { const next = [...prev]; next[index] = newTf; return next; });
    }
  }, [gridMode]);

  const handleSymbolChange = useCallback((index: number, newSymbol: string) => {
    if (gridMode === 2) {
      setTwoSymbols((prev) => { const next = [...prev]; next[index] = newSymbol; return next; });
    } else {
      setFourSymbols((prev) => { const next = [...prev]; next[index] = newSymbol; return next; });
    }
  }, [gridMode]);

  const gridStyle = gridMode === 4
    ? { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }
    : { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: '1fr' };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-card">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-1">Layout</span>
        <button
          onClick={() => setGridMode(2)}
          className={`p-1 rounded transition-colors ${gridMode === 2 ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          title="2 windows"
        >
          <Columns2 size={14} />
        </button>
        <button
          onClick={() => setGridMode(4)}
          className={`p-1 rounded transition-colors ${gridMode === 4 ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          title="4 windows (2×2)"
        >
          <LayoutGrid size={14} />
        </button>
      </div>
      <div className="grid h-full" style={gridStyle}>
        {timeframes.map((tf, idx) => (
          <MiniChart
            key={`${gridMode}-${idx}`}
            symbol={symbols[idx]}
            timeframe={tf}
            onCrosshairMove={handleCrosshairMove}
            syncTime={syncTime}
            onTimeframeChange={(newTf) => handleTimeframeChange(idx, newTf)}
            onSymbolChange={(newSymbol) => handleSymbolChange(idx, newSymbol)}
            availableSymbols={CRYPTO_SYMBOLS}
          />
        ))}
      </div>
    </div>
  );
};
