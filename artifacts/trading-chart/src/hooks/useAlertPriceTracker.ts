import { useEffect, useRef, useCallback } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { fetchCandles, subscribeToCandles } from '@/lib/marketData';
import { Timeframe } from '@/types/trading';

/**
 * Background price tracker that maintains WebSocket connections
 * for all symbols/timeframes that have active alerts,
 * independent of the currently viewed chart.
 * 
 * Handles offline→online recovery by re-fetching candles to fill gaps.
 */
export function useAlertPriceTracker() {
  const alerts = useChartStore((s) => s.alerts);
  const indicatorCrossAlerts = useChartStore((s) => s.indicatorCrossAlerts);
  const indicatorThresholdAlerts = useChartStore((s) => s.indicatorThresholdAlerts);
  const stochRSICrossAlerts = useChartStore((s) => s.stochRSICrossAlerts);
  const smartMoneyAlerts = useChartStore((s) => s.smartMoneyAlerts);
  const currentSymbol = useChartStore((s) => s.symbol);
  const currentTimeframe = useChartStore((s) => s.timeframe);
  const marketType = useChartStore((s) => s.marketType);

  const subsRef = useRef<Map<string, () => void>>(new Map());
  const activeKeysRef = useRef<Set<string>>(new Set());

  /** Re-fetch candles for all tracked keys to fill gaps after reconnect */
  const refetchAll = useCallback(() => {
    const store = useChartStore.getState();
    const currentKey = `${store.symbol}:${store.timeframe}`;

    // Refetch for current chart
    store.loadCandles();

    // Refetch for all background-tracked keys
    for (const key of activeKeysRef.current) {
      if (key === currentKey) continue;
      const [symbol, timeframe] = key.split(':') as [string, Timeframe];
      fetchCandles(symbol, timeframe, 200)
        .then((candles) => {
          useChartStore.getState().setAlertCandles(key, candles);
        })
        .catch((err) => {
          console.error(`[AlertTracker] Refetch failed for ${key}:`, err);
        });
    }
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('[AlertTracker] Browser came online — refetching candles to fill gaps');
      // Small delay to let network stabilize
      setTimeout(refetchAll, 1500);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible again — check for gaps
        const store = useChartStore.getState();
        const currentKey = `${store.symbol}:${store.timeframe}`;
        const candles = store.alertCandles[currentKey];
        if (candles && candles.length > 0) {
          const lastTime = candles[candles.length - 1].time;
          const now = Math.floor(Date.now() / 1000);
          const gapSeconds = now - lastTime;
          // If gap > 2 minutes, refetch to fill
          if (gapSeconds > 120) {
            console.log(`[AlertTracker] Tab visible, ${Math.round(gapSeconds / 60)}min gap detected — refetching`);
            refetchAll();
          }
        }
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refetchAll]);

  useEffect(() => {
    // Collect all unique symbol+timeframe pairs from active alerts
    const pairs = new Set<string>();

    const allAlerts = [
      ...alerts.filter((a) => a.active && !a.triggered),
      ...indicatorCrossAlerts.filter((a) => a.active && !a.triggered),
      ...(indicatorThresholdAlerts ?? []).filter((a) => a.active && !a.triggered),
      ...(stochRSICrossAlerts ?? []).filter((a) => a.active && !a.triggered),
      ...(smartMoneyAlerts ?? []).filter((a) => a.active),
    ];

    for (const alert of allAlerts) {
      const key = `${alert.symbol}:${alert.timeframe}`;
      pairs.add(key);
    }

    const currentKey = `${currentSymbol}:${currentTimeframe}`;

    // Sync current chart candles into alertCandles
    const store = useChartStore.getState();
    if (store.candles.length > 0) {
      store.setAlertCandles(currentKey, store.candles);
    }

    // Determine which keys need background subscriptions
    const neededKeys = new Set<string>();
    for (const key of pairs) {
      if (key !== currentKey) {
        neededKeys.add(key);
      }
    }

    // Track all active keys (including current) for refetch
    activeKeysRef.current = new Set([...pairs, currentKey]);

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

      if (marketType !== 'crypto') continue;

      // Placeholder to mark as "pending"
      const placeholderUnsub = () => {};
      subsRef.current.set(key, placeholderUnsub);

      // Fetch initial candles then subscribe
      fetchCandles(symbol, timeframe, 200)
        .then((candles) => {
          // If key was removed while fetching, don't subscribe
          if (!subsRef.current.has(key) || subsRef.current.get(key) !== placeholderUnsub) {
            return;
          }
          useChartStore.getState().setAlertCandles(key, candles);

          const unsub = subscribeToCandles(symbol, timeframe, (candle) => {
            useChartStore.getState().updateAlertCandle(key, candle);
          });
          subsRef.current.set(key, unsub);
        })
        .catch((err) => {
          console.error(`[AlertTracker] Failed to fetch candles for ${key}:`, err);
          // Remove placeholder so it can retry on next effect run
          if (subsRef.current.get(key) === placeholderUnsub) {
            subsRef.current.delete(key);
          }
        });
    }
  }, [alerts, indicatorCrossAlerts, indicatorThresholdAlerts, stochRSICrossAlerts, smartMoneyAlerts, currentSymbol, currentTimeframe, marketType]);

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
