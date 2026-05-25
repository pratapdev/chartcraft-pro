import React, { useEffect, useRef } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { useTrackerStore } from '@/stores/trackerStore';
import { checkSyncHealth, extractSyncPayload, pushState, pullState } from '@/lib/syncService';
import type { Timeframe, MarketType } from '@/types/trading';

/**
 * SyncManager handles the background auto-sync logic.
 * It is mounted at the app level to ensure it runs even if the sidebar is closed.
 */
export const SyncManager: React.FC = () => {
  const setStatus = useChartStore(s => s.setSyncStatus);
  const setLastResult = useChartStore(s => s.setLastSyncResult);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // We don't use a state for autoSync here to avoid re-renders of the logic component,
    // we just check localStorage periodically or on mount.
    const autoSync = localStorage.getItem('auto-sync') !== 'false';
    
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (autoSync) {
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      const doPush = async () => {
        const ok = await checkSyncHealth();
        if (ok) {
          const payload = extractSyncPayload(useChartStore.getState(), useTrackerStore.getState());
          console.log('[Sync] Pushing state to server...', {
            symbols: payload.trackerWatchlist.length,
            entries: payload.trackerEntries.length
          });
          const pushed = await pushState(payload);
          setStatus('online');
          if (pushed) {
            const now = new Date().toLocaleTimeString();
            localStorage.setItem('last-sync-time', now);
          }
          setLastResult(pushed ? 'Auto-synced ✓' : 'Auto-sync failed ✗');
          console.log(pushed ? '[Sync] Push successful.' : '[Sync] Push failed.');
        } else {
          setStatus('offline');
        }
      };


      const debouncedPush = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(doPush, 5000); // Wait 5s after last action to push (reduce DB load)
      };

      // NEW: Subscribe to all relevant store changes for immediate auto-sync
      const unsub = useChartStore.subscribe((state, prevState) => {
        // Only push if data-related fields changed
        const dataChanged = 
          state.trendlines !== prevState.trendlines ||
          state.indicators !== prevState.indicators ||
          state.alerts !== prevState.alerts ||
          state.fibonacciDrawings !== prevState.fibonacciDrawings ||
          state.layouts !== prevState.layouts ||
          state.symbol !== prevState.symbol ||
          state.timeframe !== prevState.timeframe ||
          state.indicatorCrossAlerts !== prevState.indicatorCrossAlerts ||
          state.indicatorThresholdAlerts !== prevState.indicatorThresholdAlerts ||
          state.stochRSICrossAlerts !== prevState.stochRSICrossAlerts ||
          state.pctDiffDonCrossAlerts !== prevState.pctDiffDonCrossAlerts ||
          state.smartMoneyAlerts !== prevState.smartMoneyAlerts ||
          state.compoundAlerts !== prevState.compoundAlerts;

        if (dataChanged) {
          debouncedPush();
        }
      });

      // Track tracker changes too - but ignore noisy perf updates
      const unsubTracker = useTrackerStore.subscribe((state, prevState) => {
        const watchlistChanged = state.watchlist !== prevState.watchlist;
        
        // Only trigger push if entry count changed or if a new entry was added
        // (Ignore updates to perf/currentPrice fields which happen every second)
        const entriesAddedOrRemoved = state.entries.length !== prevState.entries.length;
        
        // Deep check for structural changes if length is same
        let structuralEntryChange = false;
        if (!entriesAddedOrRemoved && state.entries !== prevState.entries) {
          structuralEntryChange = state.entries.some((e, i) => {
            const pe = prevState.entries[i];
            return !pe || e.id !== pe.id || e.active !== pe.active;
          });
        }

        if (watchlistChanged || entriesAddedOrRemoved || structuralEntryChange) {
          // Push faster for Tracker additions (1s instead of 5s)
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(doPush, 1000);
        }
      });



      const initialPull = async () => {
        console.log('[Sync] Starting initial pull...');
        // Wait for stores to hydrate from localStorage first
        let attempts = 0;
        while (attempts < 10 && (!(useChartStore as any).persist?.hasHydrated() || !(useTrackerStore as any).persist?.hasHydrated())) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }
        console.log(`[Sync] Hydration complete after ${attempts} attempts`);

        setStatus('checking');
        const data = await pullState();
        if (data) {
          console.log('[Sync] Pull successful, merging data...', {
            chart: data.trendlines.length,
            watchlist: data.trackerWatchlist.length,
            entries: data.trackerEntries.length
          });
          const chartState = useChartStore.getState();
          const trackerState = useTrackerStore.getState();
          
          // MERGE Tracker state
          const rawMergedWatchlist = [...data.trackerWatchlist, ...trackerState.watchlist];
          const mergedWatchlist = rawMergedWatchlist.filter((w, i, self) => 
            i === self.findIndex(t => t.symbol === w.symbol && t.timeframe === w.timeframe)
          );

          const rawMergedEntries = [...data.trackerEntries, ...trackerState.entries];
          const mergedEntries = rawMergedEntries.filter((e, i, self) => 
            i === self.findIndex(t => t.id === e.id)
          );

          useTrackerStore.setState({
            watchlist: mergedWatchlist,
            entries: mergedEntries,
          });


          // Apply Chart state
          const chartLocalEmpty = chartState.trendlines.length === 0 && chartState.indicators.length === 0;
          if (data.trendlines.length > 0 || data.indicators.length > 0 || chartLocalEmpty) {
            useChartStore.setState({
              trendlines: data.trendlines,
              indicators: data.indicators,
              alerts: data.alerts,
              alertLogs: data.alertLogs,
              fibonacciDrawings: data.fibonacciDrawings,
              indicatorCrossAlerts: data.indicatorCrossAlerts,
              indicatorThresholdAlerts: data.indicatorThresholdAlerts,
              stochRSICrossAlerts: data.stochRSICrossAlerts,
              pctDiffDonCrossAlerts: data.pctDiffDonCrossAlerts,
              smartMoneyAlerts: (data as any).smartMoneyAlerts || [],
              compoundAlerts: (data as any).compoundAlerts || [],
              layouts: data.layouts,
              riskRewardDrawings: (data as any).riskRewardDrawings || [],
            });
            if (data.state) {
              chartState.setSymbol(data.state.symbol);
              chartState.setTimeframe(data.state.timeframe as Timeframe);
              chartState.setMarketType(data.state.marketType as MarketType);
              chartState.setChartFontSize(data.state.chartFontSize);
            }
          }

          setStatus('online');
          const now = new Date().toLocaleTimeString();
          localStorage.setItem('last-sync-time', now);
          console.log('[Sync] Initial sync complete.');
        } else {
          console.warn('[Sync] Initial pull returned no data or failed.');
          setStatus('offline');
        }

        
        // Start periodic push as a fallback
        intervalRef.current = setInterval(doPush, 60_000); // 1 minute fallback
      };

      initialPull();

      // Force push on page unload
      const handleUnload = () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          doPush(); // Attempt a final push
        }
      };
      window.addEventListener('beforeunload', handleUnload);

      return () => {
        unsub();
        unsubTracker();
        window.removeEventListener('beforeunload', handleUnload);
        if (debounceTimer) clearTimeout(debounceTimer);
      };

    }

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [setStatus, setLastResult]);


  return null; // Logic-only component
};
