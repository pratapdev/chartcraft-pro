import { Candle } from '@/types/trading';

// ============================================================
// Fair Value Gap (FVG)
// ============================================================

export interface FVGZone {
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  midTime: number;
  startTime: number;
  endTime: number;
  mitigated: boolean;
  mitigatedTime?: number;
}

/**
 * A bullish FVG forms when candle[i-2].high < candle[i].low — there is a gap of empty air above the first candle.
 * A bearish FVG forms when candle[i-2].low > candle[i].high — there is a gap of empty air below the first candle.
 * minGapAtr: fraction of ATR that the gap must exceed to qualify (filters noise).
 */
export function computeFVG(candles: Candle[], minGapAtr: number = 0.1): FVGZone[] {
  if (candles.length < 3) return [];

  // Wilder ATR (period 14) for minimum gap filtering
  const atrPeriod = 14;
  const atr: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    atr[i] = i < atrPeriod
      ? (atr[i - 1] * (i - 1) + tr) / i
      : (atr[i - 1] * (atrPeriod - 1) + tr) / atrPeriod;
  }

  const zones: FVGZone[] = [];
  const lastTime = candles[candles.length - 1].time;

  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
    const c2 = candles[i];
    const minGap = atr[i] * minGapAtr;

    // Bullish FVG
    if (c2.low > c0.high && (c2.low - c0.high) >= minGap) {
      const zone: FVGZone = {
        type: 'bullish',
        top: c2.low,
        bottom: c0.high,
        midTime: c1.time,
        startTime: c0.time,
        endTime: lastTime,
        mitigated: false,
      };
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low <= zone.bottom) {
          zone.mitigated = true;
          zone.mitigatedTime = candles[j].time;
          zone.endTime = candles[j].time;
          break;
        }
      }
      zones.push(zone);
    }

    // Bearish FVG
    if (c2.high < c0.low && (c0.low - c2.high) >= minGap) {
      const zone: FVGZone = {
        type: 'bearish',
        top: c0.low,
        bottom: c2.high,
        midTime: c1.time,
        startTime: c0.time,
        endTime: lastTime,
        mitigated: false,
      };
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].high >= zone.top) {
          zone.mitigated = true;
          zone.mitigatedTime = candles[j].time;
          zone.endTime = candles[j].time;
          break;
        }
      }
      zones.push(zone);
    }
  }

  return zones;
}

// ============================================================
// Market Structure: BOS / CHOCH / Liquidity Sweeps
// ============================================================

export interface SwingPoint {
  idx: number;
  time: number;
  price: number;
  type: 'high' | 'low';
}

export interface StructureLabel {
  kind: 'BOS' | 'CHOCH';
  direction: 'bullish' | 'bearish';
  price: number;
  time: number;
  breakTime: number;
}

export interface LiquiditySweep {
  direction: 'bull_sweep' | 'bear_sweep';
  sweptPrice: number;
  sweepCandleTime: number;
  sweepCandleHigh: number;
  sweepCandleLow: number;
}

export interface MarketStructureResult {
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  labels: StructureLabel[];
  sweeps: LiquiditySweep[];
}

export function computeMarketStructure(
  candles: Candle[],
  swingLen: number = 5,
): MarketStructureResult {
  const result: MarketStructureResult = {
    swingHighs: [],
    swingLows: [],
    labels: [],
    sweeps: [],
  };

  if (candles.length < swingLen * 2 + 3) return result;

  // ---- Step 1: identify pivot highs and lows ----
  const pivotHighs: SwingPoint[] = [];
  const pivotLows: SwingPoint[] = [];

  for (let i = swingLen; i < candles.length - swingLen; i++) {
    let isPH = true;
    for (let j = i - swingLen; j <= i + swingLen; j++) {
      if (j !== i && candles[j].high >= candles[i].high) { isPH = false; break; }
    }
    if (isPH) {
      pivotHighs.push({ idx: i, time: candles[i].time, price: candles[i].high, type: 'high' });
      result.swingHighs.push({ idx: i, time: candles[i].time, price: candles[i].high, type: 'high' });
    }

    let isPL = true;
    for (let j = i - swingLen; j <= i + swingLen; j++) {
      if (j !== i && candles[j].low <= candles[i].low) { isPL = false; break; }
    }
    if (isPL) {
      pivotLows.push({ idx: i, time: candles[i].time, price: candles[i].low, type: 'low' });
      result.swingLows.push({ idx: i, time: candles[i].time, price: candles[i].low, type: 'low' });
    }
  }

  // ---- Step 2: BOS and CHOCH ----
  const allSwings: SwingPoint[] = [...pivotHighs, ...pivotLows].sort((a, b) => a.idx - b.idx);

  // Keep running view of the last confirmed swing high and low
  let lastHigh: SwingPoint | null = null;
  let lastLow: SwingPoint | null = null;
  let trend: 'up' | 'down' | null = null;

  for (let si = 0; si < allSwings.length; si++) {
    const sw = allSwings[si];

    if (sw.type === 'high') {
      // Does this high break the previous confirmed high?
      if (lastHigh !== null) {
        // Find first close above lastHigh.price between lastHigh.idx and sw.idx
        for (let ci = lastHigh.idx + 1; ci <= sw.idx; ci++) {
          if (candles[ci].close > lastHigh.price) {
            const kind: 'BOS' | 'CHOCH' = trend === 'down' ? 'CHOCH' : 'BOS';
            result.labels.push({
              kind,
              direction: 'bullish',
              price: lastHigh.price,
              time: lastHigh.time,
              breakTime: candles[ci].time,
            });
            if (kind === 'CHOCH') trend = 'up';
            break;
          }
        }
      }
      if (trend === null) trend = 'up';
      lastHigh = sw;
    } else {
      // Does this low break the previous confirmed low?
      if (lastLow !== null) {
        for (let ci = lastLow.idx + 1; ci <= sw.idx; ci++) {
          if (candles[ci].close < lastLow.price) {
            const kind: 'BOS' | 'CHOCH' = trend === 'up' ? 'CHOCH' : 'BOS';
            result.labels.push({
              kind,
              direction: 'bearish',
              price: lastLow.price,
              time: lastLow.time,
              breakTime: candles[ci].time,
            });
            if (kind === 'CHOCH') trend = 'down';
            break;
          }
        }
      }
      if (trend === null) trend = 'down';
      lastLow = sw;
    }
  }

  // ---- Step 3: Liquidity sweeps ----
  // Sweep: candle wick exceeds a swing level but close is on the opposite side (failed breakout)
  for (const ph of pivotHighs) {
    for (let ci = ph.idx + 1; ci < candles.length - 1; ci++) {
      const c = candles[ci];
      if (c.high > ph.price && c.close < ph.price) {
        // Confirm reversal: next candle also closes below level
        const nextC = candles[ci + 1];
        if (nextC && nextC.close < ph.price) {
          result.sweeps.push({
            direction: 'bull_sweep',
            sweptPrice: ph.price,
            sweepCandleTime: c.time,
            sweepCandleHigh: c.high,
            sweepCandleLow: c.low,
          });
          break; // one sweep per level
        }
      }
    }
  }

  for (const pl of pivotLows) {
    for (let ci = pl.idx + 1; ci < candles.length - 1; ci++) {
      const c = candles[ci];
      if (c.low < pl.price && c.close > pl.price) {
        const nextC = candles[ci + 1];
        if (nextC && nextC.close > pl.price) {
          result.sweeps.push({
            direction: 'bear_sweep',
            sweptPrice: pl.price,
            sweepCandleTime: c.time,
            sweepCandleHigh: c.high,
            sweepCandleLow: c.low,
          });
          break;
        }
      }
    }
  }

  return result;
}
