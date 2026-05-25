import React, { createContext, useContext, useRef, useCallback } from 'react';
import { IChartApi, Time, LogicalRange } from 'lightweight-charts';

export interface TimeRange {
  from: Time;
  to: Time;
}

interface ChartSyncContextValue {
  registerChart: (id: string, chart: IChartApi) => void;
  unregisterChart: (id: string) => void;
  broadcastTimeRange: (range: TimeRange) => void;
  broadcastLogicalRange: (range: LogicalRange) => void;
  getMainTimeRange: () => TimeRange | null;
  getMainLogicalRange: () => LogicalRange | null;
  getMainChart: () => IChartApi | null;
  subscribeMainTimeRange: (handler: (range: TimeRange) => void) => () => void;
  subscribeMainLogicalRange: (handler: (range: LogicalRange) => void) => () => void;
  setMainContainer: (el: HTMLElement | null) => void;
  getMainContainer: () => HTMLElement | null;
}

const ChartSyncContext = createContext<ChartSyncContextValue | null>(null);

export const useChartSync = () => useContext(ChartSyncContext);

export const ChartSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const chartsRef = useRef<Map<string, IChartApi>>(new Map());
  const timeRangeListeners = useRef<Set<(range: TimeRange) => void>>(new Set());
  const logicalRangeListeners = useRef<Set<(range: LogicalRange) => void>>(new Set());
  const lastTimeRangeRef = useRef<TimeRange | null>(null);
  const lastLogicalRangeRef = useRef<LogicalRange | null>(null);
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

  const broadcastLogicalRange = useCallback((range: LogicalRange) => {
    if (isSyncing.current) return;
    lastLogicalRangeRef.current = range;
    isSyncing.current = true;
    logicalRangeListeners.current.forEach((fn) => {
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

  const getMainLogicalRange = useCallback((): LogicalRange | null => {
    if (lastLogicalRangeRef.current) return lastLogicalRangeRef.current;
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

  const subscribeMainTimeRange = useCallback((handler: (range: TimeRange) => void) => {
    timeRangeListeners.current.add(handler);
    return () => {
      timeRangeListeners.current.delete(handler);
    };
  }, []);

  const subscribeMainLogicalRange = useCallback((handler: (range: LogicalRange) => void) => {
    logicalRangeListeners.current.add(handler);
    return () => {
      logicalRangeListeners.current.delete(handler);
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
      broadcastLogicalRange,
      getMainTimeRange,
      getMainLogicalRange,
      getMainChart,
      subscribeMainTimeRange,
      subscribeMainLogicalRange,
      setMainContainer,
      getMainContainer,
    }}>
      {children}
    </ChartSyncContext.Provider>
  );
};
