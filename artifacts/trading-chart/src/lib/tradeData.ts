import { Timeframe } from '@/types/trading';

export interface AggTrade {
  price: number;
  quantity: number;
  time: number; // ms
  isBuyerMaker: boolean;
}

// Map our symbols to Binance symbols
function toBinanceSymbol(symbol: string): string {
  const map: Record<string, string> = {
    'BTC/USD': 'BTCUSDT', 'ETH/USD': 'ETHUSDT', 'SOL/USD': 'SOLUSDT',
    'BNB/USD': 'BNBUSDT', 'XRP/USD': 'XRPUSDT', 'ADA/USD': 'ADAUSDT',
    'DOGE/USD': 'DOGEUSDT', 'AVAX/USD': 'AVAXUSDT',
  };
  if (map[symbol]) return map[symbol];
  return symbol.replace('/', '').replace('USD', 'USDT');
}

const TF_MS: Record<Timeframe, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000,
  '1h': 3_600_000, '4h': 14_400_000, '1D': 86_400_000, '1W': 604_800_000,
};

/**
 * Fetch historical aggTrades from Binance for a time window.
 * Binance returns max 1000 per call, so we paginate.
 */
export async function fetchAggTrades(
  symbol: string,
  startTime: number,
  endTime: number,
  maxTrades: number = 50_000
): Promise<AggTrade[]> {
  const binanceSymbol = toBinanceSymbol(symbol);
  const allTrades: AggTrade[] = [];
  let fromTime = startTime;

  while (fromTime < endTime && allTrades.length < maxTrades) {
    try {
      const url = `https://api.binance.com/api/v3/aggTrades?symbol=${binanceSymbol}&startTime=${fromTime}&endTime=${endTime}&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      if (!data.length) break;

      for (const t of data) {
        allTrades.push({
          price: parseFloat(t.p),
          quantity: parseFloat(t.q),
          time: t.T,
          isBuyerMaker: t.m,
        });
      }

      // Move start past the last trade
      fromTime = data[data.length - 1].T + 1;

      // Rate limit: small delay between requests
      await new Promise((r) => setTimeout(r, 100));
    } catch {
      break;
    }
  }

  return allTrades;
}

/**
 * Subscribe to live aggTrades via WebSocket
 */
export function subscribeToTrades(
  symbol: string,
  onTrade: (trade: AggTrade) => void
): () => void {
  const binanceSymbol = toBinanceSymbol(symbol).toLowerCase();
  const wsUrl = `wss://stream.binance.com:9443/ws/${binanceSymbol}@aggTrade`;

  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout>;
  let alive = true;

  function connect() {
    if (!alive) return;
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.e === 'aggTrade') {
          onTrade({
            price: parseFloat(msg.p),
            quantity: parseFloat(msg.q),
            time: msg.T,
            isBuyerMaker: msg.m,
          });
        }
      } catch {}
    };

    ws.onclose = () => {
      if (alive) reconnectTimeout = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws?.close();
  }

  connect();

  return () => {
    alive = false;
    clearTimeout(reconnectTimeout);
    ws?.close();
  };
}

export function getTimeframeMs(tf: Timeframe): number {
  return TF_MS[tf];
}
