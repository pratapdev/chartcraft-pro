import React from 'react';
import { CandlestickChart } from './CandlestickChart';
import { ChartHeader } from './ChartHeader';
import { IndicatorPane } from './IndicatorPane';
import { ChartSyncProvider } from './ChartSyncContext';
import { useChartStore } from '@/stores/chartStore';

const SUB_CHART_TYPES = new Set(['RSI', 'STOCH_RSI', 'MACD', 'ADX', 'ATR', 'OBV', 'PCT_DIFF_DON']);

export const ChartContainer: React.FC = () => {
  const indicators = useChartStore((s) => s.indicators);
  const subIndicators = indicators.filter((i) => i.visible && SUB_CHART_TYPES.has(i.type));

  return (
    <ChartSyncProvider>
      <div className="flex flex-col h-full bg-background">
        <ChartHeader />
        <div className="flex-1 relative min-h-0">
          <CandlestickChart />
        </div>
        {subIndicators.map((ind) => (
          <IndicatorPane key={ind.id} indicator={ind} />
        ))}
      </div>
    </ChartSyncProvider>
  );
};
