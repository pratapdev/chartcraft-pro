import { Candle, Timeframe } from '@/types/trading';

const BINANCE_REST = 'https://api.binance.com/api/v3/klines';

// Map our symbols to Binance symbols
const SYMBOL_MAP: Record<string, string> = {
  'BTC/USD': 'BTCUSDT',
  'ETH/USD': 'ETHUSDT',
  'SOL/USD': 'SOLUSDT',
  'BNB/USD': 'BNBUSDT',
  'XRP/USD': 'XRPUSDT',
  'ADA/USD': 'ADAUSDT',
  'DOGE/USD': 'DOGEUSDT',
  'AVAX/USD': 'AVAXUSDT',
};

const INTERVAL_MAP: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
};

export async function fetchCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number = 500
): Promise<Candle[]> {
  const binanceSymbol = SYMBOL_MAP[symbol] || 'BTCUSDT';
  const interval = INTERVAL_MAP[timeframe];

  try {
    const res = await fetch(
      `${BINANCE_REST}?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`
    );
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    return data.map((k: any[]) => ({
      time: Math.floor(k[0] / 1000), // Convert ms to seconds
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (err) {
    console.error('Failed to fetch candles from Binance:', err);
    return generateFallbackData(500);
  }
}

// WebSocket for live candle updates
export function subscribeToCandles(
  symbol: string,
  timeframe: Timeframe,
  onUpdate: (candle: Candle) => void
): () => void {
  const binanceSymbol = (SYMBOL_MAP[symbol] || 'BTCUSDT').toLowerCase();
  const interval = INTERVAL_MAP[timeframe];
  const wsUrl = `wss://stream.binance.com:9443/ws/${binanceSymbol}@kline_${interval}`;

  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout>;
  let alive = true;

  function connect() {
    if (!alive) return;
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.e === 'kline') {
          const k = msg.k;
          onUpdate({
            time: Math.floor(k.t / 1000),
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
          });
        }
      } catch {}
    };

    ws.onclose = () => {
      if (alive) {
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  connect();

  return () => {
    alive = false;
    clearTimeout(reconnectTimeout);
    ws?.close();
  };
}

// Fallback data generator
function generateFallbackData(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 42000;
  const now = Math.floor(Date.now() / 1000);
  const interval = 3600;

  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * interval;
    const volatility = price * 0.008;
    const change = (Math.random() - 0.48) * volatility;
    const open = price;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.floor(50 + Math.random() * 500);

    candles.push({
      time,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });
    price = close;
  }
  return candles;
}

// Compute EMA
export function computeEMA(candles: Candle[], period: number): { time: number; value: number }[] {
  const result: { time: number; value: number }[] = [];
  if (candles.length === 0) return result;
  const k = 2 / (period + 1);
  let ema = candles[0].close;

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) ema = candles[i].close;
    else ema = candles[i].close * k + ema * (1 - k);
    if (i >= period - 1) {
      result.push({ time: candles[i].time, value: Math.round(ema * 100) / 100 });
    }
  }
  return result;
}

// Compute SMA
export function computeSMA(candles: Candle[], period: number): { time: number; value: number }[] {
  const result: { time: number; value: number }[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    result.push({ time: candles[i].time, value: Math.round((sum / period) * 100) / 100 });
  }
  return result;
}
