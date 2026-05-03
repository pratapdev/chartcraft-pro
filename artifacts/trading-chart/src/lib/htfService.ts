import { Candle, Timeframe } from '@/types/trading';
import { TF_SECONDS, AUTO_HTF_MAP, HTFLayerConfig } from '@/types/htfOverlay';
import { fetchCandles } from './marketData';

// Cache HTF candle data keyed by "symbol:timeframe"
const htfCache = new Map<string, { candles: Candle[]; fetchedAt: number }>();
const CACHE_TTL = 60_000; // 1 min

export async function fetchHTFCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const key = `${symbol}:${tf}`;
  const cached = htfCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.candles;

  const candles = await fetchCandles(symbol, tf, 500);
  htfCache.set(key, { candles, fetchedAt: Date.now() });
  return candles;
}

export function getAutoLayers(baseTf: Timeframe, currentLayers: HTFLayerConfig[]): HTFLayerConfig[] {
  const [htf1, htf2] = AUTO_HTF_MAP[baseTf];
  return currentLayers.map((layer, i) => ({
    ...layer,
    timeframe: i === 0 ? htf1 : htf2,
  }));
}

/** Determine trend direction: bullish if close > open over last N candles average */
export function getTrend(candles: Candle[], lookback: number = 5): 'bullish' | 'bearish' | 'neutral' {
  if (candles.length < lookback) return 'neutral';
  const recent = candles.slice(-lookback);
  const bullish = recent.filter(c => c.close >= c.open).length;
  if (bullish >= lookback * 0.7) return 'bullish';
  if (bullish <= lookback * 0.3) return 'bearish';
  return 'neutral';
}

export function clearHTFCache() {
  htfCache.clear();
}
