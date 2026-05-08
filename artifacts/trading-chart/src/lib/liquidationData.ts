// Binance Futures liquidations stream
// Uses all-market stream `!forceOrder@arr` (per-symbol stream is too sparse)
// Event payload (per element): { e: 'forceOrder', o: { s, S: 'BUY'|'SELL', q, p, T } }

export interface Liquidation {
  id: string;
  time: number;        // unix seconds
  price: number;
  qty: number;
  usd: number;
  side: 'BUY' | 'SELL'; // BUY = short liquidated, SELL = long liquidated
  symbol: string;
}

const SYMBOL_MAP: Record<string, string> = {
  'BTC/USD': 'BTCUSDT', 'ETH/USD': 'ETHUSDT', 'SOL/USD': 'SOLUSDT',
  'BNB/USD': 'BNBUSDT', 'XRP/USD': 'XRPUSDT', 'ADA/USD': 'ADAUSDT',
  'DOGE/USD': 'DOGEUSDT', 'AVAX/USD': 'AVAXUSDT',
};

function toFuturesSymbol(symbol: string): string {
  if (SYMBOL_MAP[symbol]) return SYMBOL_MAP[symbol];
  return symbol.replace('/', '').replace('USD', 'USDT').toUpperCase();
}

type Listener = (liq: Liquidation) => void;

let ws: WebSocket | null = null;
let connected = false;
let connecting = false;
let closedByUser = false;
let retry = 0;
const listeners = new Map<string, Set<Listener>>(); // futures symbol -> listeners
const statusListeners = new Set<(c: boolean) => void>();

function emitStatus() {
  for (const l of statusListeners) l(connected);
}

function connect() {
  if (ws || connecting) return;
  connecting = true;
  try {
    ws = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr');
    ws.onopen = () => {
      connecting = false;
      connected = true;
      retry = 0;
      emitStatus();
    };
    ws.onmessage = (e) => {
      try {
        const raw = JSON.parse(e.data);
        const arr = Array.isArray(raw) ? raw : [raw];
        for (const msg of arr) {
          const o = msg?.o;
          if (!o) continue;
          const sym = String(o.s || '').toUpperCase();
          const subs = listeners.get(sym);
          if (!subs || subs.size === 0) continue;
          const price = parseFloat(o.p);
          const qty = parseFloat(o.q);
          if (!isFinite(price) || !isFinite(qty)) continue;
          const liq: Liquidation = {
            id: `${o.T}-${o.S}-${price}`,
            time: Math.floor(o.T / 1000),
            price,
            qty,
            usd: price * qty,
            side: o.S === 'BUY' ? 'BUY' : 'SELL',
            symbol: sym,
          };
          for (const fn of subs) fn(liq);
        }
      } catch {}
    };
    ws.onclose = () => {
      connecting = false;
      connected = false;
      ws = null;
      emitStatus();
      if (closedByUser || listeners.size === 0) return;
      retry = Math.min(retry + 1, 5);
      setTimeout(connect, 1000 * retry);
    };
    ws.onerror = () => { try { ws?.close(); } catch {} };
  } catch {
    connecting = false;
    setTimeout(connect, 2000);
  }
}

function maybeDisconnect() {
  if (listeners.size === 0 && ws) {
    closedByUser = true;
    try { ws.close(); } catch {}
    ws = null;
    connected = false;
    emitStatus();
  }
}

export function subscribeLiquidations(symbol: string, onEvent: Listener): () => void {
  const fsym = toFuturesSymbol(symbol);
  let set = listeners.get(fsym);
  if (!set) { set = new Set(); listeners.set(fsym, set); }
  set.add(onEvent);
  closedByUser = false;
  connect();
  return () => {
    const s = listeners.get(fsym);
    if (s) {
      s.delete(onEvent);
      if (s.size === 0) listeners.delete(fsym);
    }
    maybeDisconnect();
  };
}

export function subscribeLiquidationStatus(cb: (connected: boolean) => void): () => void {
  statusListeners.add(cb);
  cb(connected);
  return () => { statusListeners.delete(cb); };
}
