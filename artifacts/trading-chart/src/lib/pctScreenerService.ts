import { Candle, Timeframe, MarketType } from '@/types/trading';
import { fetchCandles, computePctDiffDonchian } from './marketData';
import { CRYPTO_SYMBOLS } from './cryptoSymbols';
import { FOREX_SYMBOLS } from './forexSymbols';
import { INDIAN_STOCKS } from './upstoxData';
import { PctDiffStrategy } from '@/types/trading';

export interface PctScreenerRow {
  symbol: string;
  price: number;
  change24h: number;
  pctDiffValue: number | null;
  emaValue: number | null;
  upperBand: number | null;
  lowerBand: number | null;
  basisValue: number | null;
  channelWidth: number | null;
  upperNewValue: number | null;
  lowerNewValue: number | null;
  regime: 'trending_bull' | 'trending_bear' | 'ranging' | null;
  strategies: PctDiffStrategy[];
  strategyDetails: Record<PctDiffStrategy, string>;
  candles: Candle[];
}

export interface PctScreenerConfig {
  emaPeriod: number;
  lookbackWindow: number;
  emaSmoothing: number;
  donchianLength: number;
  donLineDiff: number;
}

export const DEFAULT_PCT_CONFIG: PctScreenerConfig = {
  emaPeriod: 20,
  lookbackWindow: 50,
  emaSmoothing: 5,
  donchianLength: 20,
  donLineDiff: 0.2,
};

type TV = { time: number; value: number };

function detectStrategies(
  candles: Candle[],
  main: TV[], ema: TV[], upper: TV[], lower: TV[],
  basis: TV[], upperNew: TV[], lowerNew: TV[],
): { strategies: PctDiffStrategy[]; details: Record<PctDiffStrategy, string> } {
  const strategies: PctDiffStrategy[] = [];
  const details: Record<string, string> = {};
  if (main.length < 10 || upper.length < 5 || lower.length < 5) return { strategies, details: details as Record<PctDiffStrategy, string> };

  const n = main.length;
  const un = upper.length;
  const ln = lower.length;
  const curr = main[n - 1].value;
  const prev = main[n - 2]?.value ?? 0;

  // Strategy 1: Fail First
  if (n >= 8 && ema.length >= 8) {
    let wasPositive = false, dippedNearZero = false;
    let wasNegative = false, bouncedNearZero = false;
    for (let i = n - 8; i < n - 2; i++) {
      if (i >= 0 && main[i].value > 0.05) wasPositive = true;
      if (i >= 0 && wasPositive && main[i].value < 0.02 && main[i].value > -0.3) dippedNearZero = true;
      if (i >= 0 && main[i].value < -0.05) wasNegative = true;
      if (i >= 0 && wasNegative && main[i].value > -0.02 && main[i].value < 0.3) bouncedNearZero = true;
    }
    if (wasPositive && dippedNearZero && curr > 0 && prev <= 0) {
      strategies.push('fail_first');
      details.fail_first = 'Bullish: pullback failed, resuming up';
    } else if (wasNegative && bouncedNearZero && curr < 0 && prev >= 0) {
      strategies.push('fail_first');
      details.fail_first = 'Bearish: bounce failed, resuming down';
    }
  }

  // Strategy 2: Squeeze Breakout
  if (un >= 6 && ln >= 6) {
    const widths: number[] = [];
    for (let i = un - 6; i < un - 1; i++) {
      if (i >= 0) widths.push(upper[i].value - lower[i].value);
    }
    if (widths.length >= 3) {
      const avgWidth = widths.reduce((s, w) => s + w, 0) / widths.length;
      const isSqueeze = avgWidth < 0.5 || (upper[un - 1].value - lower[ln - 1].value > avgWidth * 1.4 && avgWidth < 1.0);
      if (isSqueeze) {
        if (curr > upper[un - 2]?.value && prev <= upper[un - 2]?.value) {
          strategies.push('squeeze_breakout');
          details.squeeze_breakout = 'Bullish breakout from squeeze';
        } else if (curr < lower[ln - 2]?.value && prev >= lower[ln - 2]?.value) {
          strategies.push('squeeze_breakout');
          details.squeeze_breakout = 'Bearish breakdown from squeeze';
        }
      }
    }
  }

  // Strategy 3: Momentum Divergence
  if (candles.length >= 20 && n >= 20) {
    const lookback = 20;
    const cn = candles.length;
    const mid = Math.floor(lookback / 2);
    const mainOffset = n - cn;

    let pH1 = -Infinity, pH1Idx = -1;
    for (let i = cn - lookback; i < cn - mid; i++) {
      if (i >= 0 && candles[i].high > pH1) { pH1 = candles[i].high; pH1Idx = i; }
    }
    let pH2 = -Infinity, pH2Idx = -1;
    for (let i = cn - mid; i < cn; i++) {
      if (candles[i].high > pH2) { pH2 = candles[i].high; pH2Idx = i; }
    }
    const pct1 = pH1Idx >= 0 && pH1Idx + mainOffset >= 0 ? main[pH1Idx + mainOffset]?.value : undefined;
    const pct2 = pH2Idx >= 0 && pH2Idx + mainOffset >= 0 ? main[pH2Idx + mainOffset]?.value : undefined;

    if (pct1 !== undefined && pct2 !== undefined && pH2 > pH1 && pct2 < pct1) {
      strategies.push('momentum_divergence');
      details.momentum_divergence = 'Bearish: price HH but %Diff LH';
    }

    let pL1 = Infinity, pL1Idx = -1;
    for (let i = cn - lookback; i < cn - mid; i++) {
      if (i >= 0 && candles[i].low < pL1) { pL1 = candles[i].low; pL1Idx = i; }
    }
    let pL2 = Infinity, pL2Idx = -1;
    for (let i = cn - mid; i < cn; i++) {
      if (candles[i].low < pL2) { pL2 = candles[i].low; pL2Idx = i; }
    }
    const pctL1 = pL1Idx >= 0 && pL1Idx + mainOffset >= 0 ? main[pL1Idx + mainOffset]?.value : undefined;
    const pctL2 = pL2Idx >= 0 && pL2Idx + mainOffset >= 0 ? main[pL2Idx + mainOffset]?.value : undefined;

    if (pctL1 !== undefined && pctL2 !== undefined && pL2 < pL1 && pctL2 > pctL1 && !strategies.includes('momentum_divergence')) {
      strategies.push('momentum_divergence');
      details.momentum_divergence = 'Bullish: price LL but %Diff HL';
    }
  }

  // Strategy 4: Regime Mean Reversion
  if (un >= 3 && ln >= 3 && ema.length >= 3) {
    const chanWidth = upper[un - 1].value - lower[ln - 1].value;
    const isRanging = chanWidth < 0.8;
    const en = ema.length;

    if (!isRanging) {
      if (curr > 0 && prev <= ema[en - 1]?.value && curr > ema[en - 1]?.value) {
        strategies.push('regime_mean_reversion');
        details.regime_mean_reversion = 'Trending: bullish pullback to EMA';
      } else if (curr < 0 && prev >= ema[en - 1]?.value && curr < ema[en - 1]?.value) {
        strategies.push('regime_mean_reversion');
        details.regime_mean_reversion = 'Trending: bearish pullback to EMA';
      }
    } else {
      if (prev <= lower[ln - 2]?.value && curr > lower[ln - 1].value) {
        strategies.push('regime_mean_reversion');
        details.regime_mean_reversion = 'Ranging: long at lower band';
      } else if (prev >= upper[un - 2]?.value && curr < upper[un - 1].value) {
        strategies.push('regime_mean_reversion');
        details.regime_mean_reversion = 'Ranging: short at upper band';
      }
    }
  }

  // Strategy 5: Inner Band Warning
  if (upperNew.length >= 3 && lowerNew.length >= 3) {
    const unN = upperNew.length;
    const lnN = lowerNew.length;
    const innerUp = upperNew[unN - 2]?.value;
    const innerLo = lowerNew[lnN - 2]?.value;
    const outerUp = upper.length >= 2 ? upper[un - 1].value : Infinity;
    const outerLo = lower.length >= 2 ? lower[ln - 1].value : -Infinity;

    if (innerUp !== undefined && prev <= innerUp && curr > innerUp && curr < outerUp) {
      strategies.push('inner_band_warning');
      details.inner_band_warning = 'Early entry: broke inner upper band';
    } else if (innerLo !== undefined && prev >= innerLo && curr < innerLo && curr > outerLo) {
      strategies.push('inner_band_warning');
      details.inner_band_warning = 'Early entry: broke inner lower band';
    }
  }

  return { strategies, details: details as Record<PctDiffStrategy, string> };
}

export async function fetchPctScreenerData(
  timeframe: Timeframe = '1D',
  marketType: MarketType = 'crypto',
  config: PctScreenerConfig = DEFAULT_PCT_CONFIG,
): Promise<PctScreenerRow[]> {
  const symbolList = marketType === 'crypto' ? CRYPTO_SYMBOLS
                   : marketType === 'indian' ? INDIAN_STOCKS.map(s => s.name)
                   : FOREX_SYMBOLS;

  const promises = symbolList.map(async (symbol) => {
    try {
      const candles = await fetchCandles(symbol, timeframe, 200);
      if (!candles || candles.length < 60) return null;

      const lastPrice = candles[candles.length - 1].close;
      const ago24h = candles[candles.length - 1].time - 86400;
      let oldPrice = candles[0].close;
      for (let i = candles.length - 1; i >= 0; i--) {
        if (candles[i].time <= ago24h) { oldPrice = candles[i].close; break; }
      }
      const change24h = ((lastPrice - oldPrice) / oldPrice) * 100;

      const result = computePctDiffDonchian(
        candles, config.emaPeriod, config.lookbackWindow,
        config.emaSmoothing, config.donchianLength, config.donLineDiff,
      );

      const main = result.pctDiff.map(d => ({ time: d.time, value: d.value }));
      const ema = result.emaLine;
      const upper = result.upper;
      const lower = result.lower;
      const basis = result.basis;
      const upperNew = result.upperNew;
      const lowerNew = result.lowerNew;

      const lastMain = main.length > 0 ? main[main.length - 1].value : null;
      const lastEma = ema.length > 0 ? ema[ema.length - 1].value : null;
      const lastUpper = upper.length > 0 ? upper[upper.length - 1].value : null;
      const lastLower = lower.length > 0 ? lower[lower.length - 1].value : null;
      const lastBasis = basis.length > 0 ? basis[basis.length - 1].value : null;
      const lastUpperNew = upperNew.length > 0 ? upperNew[upperNew.length - 1].value : null;
      const lastLowerNew = lowerNew.length > 0 ? lowerNew[lowerNew.length - 1].value : null;
      const channelWidth = lastUpper !== null && lastLower !== null ? lastUpper - lastLower : null;

      let regime: PctScreenerRow['regime'] = null;
      if (channelWidth !== null && lastMain !== null) {
        if (channelWidth < 0.8) regime = 'ranging';
        else if (lastMain > 0) regime = 'trending_bull';
        else regime = 'trending_bear';
      }

      const { strategies, details } = detectStrategies(candles, main, ema, upper, lower, basis, upperNew, lowerNew);

      return {
        symbol,
        price: lastPrice,
        change24h,
        pctDiffValue: lastMain !== null ? Math.round(lastMain * 1000) / 1000 : null,
        emaValue: lastEma !== null ? Math.round(lastEma * 1000) / 1000 : null,
        upperBand: lastUpper !== null ? Math.round(lastUpper * 1000) / 1000 : null,
        lowerBand: lastLower !== null ? Math.round(lastLower * 1000) / 1000 : null,
        basisValue: lastBasis !== null ? Math.round(lastBasis * 1000) / 1000 : null,
        channelWidth: channelWidth !== null ? Math.round(channelWidth * 1000) / 1000 : null,
        upperNewValue: lastUpperNew !== null ? Math.round(lastUpperNew * 1000) / 1000 : null,
        lowerNewValue: lastLowerNew !== null ? Math.round(lastLowerNew * 1000) / 1000 : null,
        regime,
        strategies,
        strategyDetails: details,
        candles,
      } as PctScreenerRow;
    } catch (err) {
      console.error(`PctScreener error for ${symbol}:`, err);
      return null;
    }
  });

  const all = await Promise.all(promises);
  return all.filter((r): r is PctScreenerRow => r !== null);
}
