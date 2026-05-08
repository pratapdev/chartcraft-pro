// Iceberg / Absorption detection from OHLCV candles
// Heuristic: high relative volume + small body relative to ATR == passive absorption.
// Direction inferred from wick balance & close position.

import type { Candle } from '@/types/trading';

export type AbsorptionKind = 'buyer' | 'seller' | 'neutral';

export interface AbsorptionMark {
  time: number;
  price: number;       // y-anchor for icon (high or low)
  kind: AbsorptionKind;
  volRatio: number;    // vol / avgVol
  bodyRatio: number;   // body / ATR
  volume: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface AbsorptionOptions {
  lookback?: number;     // window for avg vol & ATR
  volMult?: number;      // min volume vs avg
  maxBodyAtr?: number;   // max body / ATR
  minWickPct?: number;   // wick share of range to classify direction
}

export function detectAbsorption(
  candles: Candle[],
  opts: AbsorptionOptions = {},
): AbsorptionMark[] {
  const lookback = opts.lookback ?? 20;
  const volMult = opts.volMult ?? 2.5;
  const maxBodyAtr = opts.maxBodyAtr ?? 0.35;
  const minWickPct = opts.minWickPct ?? 0.5;

  if (candles.length < lookback + 2) return [];
  const out: AbsorptionMark[] = [];

  for (let i = lookback; i < candles.length; i++) {
    let volSum = 0;
    let trSum = 0;
    for (let j = i - lookback; j < i; j++) {
      volSum += candles[j].volume;
      const prev = candles[j - 1] ?? candles[j];
      const tr = Math.max(
        candles[j].high - candles[j].low,
        Math.abs(candles[j].high - prev.close),
        Math.abs(candles[j].low - prev.close),
      );
      trSum += tr;
    }
    const avgVol = volSum / lookback;
    const atr = trSum / lookback;
    if (avgVol <= 0 || atr <= 0) continue;

    const c = candles[i];
    const range = c.high - c.low;
    if (range <= 0) continue;
    const body = Math.abs(c.close - c.open);
    const volRatio = c.volume / avgVol;
    const bodyRatio = body / atr;

    if (volRatio < volMult) continue;
    if (bodyRatio > maxBodyAtr) continue;

    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const closePos = (c.close - c.low) / range; // 0=bottom 1=top

    let kind: AbsorptionKind = 'neutral';
    if (lowerWick / range >= minWickPct || closePos >= 0.7) kind = 'buyer';
    else if (upperWick / range >= minWickPct || closePos <= 0.3) kind = 'seller';

    out.push({
      time: c.time,
      price: kind === 'buyer' ? c.low : c.high,
      kind,
      volRatio,
      bodyRatio,
      volume: c.volume,
      open: c.open, high: c.high, low: c.low, close: c.close,
    });
  }
  return out;
}
