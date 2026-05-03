import React, { createContext, useContext, useRef, useCallback } from 'react';
import { IChartApi, Time } from 'lightweight-charts';

export interface TimeRange {
  from: Time;
  to: Time;
}

interface ChartSyncContextValue {
  registerChart: (id: string, chart: IChartApi) => void;
  unregisterChart: (id: string) => void;
  broadcastTimeRange: (range: TimeRange) => void;
  getMainTimeRange: () => TimeRange | null;
  getMainChart: () => IChartApi | null;
  subscribeMainTimeRange: (handler: (range: TimeRange) => void) => () => void;
  setMainContainer: (el: HTMLElement | null) => void;
  getMainContainer: () => HTMLElement | null;
}

const ChartSyncContext = createContext<ChartSyncContextValue | null>(null);

export const useChartSync = () => useContext(ChartSyncContext);

export const ChartSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const chartsRef = useRef<Map<string, IChartApi>>(new Map());
  const timeRangeListeners = useRef<Set<(range: TimeRange) => void>>(new Set());
  const lastTimeRangeRef = useRef<TimeRange | null>(null);
  const isSyncing = useRef(false);
  const mainContainerRef = useRef<HTMLElement | null>(null);

  const registerChart = useCallback((id: string, chart: IChartApi) => {
    chartsRef.current.set(id, chart);
  }, []);

  const unregisterChart = useCallback((id: string) => {
    chartsRef.current.delete(id);
  }, []);

  const broadcastTimeRange = useCallback((range: TimeRange) => {
    if (isSyncing.current) return;
    lastTimeRangeRef.current = range;
    isSyncing.current = true;
    timeRangeListeners.current.forEach((fn) => {
      try { fn(range); } catch {}
    });
    isSyncing.current = false;
  }, []);

  const getMainTimeRange = useCallback((): TimeRange | null => {
    if (lastTimeRangeRef.current) return lastTimeRangeRef.current;
    const mainChart = chartsRef.current.get('main');
    if (!mainChart) return null;
    try {
      return mainChart.timeScale().getVisibleRange() as TimeRange | null;
    } catch {
      return null;
    }
  }, []);

  const getMainChart = useCallback((): IChartApi | null => {
    return chartsRef.current.get('main') ?? null;
  }, []);

  const subscribeMainTimeRange = useCallback((handler: (range: TimeRange) => void) => {
    timeRangeListeners.current.add(handler);
    return () => {
      timeRangeListeners.current.delete(handler);
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
      broadcastTimeRange,
      getMainTimeRange,
      getMainChart,
      subscribeMainTimeRange,
      setMainContainer,
      getMainContainer,
    }}>
      {children}
    </ChartSyncContext.Provider>
  );
};
