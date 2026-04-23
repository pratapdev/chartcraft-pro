import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useMultiPanelStore } from '@/stores/multiPanelStore';
import { subscribeToOrderBook, OrderBookDepth } from '@/lib/marketData';

interface Props {
  panelIndex: number;
}

export const PanelDOM: React.FC<Props> = ({ panelIndex }) => {
  const panel = useMultiPanelStore((s) => s.panels[panelIndex]);
  const [depth, setDepth] = useState<OrderBookDepth | null>(null);

  // We use a ref for high-frequency updates if React struggles, but useState is fine for 10fps initially.
  // We'll calculate max volume to normalize the depth bars.

  useEffect(() => {
    if (!panel) return;
    setDepth(null); // Reset on symbol change
    
    const unsubscribe = subscribeToOrderBook(panel.symbol, (newDepth) => {
      setDepth(newDepth);
    });

    return () => unsubscribe();
  }, [panel?.symbol]);

  if (!panel) return null;

  const maxVolume = useMemo(() => {
    if (!depth) return 0;
    let max = 0;
    depth.asks.forEach((a) => { if (a.quantity > max) max = a.quantity; });
    depth.bids.forEach((b) => { if (b.quantity > max) max = b.quantity; });
    return max || 1;
  }, [depth]);

  // Aggregate total asks and bids liquidity
  const totalAsks = depth?.asks.reduce((sum, a) => sum + a.quantity, 0) || 0;
  const totalBids = depth?.bids.reduce((sum, b) => sum + b.quantity, 0) || 0;

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs overflow-hidden select-none relative">
      {/* Header */}
      <div className="flex justify-between items-center px-3 py-1.5 border-b border-border bg-muted/30 shrink-0">
        <span className="font-bold text-foreground">{panel.symbol} DOM</span>
        <span className="text-muted-foreground text-[10px]">BINANCE (100ms)</span>
      </div>

      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Ask Ladder (Top Half) */}
        <div className="flex-1 overflow-hidden flex flex-col justify-end pb-1 relative">
          {!depth ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">Loading L2...</div>
          ) : (
            depth.asks.slice().reverse().map((ask, i) => (
              <DOMRow key={`ask-${ask.price}-${i}`} price={ask.price} quantity={ask.quantity} maxQty={maxVolume} type="ask" />
            ))
          )}
        </div>

        {/* Spread Divder */}
        <div className="h-6 shrink-0 bg-accent/20 border-y border-border flex items-center justify-between px-3">
          <span className="text-muted-foreground">Spread</span>
          {depth && depth.asks.length > 0 && depth.bids.length > 0 && (
            <span className="font-bold text-foreground">
              {Math.abs(depth.asks[0].price - depth.bids[0].price).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              })}
            </span>
          )}
        </div>

        {/* Bid Ladder (Bottom Half) */}
        <div className="flex-1 overflow-hidden flex flex-col justify-start pt-1 relative">
           {depth && depth.bids.map((bid, i) => (
             <DOMRow key={`bid-${bid.price}-${i}`} price={bid.price} quantity={bid.quantity} maxQty={maxVolume} type="bid" />
           ))}
        </div>
      </div>
      
      {/* Footer / Info */}
      <div className="h-6 border-t border-border flex bg-muted/20 text-[10px]">
        <div className="flex-1 flex items-center justify-center text-red-400">
          A: {totalAsks.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        <div className="w-px bg-border"></div>
        <div className="flex-1 flex items-center justify-center text-green-400">
          B: {totalBids.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
      </div>
    </div>
  );
};

const DOMRow: React.FC<{ price: number; quantity: number; maxQty: number; type: 'bid' | 'ask' }> = ({
  price, quantity, maxQty, type
}) => {
  const isBid = type === 'bid';
  const widthPct = Math.min(100, Math.max(2, (quantity / maxQty) * 100));

  return (
    <div className="group relative flex items-center justify-between px-2 py-[2px] transition-colors hover:bg-accent/50 cursor-crosshair">
      {/* Background Histogram */}
      <div
        className="absolute top-0 bottom-0 z-0 transition-all duration-100 ease-linear"
        style={{
          [isBid ? 'left' : 'right']: 0,
          width: `${widthPct}%`,
          background: isBid ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
        }}
      />
      
      {/* Size Column */}
      <span className="z-10 w-1/3 text-right tabular-nums text-muted-foreground mr-4">
        {quantity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>

      {/* Price Column */}
      <span
        className={`z-10 font-medium tabular-nums ${isBid ? 'text-green-500' : 'text-red-500'}`}
      >
        {price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
      </span>
    </div>
  );
};
