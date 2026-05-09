import { Candle, MarketType } from '@/types/trading';
import { computePatterns, PATTERN_LABELS } from './patternDetection';
import { computeMarketStructure } from './smartMoney';
import { SYMBOL_MAP } from './liquidationData';

export interface AIPatternSummary {
  kind: string;
  label: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  startTime: number;
  endTime: number;
  apexPrice?: number;
}

export interface AIStructureSummary {
  kind: 'BOS' | 'CHOCH';
  direction: 'bullish' | 'bearish';
  price: number;
  breakTime: number;
}

export interface AISweepSummary {
  direction: 'bull_sweep' | 'bear_sweep';
  sweptPrice: number;
  time: number;
}

export interface AIMarketStats {
  openInterest?: number;
  openInterestChange24h?: number;
  fundingRate?: number;
  nextFundingTime?: number;
  longShortRatio?: number;
  markPrice?: number;
}

export function summarizePatterns(candles: Candle[]): AIPatternSummary[] {
  const pats = computePatterns(candles, 5);
  return pats.slice(0, 5).map(p => ({
    kind: p.kind,
    label: PATTERN_LABELS[p.kind],
    bias: p.breakoutBias,
    strength: Math.round(p.strength * 100) / 100,
    startTime: p.startTime,
    endTime: p.endTime,
    apexPrice: p.apexPrice,
  }));
}

export function summarizeStructure(candles: Candle[]) {
  const ms = computeMarketStructure(candles, 5);
  const recentLabels: AIStructureSummary[] = ms.labels.slice(-6).map(l => ({
    kind: l.kind,
    direction: l.direction,
    price: l.price,
    breakTime: l.breakTime,
  }));
  const recentSweeps: AISweepSummary[] = ms.sweeps.slice(-6).map(s => ({
    direction: s.direction,
    sweptPrice: s.sweptPrice,
    time: s.sweepCandleTime,
  }));
  return { labels: recentLabels, sweeps: recentSweeps };
}

/** Fetch open interest, funding, long/short ratio for crypto symbols (Binance Futures public). */
export async function fetchMarketStats(symbol: string, marketType: MarketType): Promise<AIMarketStats> {
  if (marketType !== 'crypto') return {};
  const fSymbol = SYMBOL_MAP[symbol];
  if (!fSymbol) return {};
  const upper = fSymbol.toUpperCase();
  const stats: AIMarketStats = {};
  try {
    const [oiRes, premRes, lsRes, oiHistRes] = await Promise.all([
      fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${upper}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${upper}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${upper}&period=1h&limit=1`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${upper}&period=1h&limit=24`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (oiRes?.openInterest) stats.openInterest = parseFloat(oiRes.openInterest);
    if (premRes) {
      if (premRes.lastFundingRate) stats.fundingRate = parseFloat(premRes.lastFundingRate);
      if (premRes.nextFundingTime) stats.nextFundingTime = premRes.nextFundingTime;
      if (premRes.markPrice) stats.markPrice = parseFloat(premRes.markPrice);
    }
    if (Array.isArray(lsRes) && lsRes.length > 0) {
      stats.longShortRatio = parseFloat(lsRes[lsRes.length - 1].longShortRatio);
    }
    if (Array.isArray(oiHistRes) && oiHistRes.length > 1 && stats.openInterest) {
      const first = parseFloat(oiHistRes[0].sumOpenInterest);
      if (first > 0) {
        stats.openInterestChange24h = ((stats.openInterest - first) / first) * 100;
      }
    }
  } catch {
    /* ignore */
  }
  return stats;
}
