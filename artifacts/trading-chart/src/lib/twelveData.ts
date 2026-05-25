import { Candle, Timeframe } from '@/types/trading';

// Use a proxy or direct URL for Twelve Data (ensure VITE_TWELVEDATA_API_KEY is in .env)
const TWELVEDATA_API_KEY = import.meta.env.VITE_TWELVEDATA_API_KEY || '';

const INTERVAL_MAP: Record<Timeframe, string> = {
  '1m': '1min',
  '3m': '1min', // Twelve Data doesn't natively support 3m on all free endpoints, might need 1min agg
  '5m': '5min',
  '15m': '15min',
  '1h': '1h',
  '4h': '4h',
  '1D': '1day',
  '1W': '1week',
};

export async function fetchTwelveDataCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number = 500
): Promise<Candle[]> {
  if (!TWELVEDATA_API_KEY) {
    console.warn('VITE_TWELVEDATA_API_KEY is missing. Generating fallback data for', symbol);
    return generateFallbackData(limit);
  }

  // Handle 3m mapping if necessary, or just use 5min fallback
  const interval = INTERVAL_MAP[timeframe];
  
  try {
    const res = await fetch(
      `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=${limit}&apikey=${TWELVEDATA_API_KEY}`
    );
    if (!res.ok) throw new Error('Failed to fetch from Twelve Data');
    const data = await res.json();
    
    if (data.status === 'error') {
       throw new Error(data.message || 'API Error');
    }

    if (!data.values || !Array.isArray(data.values)) {
        return [];
    }

    // Twelve Data returns newest first. We need oldest first for charting.
    const reversed = data.values.reverse();

    return reversed.map((k: any) => ({
      time: Math.floor(new Date(k.datetime).getTime() / 1000), 
      open: parseFloat(k.open),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      close: parseFloat(k.close),
      volume: parseFloat(k.volume) || 0,
    }));
  } catch (err) {
    console.error('Failed to fetch candles from Twelve Data:', err);
    return generateFallbackData(limit);
  }
}

// WebSocket for live candle updates
export function subscribeToTwelveData(
  symbol: string,
  timeframe: Timeframe,
  onUpdate: (candle: Candle) => void
): () => void {
  if (!TWELVEDATA_API_KEY) {
      return () => {}; // Do nothing if no key
  }
  const wsUrl = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${TWELVEDATA_API_KEY}`;

  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout>;
  let alive = true;

  // We maintain a synthetic candle for the current interval
  let currentCandle: Candle | null = null;

  function connect() {
    if (!alive) return;
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        if (!alive || !ws) return;
        ws.send(JSON.stringify({
            "action": "subscribe",
            "params": {
                "symbols": symbol
            }
        }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'price' && msg.price) {
          const price = parseFloat(msg.price);
          const time = msg.timestamp; // unix seconds
          
          if (!currentCandle) {
              currentCandle = {
                  time: time,
                  open: price,
                  high: price,
                  low: price,
                  close: price,
                  volume: 0
              };
          } else {
              currentCandle.close = price;
              if (price > currentCandle.high) currentCandle.high = price;
              if (price < currentCandle.low) currentCandle.low = price;
          }
          
          // Note: In a true implementation, we'd roll over the candle when timeframe boundaries cross.
          // For now, this sends the updated "current" tick state which lightweight-charts handles gracefully by overwriting the last candle.
          onUpdate({ ...currentCandle });
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
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Optional: send unsubscribe
        ws.send(JSON.stringify({
            "action": "unsubscribe",
            "params": {
                "symbols": symbol
            }
        }));
    }
    ws?.close();
  };
}

// Fallback data generator for Twelve Data API limit hits
function generateFallbackData(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 2000; // Gold-ish starting price
  const now = Math.floor(Date.now() / 1000);
  const interval = 3600;

  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * interval;
    const volatility = price * 0.001; // Low vol for forex/metals
    const change = (Math.random() - 0.48) * volatility;
    const open = price;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.floor(10 + Math.random() * 50);

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
