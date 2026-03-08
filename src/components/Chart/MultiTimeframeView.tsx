import React, { useState, useCallback } from 'react';
import { MiniChart } from './MiniChart';
import { useChartStore } from '@/stores/chartStore';
import { Timeframe } from '@/types/trading';

const DEFAULT_TIMEFRAMES: Timeframe[] = ['15m', '1h', '4h', '1D'];

export const MultiTimeframeView: React.FC = () => {
  const symbol = useChartStore((s) => s.symbol);
  const [syncTime, setSyncTime] = useState<number | null>(null);
  const [timeframes] = useState<Timeframe[]>(DEFAULT_TIMEFRAMES);

  const handleCrosshairMove = useCallback((time: number | null) => {
    setSyncTime(time);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${timeframes.length}, 1fr)` }}>
        {timeframes.map((tf) => (
          <MiniChart
            key={tf}
            symbol={symbol}
            timeframe={tf}
            onCrosshairMove={handleCrosshairMove}
            syncTime={syncTime}
          />
        ))}
      </div>
    </div>
  );
};
