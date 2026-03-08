import React, { createContext, useContext, useRef, useCallback } from 'react';
import { IChartApi, LogicalRange } from 'lightweight-charts';

interface ChartSyncContextValue {
  registerChart: (id: string, chart: IChartApi) => void;
  unregisterChart: (id: string) => void;
  syncRange: (sourceId: string, range: LogicalRange) => void;
}

const ChartSyncContext = createContext<ChartSyncContextValue | null>(null);

export const useChartSync = () => useContext(ChartSyncContext);

export const ChartSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const chartsRef = useRef<Map<string, IChartApi>>(new Map());
  const isSyncing = useRef(false);

  const registerChart = useCallback((id: string, chart: IChartApi) => {
    chartsRef.current.set(id, chart);
  }, []);

  const unregisterChart = useCallback((id: string) => {
    chartsRef.current.delete(id);
  }, []);

  const syncRange = useCallback((sourceId: string, range: LogicalRange) => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    chartsRef.current.forEach((chart, id) => {
      if (id !== sourceId) {
        try {
          chart.timeScale().setVisibleLogicalRange(range);
        } catch {}
      }
    });
    isSyncing.current = false;
  }, []);

  return (
    <ChartSyncContext.Provider value={{ registerChart, unregisterChart, syncRange }}>
      {children}
    </ChartSyncContext.Provider>
  );
};
