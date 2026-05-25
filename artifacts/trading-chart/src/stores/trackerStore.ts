import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TrackerSymbol, TrackedEntry, StrategyConfig } from '@/types/tracker';
import { Timeframe } from '@/types/trading';

interface TrackerState {
  /** Symbols being watched for crossovers */
  watchlist: TrackerSymbol[];
  /** Active and historical tracked entries */
  entries: TrackedEntry[];

  addSymbol: (symbol: string, timeframe: Timeframe, strategy: StrategyConfig) => void;
  removeSymbol: (symbol: string) => void;
  addEntry: (entry: TrackedEntry) => void;
  updateEntry: (id: string, patch: Partial<TrackedEntry>) => void;
  stopTracking: (id: string) => void;
  removeEntry: (id: string) => void;
  clearAllEntries: () => void;
}

export const useTrackerStore = create<TrackerState>()(
  persist(
    (set) => ({
      watchlist: [],
      entries: [],

      addSymbol: (symbol, timeframe, strategy) =>
        set((s) => {
          const exists = s.watchlist.some(w => w.symbol === symbol && w.timeframe === timeframe);
          if (exists) return s;
          return {
            watchlist: [{ symbol, timeframe, strategy }, ...s.watchlist],
          };
        }),

      removeSymbol: (symbol, timeframe) =>
        set((s) => ({
          watchlist: s.watchlist.filter((w) => !(w.symbol === symbol && w.timeframe === timeframe)),
        })),

      addEntry: (entry) =>
        set((s) => ({ entries: [entry, ...s.entries] })),

      updateEntry: (id, patch) =>
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),

      stopTracking: (id) =>
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, active: false } : e)),
        })),

      removeEntry: (id) =>
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      clearAllEntries: () => set({ entries: [] }),
    }),
    { name: 'tracker-store' }
  )
);
