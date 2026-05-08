import type { Candle } from '@/types/trading';

export interface ProfileBucket {
  price: number;
  up: number;
  down: number;
}

export interface ProfileResult {
  buckets: ProfileBucket[];
  tickSize: number;
  poc: number;
  vah: number;
  val: number;
  totalVol: number;
  startTime: number;
  endTime: number;
  minPrice: number;
  maxPrice: number;
}

/** Choose a "nice" tick size given price range and target row count. */
export function autoTickSize(priceRange: number, targetRows = 60): number {
  if (priceRange <= 0) return 1;
  const raw = priceRange / targetRows;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  if (n <= 1.5) return mag;
  if (n <= 3.5) return 2.5 * mag;
  if (n <= 7.5) return 5 * mag;
  return 10 * mag;
}

/** Build a volume profile and compute POC, Value Area High/Low. */
export function buildProfile(
  candles: Candle[],
  opts: { targetRows?: number; valueAreaPct?: number; tickSize?: number } = {}
): ProfileResult | null {
  if (candles.length === 0) return null;
  const valueAreaPct = opts.valueAreaPct ?? 0.7;

  let minPrice = Infinity, maxPrice = -Infinity;
  for (const c of candles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  }
  const range = maxPrice - minPrice;
  if (range <= 0) return null;

  const tickSize = opts.tickSize ?? autoTickSize(range, opts.targetRows ?? 60);

  const map = new Map<number, { up: number; down: number }>();
  for (const c of candles) {
    const isUp = c.close >= c.open;
    const cLow = Math.floor(c.low / tickSize) * tickSize;
    const cHigh = Math.ceil(c.high / tickSize) * tickSize;
    const levels = Math.max(1, Math.round((cHigh - cLow) / tickSize));
    const volPer = c.volume / levels;
    for (let p = cLow; p <= cHigh; p += tickSize) {
      const key = Math.round(p / tickSize) * tickSize;
      const ex = map.get(key) || { up: 0, down: 0 };
      if (isUp) ex.up += volPer; else ex.down += volPer;
      map.set(key, ex);
    }
  }

  const buckets: ProfileBucket[] = Array.from(map.entries())
    .map(([price, v]) => ({ price, up: v.up, down: v.down }))
    .sort((a, b) => a.price - b.price);
  if (buckets.length === 0) return null;

  let totalVol = 0;
  let pocIdx = 0;
  let pocVol = 0;
  buckets.forEach((b, i) => {
    const t = b.up + b.down;
    totalVol += t;
    if (t > pocVol) { pocVol = t; pocIdx = i; }
  });

  // Expand value area from POC outward until covering valueAreaPct of total
  const target = totalVol * valueAreaPct;
  let acc = pocVol;
  let lo = pocIdx, hi = pocIdx;
  while (acc < target && (lo > 0 || hi < buckets.length - 1)) {
    const upVol = hi < buckets.length - 1 ? buckets[hi + 1].up + buckets[hi + 1].down : -1;
    const dnVol = lo > 0 ? buckets[lo - 1].up + buckets[lo - 1].down : -1;
    if (upVol < 0 && dnVol < 0) break;
    if (upVol >= dnVol) { hi++; acc += upVol; }
    else { lo--; acc += dnVol; }
  }

  return {
    buckets,
    tickSize,
    poc: buckets[pocIdx].price,
    vah: buckets[hi].price,
    val: buckets[lo].price,
    totalVol,
    startTime: candles[0].time,
    endTime: candles[candles.length - 1].time,
    minPrice,
    maxPrice,
  };
}

/** Group candles by daily session (UTC day boundary). */
export function groupBySession(candles: Candle[], sessionSeconds = 86400): Candle[][] {
  const groups: Candle[][] = [];
  let cur: Candle[] = [];
  let curBucket = -1;
  for (const c of candles) {
    const b = Math.floor(c.time / sessionSeconds);
    if (b !== curBucket) {
      if (cur.length) groups.push(cur);
      cur = [];
      curBucket = b;
    }
    cur.push(c);
  }
  if (cur.length) groups.push(cur);
  return groups;
}
