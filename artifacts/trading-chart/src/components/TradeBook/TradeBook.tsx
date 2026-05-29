import React, { useState, useMemo } from 'react';
import {
  useTradeStore,
  Trade,
  computeUnrealizedPnl,
  computeRealizedPnl,
  computePnlPct,
  formatDuration,
} from '@/stores/tradeStore';
import { useChartStore } from '@/stores/chartStore';
import { TradeEntryForm } from './TradeEntryForm';
import { Plus, Trash2, TrendingUp, TrendingDown, X, CheckSquare } from 'lucide-react';

type Tab = 'open' | 'closed';

export const TradeBook: React.FC = () => {
  const { trades, closeTrade, deleteTrade, clearAllTrades } = useTradeStore();

  // Granular selectors — only re-render when price or time changes, not the whole candles array
  const currentPrice = useChartStore((s) => {
    const c = s.candles;
    return c.length > 0 ? c[c.length - 1].close : 0;
  });
  const currentTime = useChartStore((s) => {
    if (s.dataSource === 'csv' && s.backtestCandles.length > 0) {
      const idx = Math.max(0, s.backtestIndex - 1);
      return s.backtestCandles[idx]?.time ?? Math.floor(Date.now() / 1000);
    }
    return Math.floor(Date.now() / 1000);
  });
  const dataSource = useChartStore((s) => s.dataSource);

  const [activeTab, setActiveTab] = useState<Tab>('open');
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [closeTarget, setCloseTarget] = useState<Trade | null>(null);
  const [closePrice, setClosePrice] = useState('');

  const openTrades = trades.filter((t) => t.status === 'open');
  const closedTrades = trades.filter((t) => t.status === 'closed')
    .sort((a, b) => (b.exitTime ?? 0) - (a.exitTime ?? 0));

  const totalOpenPnl = openTrades.reduce(
    (sum, t) => sum + computeUnrealizedPnl(t, currentPrice), 0
  );
  const totalRealizedPnl = closedTrades.reduce(
    (sum, t) => sum + computeRealizedPnl(t), 0
  );

  const handleCloseConfirm = () => {
    if (!closeTarget) return;
    const price = parseFloat(closePrice);
    if (isNaN(price) || price <= 0) return;
    closeTrade(closeTarget.id, price, currentTime);
    setCloseTarget(null);
    setClosePrice('');
  };

  const formatPrice = (p: number) =>
    p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });

  const formatPnl = (pnl: number) => {
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (unix: number) =>
    new Date(unix * 1000).toLocaleString('en-US', {
      month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });

  // ── Close Trade modal ────────────────────────────────────────────────────
  if (closeTarget) {
    return (
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold">Close Trade</h3>
          <button onClick={() => setCloseTarget(null)} className="trading-btn p-0.5"><X size={12} /></button>
        </div>
        <div className="bg-accent rounded p-2 text-xs space-y-0.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Symbol</span>
            <span className="font-semibold">{closeTarget.symbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Direction</span>
            <span className={closeTarget.direction === 'long' ? 'text-bull font-semibold' : 'text-bear font-semibold'}>
              {closeTarget.direction === 'long' ? '↑ Long' : '↓ Short'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Entry Price</span>
            <span className="font-mono">{formatPrice(closeTarget.entryPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Qty</span>
            <span className="font-mono">{closeTarget.quantity}</span>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
            Exit Price
            <button
              type="button"
              onClick={() => setClosePrice(currentPrice.toFixed(2))}
              className="ml-2 text-primary hover:underline"
            >
              Use current ({currentPrice.toFixed(2)})
            </button>
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={closePrice}
            onChange={(e) => setClosePrice(e.target.value)}
            className="w-full bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none border border-transparent focus:border-primary/50"
            placeholder="Exit price..."
            autoFocus
          />
          {closePrice && !isNaN(parseFloat(closePrice)) && (
            <p className="text-[10px] mt-1">
              {(() => {
                const ep = parseFloat(closePrice);
                const mult = closeTarget.direction === 'long' ? 1 : -1;
                const pnl = (ep - closeTarget.entryPrice) * closeTarget.quantity * mult;
                const pct = ((ep - closeTarget.entryPrice) / closeTarget.entryPrice) * 100 * mult;
                const isProfit = pnl >= 0;
                return (
                  <span className={isProfit ? 'text-bull' : 'text-bear'}>
                    Realized P&L: {formatPnl(pnl)} ({isProfit ? '+' : ''}{pct.toFixed(2)}%)
                  </span>
                );
              })()}
            </p>
          )}
        </div>
        <button
          onClick={handleCloseConfirm}
          disabled={!closePrice || isNaN(parseFloat(closePrice))}
          className="w-full py-2 rounded text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <CheckSquare size={12} className="inline mr-1" />
          Confirm Close
        </button>
      </div>
    );
  }

  // ── New Trade Form ───────────────────────────────────────────────────────
  if (showEntryForm) {
    return <TradeEntryForm onClose={() => setShowEntryForm(false)} />;
  }

  // ── Main Trade Book ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <h2 className="text-xs font-semibold text-foreground">📒 Trade Book</h2>
        <div className="flex-1" />
        {dataSource === 'csv' && (
          <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5">
            BACKTEST
          </span>
        )}
        <button
          onClick={() => setShowEntryForm(true)}
          className="trading-btn flex items-center gap-1 text-[10px] text-primary hover:bg-primary/10"
          title="New Trade"
        >
          <Plus size={11} />
          New Trade
        </button>
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-4 px-3 py-1.5 bg-accent/50 border-b border-border shrink-0 text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Open P&L</span>
          <span className={`font-mono font-semibold ${totalOpenPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
            {formatPnl(totalOpenPnl)}
          </span>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Realized</span>
          <span className={`font-mono font-semibold ${totalRealizedPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
            {formatPnl(totalRealizedPnl)}
          </span>
        </div>
        <div className="flex-1" />
        <span className="text-muted-foreground">{openTrades.length} open · {closedTrades.length} closed</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {(['open', 'closed'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-[11px] font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab} ({tab === 'open' ? openTrades.length : closedTrades.length})
          </button>
        ))}
      </div>

      {/* Trade list */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'open' && (
          <>
            {openTrades.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-2">
                <TrendingUp size={24} className="text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No open trades</p>
                <button
                  onClick={() => setShowEntryForm(true)}
                  className="trading-btn text-[11px] text-primary hover:bg-primary/10 mt-1"
                >
                  <Plus size={11} className="inline mr-1" />
                  Enter a trade
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {openTrades.map((trade) => {
                  const unrealPnl = computeUnrealizedPnl(trade, currentPrice);
                  const pct = computePnlPct(trade, currentPrice);
                  const isProfit = unrealPnl >= 0;

                  return (
                    <div key={trade.id} className="p-2.5 hover:bg-accent/30 transition-colors">
                      {/* Top row */}
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={`flex items-center gap-0.5 text-[10px] font-bold ${
                          trade.direction === 'long' ? 'text-bull' : 'text-bear'
                        }`}>
                          {trade.direction === 'long'
                            ? <TrendingUp size={10} />
                            : <TrendingDown size={10} />
                          }
                          {trade.direction.toUpperCase()}
                        </span>
                        <span className="text-xs font-semibold text-foreground">{trade.symbol}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{formatDate(trade.entryTime)}</span>
                      </div>

                      {/* Price / P&L row */}
                      <div className="grid grid-cols-3 gap-1 text-[10px] mb-1.5">
                        <div>
                          <p className="text-muted-foreground">Entry</p>
                          <p className="font-mono font-semibold">{formatPrice(trade.entryPrice)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Current</p>
                          <p className="font-mono font-semibold">{formatPrice(currentPrice)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Qty</p>
                          <p className="font-mono font-semibold">{trade.quantity}</p>
                        </div>
                      </div>

                      {/* P&L */}
                      <div className={`flex items-center justify-between rounded px-2 py-1 ${
                        isProfit ? 'bg-bull/10' : 'bg-bear/10'
                      }`}>
                        <span className="text-[10px] text-muted-foreground">Unrealized P&L</span>
                        <span className={`font-mono text-xs font-bold ${isProfit ? 'text-bull' : 'text-bear'}`}>
                          {formatPnl(unrealPnl)} ({isProfit ? '+' : ''}{pct.toFixed(2)}%)
                        </span>
                      </div>

                      {trade.notes && (
                        <p className="text-[10px] text-muted-foreground mt-1 italic truncate" title={trade.notes}>
                          {trade.notes}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-1 mt-1.5">
                        <button
                          onClick={() => { setCloseTarget(trade); setClosePrice(currentPrice.toFixed(2)); }}
                          className="flex-1 text-[10px] py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                        >
                          Close Trade
                        </button>
                        <button
                          onClick={() => deleteTrade(trade.id)}
                          className="trading-btn p-1 text-destructive hover:bg-destructive/10"
                          title="Delete"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'closed' && (
          <>
            {closedTrades.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-2">
                <CheckSquare size={24} className="text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No closed trades yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {closedTrades.map((trade) => {
                  const realPnl = computeRealizedPnl(trade);
                  const pct = computePnlPct(trade, trade.exitPrice ?? trade.entryPrice);
                  const isProfit = realPnl >= 0;
                  const duration = trade.exitTime
                    ? formatDuration(trade.entryTime, trade.exitTime)
                    : '—';

                  return (
                    <div key={trade.id} className="p-2.5 hover:bg-accent/30 transition-colors">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={`flex items-center gap-0.5 text-[10px] font-bold ${
                          trade.direction === 'long' ? 'text-bull' : 'text-bear'
                        }`}>
                          {trade.direction === 'long'
                            ? <TrendingUp size={10} />
                            : <TrendingDown size={10} />
                          }
                          {trade.direction.toUpperCase()}
                        </span>
                        <span className="text-xs font-semibold text-foreground">{trade.symbol}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">⏱ {duration}</span>
                      </div>

                      <div className="grid grid-cols-3 gap-1 text-[10px] mb-1.5">
                        <div>
                          <p className="text-muted-foreground">Entry</p>
                          <p className="font-mono font-semibold">{formatPrice(trade.entryPrice)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Exit</p>
                          <p className="font-mono font-semibold">{formatPrice(trade.exitPrice ?? 0)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Qty</p>
                          <p className="font-mono font-semibold">{trade.quantity}</p>
                        </div>
                      </div>

                      <div className={`flex items-center justify-between rounded px-2 py-1 ${
                        isProfit ? 'bg-bull/10' : 'bg-bear/10'
                      }`}>
                        <span className="text-[10px] text-muted-foreground">Realized P&L</span>
                        <span className={`font-mono text-xs font-bold ${isProfit ? 'text-bull' : 'text-bear'}`}>
                          {formatPnl(realPnl)} ({isProfit ? '+' : ''}{pct.toFixed(2)}%)
                        </span>
                      </div>

                      {trade.notes && (
                        <p className="text-[10px] text-muted-foreground mt-1 italic truncate" title={trade.notes}>
                          {trade.notes}
                        </p>
                      )}

                      <button
                        onClick={() => deleteTrade(trade.id)}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors mt-1.5"
                      >
                        <Trash2 size={10} />
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer: clear all */}
      {trades.length > 0 && (
        <div className="border-t border-border px-3 py-1.5 shrink-0">
          {confirmClearAll ? (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-muted-foreground">Clear all trades?</span>
              <button
                onClick={() => { clearAllTrades(); setConfirmClearAll(false); }}
                className="text-destructive font-medium hover:underline"
              >
                Yes, clear
              </button>
              <button
                onClick={() => setConfirmClearAll(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClearAll(true)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 size={10} />
              Clear all trades
            </button>
          )}
        </div>
      )}
    </div>
  );
};
