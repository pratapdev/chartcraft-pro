// Binance Futures liquidations stream
// wss://fstream.binance.com/ws/<symbol>@forceOrder
// Event: { e: 'forceOrder', o: { s, S: 'BUY'|'SELL', q, p, T } }

export interface Liquidation {
  id: string;
  time: number;        // unix seconds
  price: number;
  qty: number;
  usd: number;
  side: 'BUY' | 'SELL'; // BUY = short liquidated, SELL = long liquidated
}

const SYMBOL_MAP: Record<string, string> = {
  'BTC/USD': 'btcusdt', 'ETH/USD': 'ethusdt', 'SOL/USD': 'solusdt',
  'BNB/USD': 'bnbusdt', 'XRP/USD': 'xrpusdt', 'ADA/USD': 'adausdt',
  'DOGE/USD': 'dogeusdt', 'AVAX/USD': 'avaxusdt',
};

function toFuturesSymbol(symbol: string): string {
  if (SYMBOL_MAP[symbol]) return SYMBOL_MAP[symbol];
  return symbol.replace('/', '').replace('USD', 'USDT').toLowerCase();
}

export function subscribeLiquidations(
  symbol: string,
  onEvent: (liq: Liquidation) => void,
): () => void {
  const fsym = toFuturesSymbol(symbol);
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(`wss://fstream.binance.com/ws/${fsym}@forceOrder`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const o = msg?.o;
          if (!o) return;
          const price = parseFloat(o.p);
          const qty = parseFloat(o.q);
          if (!isFinite(price) || !isFinite(qty)) return;
          onEvent({
            id: `${o.T}-${o.S}-${price}`,
            time: Math.floor(o.T / 1000),
            price,
            qty,
            usd: price * qty,
            side: o.S === 'BUY' ? 'BUY' : 'SELL',
          });
        } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        retry = Math.min(retry + 1, 5);
        setTimeout(connect, 1000 * retry);
      };
      ws.onerror = () => { try { ws?.close(); } catch {} };
    } catch {
      setTimeout(connect, 2000);
    }
  };
  connect();

  return () => {
    closed = true;
    try { ws?.close(); } catch {}
  };
}

// Optional: fetch recent liquidations REST (Binance has no public history endpoint;
// we rely on live stream + in-memory ring buffer)
