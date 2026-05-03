import { Candle } from '@/types/trading';

export type PatternKind =
  | 'ascending_triangle'
  | 'descending_triangle'
  | 'symmetrical_triangle'
  | 'rising_wedge'
  | 'falling_wedge'
  | 'ascending_channel'
  | 'descending_channel';

export interface DetectedPattern {
  kind: PatternKind;
  startIdx: number;
  endIdx: number;
  startTime: number;
  endTime: number;
  // Upper trendline: y = upperSlope * t + upperIntercept (t = unix seconds)
  upperSlope: number;
  upperIntercept: number;
  // Lower trendline: y = lowerSlope * t + lowerIntercept
  lowerSlope: number;
  lowerIntercept: number;
  // Projected apex (for triangles/wedges)
  apexTime?: number;
  apexPrice?: number;
  breakoutBias: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-1, how clean the pattern is
}

interface PivotPoint {
  idx: number;
  time: number;
  price: number;
}

function fitLine(points: PivotPoint[]): { slope: number; intercept: number; r2: number } {
  if (points.length < 2) return { slope: 0, intercept: points[0]?.price ?? 0, r2: 0 };
  const n = points.length;
  const sumT = points.reduce((s, p) => s + p.time, 0);
  const sumP = points.reduce((s, p) => s + p.price, 0);
  const sumTP = points.reduce((s, p) => s + p.time * p.price, 0);
  const sumTT = points.reduce((s, p) => s + p.time * p.time, 0);
  const denom = n * sumTT - sumT * sumT;
  if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: sumP / n, r2: 0 };
  const slope = (n * sumTP - sumT * sumP) / denom;
  const intercept = (sumP - slope * sumT) / n;
  // R²
  const meanP = sumP / n;
  const ssTot = points.reduce((s, p) => s + (p.price - meanP) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.price - (slope * p.time + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

function findPivots(candles: Candle[], len: number): { highs: PivotPoint[]; lows: PivotPoint[] } {
  const highs: PivotPoint[] = [];
  const lows: PivotPoint[] = [];
  for (let i = len; i < candles.length - len; i++) {
    let isPH = true, isPL = true;
    for (let j = i - len; j <= i + len; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isPH = false;
      if (candles[j].low <= candles[i].low) isPL = false;
    }
    if (isPH) highs.push({ idx: i, time: candles[i].time, price: candles[i].high });
    if (isPL) lows.push({ idx: i, time: candles[i].time, price: candles[i].low });
  }
  return { highs, lows };
}

function apexIntersect(
  s1: number, i1: number,
  s2: number, i2: number
): number | null {
  // s1*t + i1 = s2*t + i2  →  t = (i2-i1)/(s1-s2)
  const denom = s1 - s2;
  if (Math.abs(denom) < 1e-20) return null;
  return (i2 - i1) / denom;
}

export function computePatterns(
  candles: Candle[],
  pivotLen: number = 5,
  minPivots: number = 3
): DetectedPattern[] {
  if (candles.length < pivotLen * 2 + minPivots * 2) return [];

  const { highs, lows } = findPivots(candles, pivotLen);
  if (highs.length < 2 || lows.length < 2) return [];

  const patterns: DetectedPattern[] = [];

  // Look at rolling windows of pivot subsets
  const windowSizes = [3, 4, 5];
  for (const wSize of windowSizes) {
    for (let hi = 0; hi <= highs.length - wSize; hi++) {
      const topPivots = highs.slice(hi, hi + wSize);
      // Find matching low pivots in same time range
      const t0 = topPivots[0].time;
      const t1 = topPivots[topPivots.length - 1].time;
      const botPivots = lows.filter(l => l.time >= t0 && l.time <= t1);
      if (botPivots.length < 2) continue;

      const upper = fitLine(topPivots);
      const lower = fitLine(botPivots);
      if (upper.r2 < 0.6 || lower.r2 < 0.6) continue;

      const startTime = t0;
      const endTime = t1;
      const startIdx = topPivots[0].idx;
      const endIdx = topPivots[topPivots.length - 1].idx;

      // Classify by slope relationship
      const uSlope = upper.slope;
      const lSlope = lower.slope;

      const FLAT = 0.00002; // relative flatness threshold (per second)
      const avgPrice = (upper.intercept + lower.intercept) / 2;
      const slopeTol = avgPrice * FLAT;

      const uFlat = Math.abs(uSlope) < slopeTol;
      const lFlat = Math.abs(lSlope) < slopeTol;
      const uUp = uSlope > slopeTol;
      const lUp = lSlope > slopeTol;
      const uDown = uSlope < -slopeTol;
      const lDown = lSlope < -slopeTol;

      let kind: PatternKind | null = null;
      let breakoutBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';

      // Ascending triangle: flat top, rising bottom
      if (uFlat && lUp) { kind = 'ascending_triangle'; breakoutBias = 'bullish'; }
      // Descending triangle: falling top, flat bottom
      else if (uDown && lFlat) { kind = 'descending_triangle'; breakoutBias = 'bearish'; }
      // Symmetrical triangle: falling top, rising bottom (converging)
      else if (uDown && lUp) { kind = 'symmetrical_triangle'; breakoutBias = 'neutral'; }
      // Rising wedge: both up, upper steeper rise (bearish)
      else if (uUp && lUp && lSlope > uSlope * 1.1) { kind = 'rising_wedge'; breakoutBias = 'bearish'; }
      // Falling wedge: both down, upper steeper fall (bullish)
      else if (uDown && lDown && uSlope < lSlope * 1.1) { kind = 'falling_wedge'; breakoutBias = 'bullish'; }
      // Ascending channel: both up, roughly parallel
      else if (uUp && lUp && Math.abs(uSlope - lSlope) / (Math.abs(uSlope) + 1e-10) < 0.3) {
        kind = 'ascending_channel'; breakoutBias = 'bullish';
      }
      // Descending channel: both down, roughly parallel
      else if (uDown && lDown && Math.abs(uSlope - lSlope) / (Math.abs(uSlope) + 1e-10) < 0.3) {
        kind = 'descending_channel'; breakoutBias = 'bearish';
      }

      if (!kind) continue;

      // Skip if already have very similar pattern (dedup)
      const dup = patterns.find(p =>
        p.kind === kind &&
        Math.abs(p.startTime - startTime) < (endTime - startTime) * 0.3 &&
        Math.abs(p.endTime - endTime) < (endTime - startTime) * 0.3
      );
      if (dup) continue;

      const apexTime = apexIntersect(upper.slope, upper.intercept, lower.slope, lower.intercept);
      const strength = Math.min(1, (upper.r2 + lower.r2) / 2);

      patterns.push({
        kind,
        startIdx,
        endIdx,
        startTime,
        endTime,
        upperSlope: upper.slope,
        upperIntercept: upper.intercept,
        lowerSlope: lower.slope,
        lowerIntercept: lower.intercept,
        apexTime: apexTime ?? undefined,
        apexPrice: apexTime != null
          ? upper.slope * apexTime + upper.intercept
          : undefined,
        breakoutBias,
        strength,
      });
    }
  }

  // Sort by recency, keep only last 6 most recent
  return patterns
    .sort((a, b) => b.endTime - a.endTime)
    .slice(0, 6);
}

export const PATTERN_LABELS: Record<PatternKind, string> = {
  ascending_triangle: 'Asc Triangle',
  descending_triangle: 'Desc Triangle',
  symmetrical_triangle: 'Sym Triangle',
  rising_wedge: 'Rising Wedge',
  falling_wedge: 'Falling Wedge',
  ascending_channel: 'Asc Channel',
  descending_channel: 'Desc Channel',
};

export const PATTERN_BIAS_COLOR: Record<'bullish' | 'bearish' | 'neutral', string> = {
  bullish: '#22c55e',
  bearish: '#ef4444',
  neutral: '#facc15',
};
