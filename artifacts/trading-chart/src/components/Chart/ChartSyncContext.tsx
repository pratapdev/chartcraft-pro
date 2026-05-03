import React, { createContext, useContext, useRef, useCallback } from 'react';
import { IChartApi, LogicalRange } from 'lightweight-charts';

interface ChartSyncContextValue {
  registerChart: (id: string, chart: IChartApi) => void;
  unregisterChart: (id: string) => void;
  syncRange: (sourceId: string, range: LogicalRange) => void;
  getMainLogicalRange: () => LogicalRange | null;
  getMainChart: () => IChartApi | null;
  subscribeMainRange: (handler: (range: LogicalRange) => void) => () => void;
  setMainContainer: (el: HTMLElement | null) => void;
  getMainContainer: () => HTMLElement | null;
}

const ChartSyncContext = createContext<ChartSyncContextValue | null>(null);

export const useChartSync = () => useContext(ChartSyncContext);

export const ChartSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const chartsRef = useRef<Map<string, IChartApi>>(new Map());
  const mainRangeListeners = useRef<Set<(range: LogicalRange) => void>>(new Set());
  const isSyncing = useRef(false);
  const mainContainerRef = useRef<HTMLElement | null>(null);

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

    if (sourceId === 'main') {
      mainRangeListeners.current.forEach((fn) => {
        try { fn(range); } catch {}
      });
    }

    isSyncing.current = false;
  }, []);

  const getMainLogicalRange = useCallback((): LogicalRange | null => {
    const mainChart = chartsRef.current.get('main');
    if (!mainChart) return null;
    try {
      return mainChart.timeScale().getVisibleLogicalRange();
    } catch {
      return null;
    }
  }, []);

  const getMainChart = useCallback((): IChartApi | null => {
    return chartsRef.current.get('main') ?? null;
  }, []);

  const subscribeMainRange = useCallback((handler: (range: LogicalRange) => void) => {
    mainRangeListeners.current.add(handler);
    return () => {
      mainRangeListeners.current.delete(handler);
    };
  }, []);

  const setMainContainer = useCallback((el: HTMLElement | null) => {
    mainContainerRef.current = el;
  }, []);

  const getMainContainer = useCallback((): HTMLElement | null => {
    return mainContainerRef.current;
  }, []);

  return (
    <ChartSyncContext.Provider value={{
      registerChart,
      unregisterChart,
      syncRange,
      getMainLogicalRange,
      getMainChart,
      subscribeMainRange,
      setMainContainer,
      getMainContainer,
    }}>
      {children}
    </ChartSyncContext.Provider>
  );
};
