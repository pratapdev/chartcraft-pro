import { Candle, Timeframe } from '@/types/trading';
import { PctDiffDonSource, StrategyConfig } from '@/types/tracker';
import { computePctDiffDonchian } from './marketData';

interface LinePoint {
  time: number;
  value: number;
}

function getLine(
  result: ReturnType<typeof computePctDiffDonchian>,
  source: PctDiffDonSource
): LinePoint[] {
  switch (source) {
    case 'main': return result.pctDiff.map((p) => ({ time: p.time, value: p.value }));
    case 'ema': return result.emaLine;
    case 'basis': return result.basis;
    case 'upper': return result.upper;
    case 'lower': return result.lower;
    case 'upperNew': return result.upperNew;
    case 'lowerNew': return result.lowerNew;
  }
}

export interface CrossoverResult {
  direction: 'above' | 'below';
  time: number;
  price: number; // candle close at crossover time
}

/**
 * Detect the most recent crossover between two lines of a %Diff Don indicator.
 * Returns null if no crossover found in the last 2 data points.
 */
export function detectPctDiffDonCrossover(
  candles: Candle[],
  config: StrategyConfig & { type: 'pct_diff_don' }
): CrossoverResult | null {
  const result = computePctDiffDonchian(
    candles,
    config.emaPeriod,
    config.lookbackWindow,
    config.emaSmoothing,
    config.donchianLength,
    config.donLineDiff
  );

  const line1 = getLine(result, config.source1);
  const line2 = getLine(result, config.source2);

  if (line1.length < 2 || line2.length < 2) return null;

  // Align by time using a map
  const map2 = new Map(line2.map((p) => [p.time, p.value]));

  // Get last two aligned points
  const aligned: { time: number; v1: number; v2: number }[] = [];
  for (let i = line1.length - 1; i >= 0 && aligned.length < 2; i--) {
    const v2 = map2.get(line1[i].time);
    if (v2 !== undefined) {
      aligned.unshift({ time: line1[i].time, v1: line1[i].value, v2 });
    }
  }

  if (aligned.length < 2) return null;

  const [prev, curr] = aligned;
  const prevDiff = prev.v1 - prev.v2;
  const currDiff = curr.v1 - curr.v2;

  let direction: 'above' | 'below' | null = null;
  if (prevDiff <= 0 && currDiff > 0) direction = 'above';
  if (prevDiff >= 0 && currDiff < 0) direction = 'below';

  if (!direction) return null;

  // Find candle close at crossover time
  const candle = candles.find((c) => c.time === curr.time);
  return { direction, time: curr.time, price: candle?.close ?? 0 };
}
