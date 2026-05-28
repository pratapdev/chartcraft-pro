import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TradeDirection = 'long' | 'short';
export type TradeStatus = 'open' | 'closed';

export interface Trade {
  id: string;
  symbol: string;
  direction: TradeDirection;
  entryTime: number;    // unix seconds
  entryPrice: number;
  quantity: number;
  notes: string;
  status: TradeStatus;
  exitPrice?: number;
  exitTime?: number;    // unix seconds
}

interface TradeStore {
  trades: Trade[];
  addTrade: (trade: Omit<Trade, 'id' | 'status'>) => string;
  closeTrade: (id: string, exitPrice: number, exitTime: number) => void;
  updateTrade: (id: string, updates: Partial<Pick<Trade, 'notes' | 'quantity' | 'entryPrice'>>) => void;
  deleteTrade: (id: string) => void;
  clearAllTrades: () => void;
}

export const useTradeStore = create<TradeStore>()(
  persist(
    (set) => ({
      trades: [],

      addTrade: (trade) => {
        const id = `trade_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        set((s) => ({
          trades: [
            ...s.trades,
            { ...trade, id, status: 'open' },
          ],
        }));
        return id;
      },

      closeTrade: (id, exitPrice, exitTime) =>
        set((s) => ({
          trades: s.trades.map((t) =>
            t.id === id ? { ...t, status: 'closed', exitPrice, exitTime } : t
          ),
        })),

      updateTrade: (id, updates) =>
        set((s) => ({
          trades: s.trades.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      deleteTrade: (id) =>
        set((s) => ({ trades: s.trades.filter((t) => t.id !== id) })),

      clearAllTrades: () => set({ trades: [] }),
    }),
    {
      name: 'trade-book',
      partialize: (state) => ({ trades: state.trades }),
    }
  )
);

/** Compute unrealized P&L for an open trade */
export function computeUnrealizedPnl(trade: Trade, currentPrice: number): number {
  const mult = trade.direction === 'long' ? 1 : -1;
  return (currentPrice - trade.entryPrice) * trade.quantity * mult;
}

/** Compute realized P&L for a closed trade */
export function computeRealizedPnl(trade: Trade): number {
  if (trade.status !== 'closed' || trade.exitPrice === undefined) return 0;
  const mult = trade.direction === 'long' ? 1 : -1;
  return (trade.exitPrice - trade.entryPrice) * trade.quantity * mult;
}

/** Compute P&L as percentage */
export function computePnlPct(trade: Trade, currentPrice: number): number {
  const ref = trade.status === 'closed' && trade.exitPrice !== undefined
    ? trade.exitPrice
    : currentPrice;
  const mult = trade.direction === 'long' ? 1 : -1;
  return ((ref - trade.entryPrice) / trade.entryPrice) * 100 * mult;
}

/** Format a duration between two unix timestamps as "Xd Yh Zm" */
export function formatDuration(fromSecs: number, toSecs: number): string {
  const diff = Math.max(0, toSecs - fromSecs);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
