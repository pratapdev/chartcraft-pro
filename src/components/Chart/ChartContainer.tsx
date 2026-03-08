import React from 'react';
import { CandlestickChart } from './CandlestickChart';
import { ChartHeader } from './ChartHeader';

export const ChartContainer: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-background">
      <ChartHeader />
      <div className="flex-1 relative min-h-0">
        <CandlestickChart />
      </div>
    </div>
  );
};
