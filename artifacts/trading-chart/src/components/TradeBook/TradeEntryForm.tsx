import React, { useState } from 'react';
import { useTradeStore, TradeDirection } from '@/stores/tradeStore';
import { useChartStore } from '@/stores/chartStore';
import { X, TrendingUp, TrendingDown } from 'lucide-react';

interface TradeEntryFormProps {
  onClose: () => void;
}

export const TradeEntryForm: React.FC<TradeEntryFormProps> = ({ onClose }) => {
  const { candles, symbol, dataSource, backtestCandles, backtestIndex } = useChartStore();
  const { addTrade } = useTradeStore();

  // Get current price from the last visible candle
  const lastCandle = candles[candles.length - 1];
  const currentPrice = lastCandle?.close ?? 0;

  // Get current time: in backtest mode use the bar's time, else use now
  const currentTime = (() => {
    if (dataSource === 'csv' && backtestCandles.length > 0) {
      const idx = Math.max(0, backtestIndex - 1);
      return backtestCandles[idx]?.time ?? Math.floor(Date.now() / 1000);
    }
    return Math.floor(Date.now() / 1000);
  })();

  const [direction, setDirection] = useState<TradeDirection>('long');
  const [entryPrice, setEntryPrice] = useState(currentPrice > 0 ? currentPrice.toFixed(2) : '');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ep = parseFloat(entryPrice);
    const qty = parseFloat(quantity);
    if (isNaN(ep) || ep <= 0) { setError('Invalid entry price'); return; }
    if (isNaN(qty) || qty <= 0) { setError('Invalid quantity'); return; }

    addTrade({
      symbol,
      direction,
      entryTime: currentTime,
      entryPrice: ep,
      quantity: qty,
      notes: notes.trim(),
    });
    onClose();
  };

  const estimatedValue = (() => {
    const ep = parseFloat(entryPrice);
    const qty = parseFloat(quantity);
    if (!isNaN(ep) && !isNaN(qty)) return (ep * qty).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return '—';
  })();

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">New Trade Entry</h3>
        <button onClick={onClose} className="trading-btn p-0.5">
          <X size={12} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        {/* Symbol (read-only) */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Symbol</label>
          <div className="text-xs font-semibold text-foreground bg-accent rounded px-2 py-1.5">
            {symbol}
            {dataSource === 'csv' && (
              <span className="ml-2 text-[10px] text-amber-400">(CSV backtest)</span>
            )}
          </div>
        </div>

        {/* Direction */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Direction</label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setDirection('long')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-semibold transition-colors ${
                direction === 'long'
                  ? 'bg-bull/20 text-bull border border-bull/40'
                  : 'bg-accent text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              <TrendingUp size={12} />
              Long
            </button>
            <button
              type="button"
              onClick={() => setDirection('short')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-semibold transition-colors ${
                direction === 'short'
                  ? 'bg-bear/20 text-bear border border-bear/40'
                  : 'bg-accent text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              <TrendingDown size={12} />
              Short
            </button>
          </div>
        </div>

        {/* Entry Price */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
            Entry Price
            <button
              type="button"
              onClick={() => setEntryPrice(currentPrice.toFixed(2))}
              className="ml-2 text-primary hover:underline"
            >
              Use current ({currentPrice.toFixed(2)})
            </button>
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={entryPrice}
            onChange={(e) => { setEntryPrice(e.target.value); setError(''); }}
            className="w-full bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none border border-transparent focus:border-primary/50"
            placeholder="0.00"
            required
          />
        </div>

        {/* Quantity */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Quantity / Size</label>
          <input
            type="number"
            step="any"
            min="0"
            value={quantity}
            onChange={(e) => { setQuantity(e.target.value); setError(''); }}
            className="w-full bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none border border-transparent focus:border-primary/50"
            placeholder="1"
            required
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Position value: <span className="text-foreground font-mono">{estimatedValue}</span>
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none border border-transparent focus:border-primary/50 resize-none"
            rows={2}
            placeholder="Setup, reason, strategy..."
          />
        </div>

        {error && <p className="text-[10px] text-destructive">{error}</p>}

        <button
          type="submit"
          className={`w-full py-2 rounded text-xs font-semibold transition-colors ${
            direction === 'long'
              ? 'bg-bull hover:bg-bull/90 text-white'
              : 'bg-bear hover:bg-bear/90 text-white'
          }`}
        >
          {direction === 'long' ? '↑ Enter Long' : '↓ Enter Short'}
        </button>
      </form>
    </div>
  );
};
