import { useEffect, useRef } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { fetchCandles, subscribeToCandles } from '@/lib/marketData';
import { Timeframe } from '@/types/trading';

/**
 * Background price tracker that maintains WebSocket connections
 * for all symbols/timeframes that have active alerts,
 * independent of the currently viewed chart.
 */
export function useAlertPriceTracker() {
  const alerts = useChartStore((s) => s.alerts);
  const indicatorCrossAlerts = useChartStore((s) => s.indicatorCrossAlerts);
  const indicatorThresholdAlerts = useChartStore((s) => s.indicatorThresholdAlerts);
  const stochRSICrossAlerts = useChartStore((s) => s.stochRSICrossAlerts);
  const currentSymbol = useChartStore((s) => s.symbol);
  const currentTimeframe = useChartStore((s) => s.timeframe);
  const marketType = useChartStore((s) => s.marketType);

  const subsRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    // Collect all unique symbol+timeframe pairs from active alerts
    const pairs = new Set<string>();

    const allAlerts = [
      ...alerts.filter((a) => a.active && !a.triggered),
      ...indicatorCrossAlerts.filter((a) => a.active && !a.triggered),
      ...(indicatorThresholdAlerts ?? []).filter((a) => a.active && !a.triggered),
      ...(stochRSICrossAlerts ?? []).filter((a) => a.active && !a.triggered),
    ];

    for (const alert of allAlerts) {
      const key = `${alert.symbol}:${alert.timeframe}`;
      pairs.add(key);
    }

    // Current chart's symbol:timeframe is already tracked by the main chart
    const currentKey = `${currentSymbol}:${currentTimeframe}`;

    // Sync current chart candles into alertCandles for the current key
    const store = useChartStore.getState();
    if (store.candles.length > 0) {
      store.setAlertCandles(currentKey, store.candles);
    }

    // Determine which keys need new subscriptions and which to remove
    const neededKeys = new Set<string>();
    for (const key of pairs) {
      if (key !== currentKey) {
        neededKeys.add(key);
      }
    }

    // Remove subscriptions no longer needed
    for (const [key, unsub] of subsRef.current.entries()) {
      if (!neededKeys.has(key)) {
        unsub();
        subsRef.current.delete(key);
      }
    }

    // Add new subscriptions
    for (const key of neededKeys) {
      if (subsRef.current.has(key)) continue;

      const [symbol, timeframe] = key.split(':') as [string, Timeframe];

      // Only crypto supports WebSocket background tracking
      if (marketType !== 'crypto') continue;

      // Fetch initial candles then subscribe
      fetchCandles(symbol, timeframe, 200).then((candles) => {
        useChartStore.getState().setAlertCandles(key, candles);

        const unsub = subscribeToCandles(symbol, timeframe, (candle) => {
          useChartStore.getState().updateAlertCandle(key, candle);
        });

        // Store unsubscribe (check if still needed)
        if (subsRef.current.has(key)) {
          // Already replaced, clean up
          unsub();
        } else {
          subsRef.current.set(key, unsub);
        }
      });

      // Placeholder to mark as "pending"
      subsRef.current.set(key, () => {});
    }

    return () => {
      // Don't cleanup on every re-render, only on unmount
    };
  }, [alerts, indicatorCrossAlerts, indicatorThresholdAlerts, stochRSICrossAlerts, currentSymbol, currentTimeframe, marketType]);

  // Keep current chart candles synced to alertCandles
  const candles = useChartStore((s) => s.candles);
  useEffect(() => {
    if (candles.length > 0) {
      const key = `${currentSymbol}:${currentTimeframe}`;
      useChartStore.getState().setAlertCandles(key, candles);
    }
  }, [candles, currentSymbol, currentTimeframe]);

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      for (const unsub of subsRef.current.values()) {
        unsub();
      }
      subsRef.current.clear();
    };
  }, []);
}
