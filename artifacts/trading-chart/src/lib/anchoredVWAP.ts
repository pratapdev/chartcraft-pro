import { Candle } from '@/types/trading';

export interface VWAPPoint {
  time: number;
  vwap: number;
  upper1: number;
  lower1: number;
  upper2: number;
  lower2: number;
}

/**
 * Compute anchored VWAP with ±1σ and ±2σ bands starting from anchorTime (unix seconds).
 * If anchorTime is 0, uses the first candle (session VWAP for entire dataset).
 */
export function computeAnchoredVWAP(
  candles: Candle[],
  anchorTime: number = 0
): VWAPPoint[] {
  const result: VWAPPoint[] = [];
  let started = anchorTime === 0;
  let cumulTPV = 0;
  let cumulVol = 0;
  let cumulTP2V = 0; // sum of (tp^2 * vol) for variance

  for (const c of candles) {
    if (!started) {
      if (c.time >= anchorTime) started = true;
      else continue;
    }
    const tp = (c.high + c.low + c.close) / 3;
    const vol = c.volume;
    cumulTPV += tp * vol;
    cumulVol += vol;
    cumulTP2V += tp * tp * vol;
    if (cumulVol === 0) continue;
    const vwap = cumulTPV / cumulVol;
    const variance = Math.max(0, cumulTP2V / cumulVol - vwap * vwap);
    const sigma = Math.sqrt(variance);
    result.push({
      time: c.time,
      vwap,
      upper1: vwap + sigma,
      lower1: vwap - sigma,
      upper2: vwap + 2 * sigma,
      lower2: vwap - 2 * sigma,
    });
  }
  return result;
}

/**
 * Compute session VWAPs: reset at each UTC day boundary.
 * Returns same VWAPPoint shape but VWAP resets every day.
 */
export function computeSessionVWAP(candles: Candle[]): VWAPPoint[] {
  const result: VWAPPoint[] = [];
  let cumulTPV = 0;
  let cumulVol = 0;
  let cumulTP2V = 0;
  let lastDay = -1;

  for (const c of candles) {
    const day = Math.floor(c.time / 86400);
    if (day !== lastDay) {
      cumulTPV = 0;
      cumulVol = 0;
      cumulTP2V = 0;
      lastDay = day;
    }
    const tp = (c.high + c.low + c.close) / 3;
    const vol = c.volume;
    cumulTPV += tp * vol;
    cumulVol += vol;
    cumulTP2V += tp * tp * vol;
    if (cumulVol === 0) continue;
    const vwap = cumulTPV / cumulVol;
    const variance = Math.max(0, cumulTP2V / cumulVol - vwap * vwap);
    const sigma = Math.sqrt(variance);
    result.push({
      time: c.time,
      vwap,
      upper1: vwap + sigma,
      lower1: vwap - sigma,
      upper2: vwap + 2 * sigma,
      lower2: vwap - 2 * sigma,
    });
  }
  return result;
}
