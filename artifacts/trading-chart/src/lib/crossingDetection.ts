import { Candle, Trendline } from '@/types/trading';

/**
 * Get the trendline price at a given timestamp using linear interpolation
 */
export function getTrendlinePriceAtTime(line: Trendline, time: number): number {
  if (line.endTime === line.startTime) return line.startPrice;
  const slope = (line.endPrice - line.startPrice) / (line.endTime - line.startTime);
  return line.startPrice + slope * (time - line.startTime);
}

export type CrossDirection = 'above' | 'below' | null;

/**
 * Check if price crossed a trendline between two candles
 */
export function detectCrossing(
  prev: Candle,
  curr: Candle,
  line: Trendline
): CrossDirection {
  const prevLinePrice = getTrendlinePriceAtTime(line, prev.time);
  const currLinePrice = getTrendlinePriceAtTime(line, curr.time);

  const prevDiff = prev.close - prevLinePrice;
  const currDiff = curr.close - currLinePrice;

  if (prevDiff <= 0 && currDiff > 0) return 'above';
  if (prevDiff >= 0 && currDiff < 0) return 'below';
  return null;
}

/**
 * Check all trendlines for crossings on a new candle
 */
export function checkAllCrossings(
  candles: Candle[],
  trendlines: Trendline[]
): Array<{ trendline: Trendline; direction: CrossDirection; candle: Candle }> {
  if (candles.length < 2) return [];
  const prev = candles[candles.length - 2];
  const curr = candles[candles.length - 1];
  const results: Array<{ trendline: Trendline; direction: CrossDirection; candle: Candle }> = [];

  for (const line of trendlines) {
    const dir = detectCrossing(prev, curr, line);
    if (dir) {
      results.push({ trendline: line, direction: dir, candle: curr });
    }
  }

  return results;
}
