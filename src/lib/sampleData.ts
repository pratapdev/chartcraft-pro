import { Candle } from '@/types/trading';

// Generate realistic OHLCV data
export function generateCandleData(count: number = 500, basePrice: number = 42000): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  const now = Math.floor(Date.now() / 1000);
  const interval = 3600; // 1h candles

  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * interval;
    const volatility = price * 0.008;
    const trend = Math.sin(i / 50) * 0.001;
    const change = (Math.random() - 0.48 + trend) * volatility;

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
  const k = 2 / (period + 1);
  let ema = candles[0]?.close ?? 0;

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      ema = candles[i].close;
    } else {
      ema = candles[i].close * k + ema * (1 - k);
    }
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
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    result.push({ time: candles[i].time, value: Math.round((sum / period) * 100) / 100 });
  }
  return result;
}
