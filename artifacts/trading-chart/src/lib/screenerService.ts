import { Candle, Timeframe, MarketType } from '@/types/trading';
import { fetchCandles, computeRSI, computeSMA, computeEMA, computeSupertrend, computeMACD as computeMACDFull, computeADX, computeStochRSI, computeBollingerBands, computeVWAP } from './marketData';

export interface ScreenerRow {
  symbol: string;
  price: number;
  change24h: number;
  change7d: number;
  volume24h: number;
  volumeChange: number;
  rsi: number | null;
  macd: { value: number; signal: number; histogram: number } | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  supertrend: 'bullish' | 'bearish' | null;
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  stochRsi: { k: number; d: number } | null;
  bb: { upper: number; middle: number; lower: number; bandwidth: number } | null;
  vwap: number | null;
  atr: number | null;
  pattern: string | null;
  ichiKumo: 'bullish' | 'bearish' | null;
  ichiTk: 'bullish' | 'bearish' | null;
  msHighs: 'LH' | 'HH' | 'HL' | 'LL' | null;
  msLows: 'LH' | 'HH' | 'HL' | 'LL' | null;
  candles: Candle[];
}

export interface ScreenerFilters {
  timeframe?: Timeframe;
  marketType?: MarketType;
  // Price & Volume
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
  maxVolume?: number;
  minChange?: number;
  maxChange?: number;
  // Trend / Crossover
  trendDirection?: 'bullish' | 'bearish' | 'any';
  emaCross?: 'bullish' | 'bearish' | 'any';
  priceVsEma200?: 'above' | 'below' | 'any';
  priceVsSma200?: 'above' | 'below' | 'any';
  // Momentum / Oscillator
  rsiOversold?: number;
  rsiOverbought?: number;
  stochRsiOversold?: number;
  stochRsiOverbought?: number;
  macdCross?: 'bullish' | 'bearish' | 'any';
  minAdx?: number;
  // Price Action
  candlePattern?: string[];
  breakHigh?: boolean;
  breakLow?: boolean;
  sweepHigh?: boolean;
  sweepLow?: boolean;
  // Bollinger Bands
  bbSqueeze?: boolean;
  bbBreakout?: 'upper' | 'lower' | 'any';
  // Ichimoku
  ichiKumo?: 'bullish' | 'bearish' | 'any';
  ichiTk?: 'bullish' | 'bearish' | 'any';
  // Market Structure
  msHighs?: string[];
  msLows?: string[];
  // Custom
  customFormula?: string;
}

import { CRYPTO_SYMBOLS } from './cryptoSymbols';

async function fetch24hTicker(binanceSymbol: string) {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      priceChangePercent: parseFloat(data.priceChangePercent),
      lastPrice: parseFloat(data.lastPrice),
      quoteVolume: parseFloat(data.quoteVolume),
    };
  } catch { return null; }
}

function computeATR(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  let atr = 0;
  for (let i = 0; i < period; i++) atr += tr[i];
  atr /= period;
  for (let i = period; i < tr.length; i++) atr = (atr * (period - 1) + tr[i]) / period;
  return Math.round(atr * 100) / 100;
}

function computeIchimoku(candles: Candle[]): { kumo: 'bullish' | 'bearish' | null; tk: 'bullish' | 'bearish' | null } {
  if (candles.length < 52) return { kumo: null, tk: null };
  const tenkan = (Math.max(...candles.slice(-9).map(c => c.high)) + Math.min(...candles.slice(-9).map(c => c.low))) / 2;
  const kijun = (Math.max(...candles.slice(-26).map(c => c.high)) + Math.min(...candles.slice(-26).map(c => c.low))) / 2;
  const spanA = (tenkan + kijun) / 2;
  const spanB = (Math.max(...candles.slice(-52).map(c => c.high)) + Math.min(...candles.slice(-52).map(c => c.low))) / 2;
  const price = candles[candles.length - 1].close;
  const kumo = price > Math.max(spanA, spanB) ? 'bullish' : price < Math.min(spanA, spanB) ? 'bearish' : null;
  const tk = tenkan > kijun ? 'bullish' : tenkan < kijun ? 'bearish' : null;
  return { kumo, tk };
}

function analyzeMarketStructure(candles: Candle[]): { highs: 'HH' | 'LH' | 'HL' | 'LL' | null; lows: 'HH' | 'LH' | 'HL' | 'LL' | null } {
  if (candles.length < 20) return { highs: null, lows: null };
  const recent = candles.slice(-10);
  const prev = candles.slice(-20, -10);
  const rH = Math.max(...recent.map(c => c.high));
  const pH = Math.max(...prev.map(c => c.high));
  const rL = Math.min(...recent.map(c => c.low));
  const pL = Math.min(...prev.map(c => c.low));
  return {
    highs: rH > pH ? 'HH' : rH < pH ? 'LH' : null,
    lows: rL > pL ? 'HL' : rL < pL ? 'LL' : null,
  };
}

function detectPattern(candles: Candle[]): string | null {
  if (candles.length < 3) return null;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const currBody = Math.abs(curr.close - curr.open);
  const prevBody = Math.abs(prev.close - prev.open);
  const currRange = curr.high - curr.low;
  if (prev.close < prev.open && curr.close > curr.open && curr.open <= prev.close && curr.close >= prev.open) return 'Bullish Engulfing';
  if (prev.close > prev.open && curr.close < curr.open && curr.open >= prev.close && curr.close <= prev.open) return 'Bearish Engulfing';
  if (currBody < currRange * 0.1 && currRange > 0) return 'Doji';
  const lw = Math.min(curr.open, curr.close) - curr.low;
  const uw = curr.high - Math.max(curr.open, curr.close);
  if (lw > currBody * 2 && uw < currBody * 0.5 && currRange > 0) return 'Hammer';
  if (uw > currBody * 2 && lw < currBody * 0.5 && currRange > 0) return 'Shooting Star';
  // Morning Star (3-candle pattern)
  const pp = candles[candles.length - 3];
  if (pp && pp.close < pp.open && Math.abs(prev.close - prev.open) < prevBody * 0.3 && curr.close > curr.open && curr.close > (pp.open + pp.close) / 2) return 'Morning Star';
  return null;
}

function last<T>(arr: { time: number; value: T }[]): T | null {
  return arr.length > 0 ? arr[arr.length - 1].value : null;
}

import { FOREX_SYMBOLS } from './forexSymbols';
import { INDIAN_STOCKS } from './upstoxData';

export async function fetchScreenerData(timeframe: Timeframe = '1D', marketType: MarketType = 'crypto'): Promise<ScreenerRow[]> {
  const results: ScreenerRow[] = [];
  const symbolList = marketType === 'crypto' ? CRYPTO_SYMBOLS 
                   : marketType === 'indian' ? INDIAN_STOCKS.map(s => s.name)
                   : FOREX_SYMBOLS;

  // Fetch all in parallel
  const promises = symbolList.map(async (symbol) => {
    try {
      const binanceSymbol = symbol.replace('/', '').replace('USD', 'USDT');
      const [candles, ticker24hRes] = await Promise.all([
        fetchCandles(symbol, timeframe, 200),
        marketType === 'crypto' ? fetch24hTicker(binanceSymbol) : Promise.resolve(null),
      ]);
      
      if (!candles || candles.length === 0) return null;

      let ticker24h = ticker24hRes;
      
      // Fallback for forex or if binance ticker fails: calculate from candles
      if (!ticker24h) {
          const lastPrice = candles[candles.length - 1].close;
          
          // Try to find candle from ~24h ago
          const now = candles[candles.length - 1].time;
          const ago24h = now - 86400;
          let oldPrice = candles[0].close; // default to oldest
          
          for (let i = candles.length - 1; i >= 0; i--) {
              if (candles[i].time <= ago24h) {
                  oldPrice = candles[i].close;
                  break;
              }
          }
          
          const priceChangePercent = ((lastPrice - oldPrice) / oldPrice) * 100;
          let quoteVolume = 0;
          
          // Estimate 24h volume
          for (let i = candles.length - 1; i >= 0; i--) {
              if (candles[i].time > ago24h) {
                  quoteVolume += candles[i].volume;
              } else {
                  break;
              }
          }

          ticker24h = {
              priceChangePercent,
              lastPrice,
              quoteVolume,
          };
      }

      if (!ticker24h) return null; // Should never happen now

      const rsiData = computeRSI(candles, 14);
      const rsi = last(rsiData);

      const macdData = computeMACDFull(candles, 12, 26, 9);
      const macd = macdData.histogram.length > 0 ? {
        value: macdData.macdLine[macdData.macdLine.length - 1].value,
        signal: macdData.signalLine[macdData.signalLine.length - 1].value,
        histogram: macdData.histogram[macdData.histogram.length - 1].value,
      } : null;

      const ema20 = last(computeEMA(candles, 20));
      const ema50 = last(computeEMA(candles, 50));
      const ema200 = last(computeEMA(candles, 200));
      const sma20 = last(computeSMA(candles, 20));
      const sma50 = last(computeSMA(candles, 50));
      const sma200 = last(computeSMA(candles, 200));

      const stData = computeSupertrend(candles, 10, 3);
      const lastST = stData.line[stData.line.length - 1];
      const supertrend = lastST?.color === '#22c55e' ? 'bullish' as const : 'bearish' as const;

      const adxData = computeADX(candles, 14);
      const adx = last(adxData.adx);
      const plusDI = last(adxData.plusDI);
      const minusDI = last(adxData.minusDI);

      const stochData = computeStochRSI(candles, 14, 14, 3, 3);
      const stochRsi = stochData.k.length > 0 && stochData.d.length > 0
        ? { k: stochData.k[stochData.k.length - 1].value, d: stochData.d[stochData.d.length - 1].value }
        : null;

      const bbData = computeBollingerBands(candles, 20, 2);
      const bb = bbData.upper.length > 0 ? {
        upper: bbData.upper[bbData.upper.length - 1].value,
        middle: bbData.middle[bbData.middle.length - 1].value,
        lower: bbData.lower[bbData.lower.length - 1].value,
        bandwidth: ((bbData.upper[bbData.upper.length - 1].value - bbData.lower[bbData.lower.length - 1].value) / bbData.middle[bbData.middle.length - 1].value) * 100,
      } : null;

      const vwapData = computeVWAP(candles);
      const vwap = last(vwapData);
      const atr = computeATR(candles);
      const ichi = computeIchimoku(candles);
      const ms = analyzeMarketStructure(candles);
      const pattern = detectPattern(candles);

      let change7d = 0;
      if (timeframe === '1D' && candles.length >= 7) {
        change7d = ((ticker24h.lastPrice - candles[candles.length - 7].close) / candles[candles.length - 7].close) * 100;
      }

      return {
        symbol, price: ticker24h.lastPrice, change24h: ticker24h.priceChangePercent, change7d,
        volume24h: ticker24h.quoteVolume, volumeChange: 0,
        rsi, macd, ema20, ema50, ema200, sma20, sma50, sma200,
        supertrend, adx, plusDI, minusDI, stochRsi, bb, vwap, atr,
        pattern, ichiKumo: ichi.kumo, ichiTk: ichi.tk,
        msHighs: ms.highs, msLows: ms.lows, candles,
      } as ScreenerRow;
    } catch (err) {
      console.error(`Screener error for ${symbol}:`, err);
      return null;
    }
  });

  const all = await Promise.all(promises);
  return all.filter((r): r is ScreenerRow => r !== null);
}

export function applyFilters(data: ScreenerRow[], filters: ScreenerFilters): ScreenerRow[] {
  return data.filter((row) => {
    // Price
    if (filters.minPrice !== undefined && row.price < filters.minPrice) return false;
    if (filters.maxPrice !== undefined && row.price > filters.maxPrice) return false;
    // Volume
    if (filters.minVolume !== undefined && row.volume24h < filters.minVolume) return false;
    if (filters.maxVolume !== undefined && row.volume24h > filters.maxVolume) return false;
    // Change
    if (filters.minChange !== undefined && row.change24h < filters.minChange) return false;
    if (filters.maxChange !== undefined && row.change24h > filters.maxChange) return false;
    // RSI
    if (filters.rsiOversold !== undefined && row.rsi !== null && row.rsi >= filters.rsiOversold) return false;
    if (filters.rsiOverbought !== undefined && row.rsi !== null && row.rsi <= filters.rsiOverbought) return false;
    // StochRSI
    if (filters.stochRsiOversold !== undefined && row.stochRsi && row.stochRsi.k >= filters.stochRsiOversold) return false;
    if (filters.stochRsiOverbought !== undefined && row.stochRsi && row.stochRsi.k <= filters.stochRsiOverbought) return false;
    // Trend
    if (filters.trendDirection && filters.trendDirection !== 'any' && row.supertrend !== filters.trendDirection) return false;
    // EMA Cross
    if (filters.emaCross && filters.emaCross !== 'any') {
      if (row.ema20 !== null && row.ema50 !== null) {
        if (filters.emaCross === 'bullish' && row.ema20 <= row.ema50) return false;
        if (filters.emaCross === 'bearish' && row.ema20 >= row.ema50) return false;
      }
    }
    // Price vs EMA 200
    if (filters.priceVsEma200 && filters.priceVsEma200 !== 'any' && row.ema200 !== null) {
      if (filters.priceVsEma200 === 'above' && row.price <= row.ema200) return false;
      if (filters.priceVsEma200 === 'below' && row.price >= row.ema200) return false;
    }
    // Price vs SMA 200
    if (filters.priceVsSma200 && filters.priceVsSma200 !== 'any' && row.sma200 !== null) {
      if (filters.priceVsSma200 === 'above' && row.price <= row.sma200) return false;
      if (filters.priceVsSma200 === 'below' && row.price >= row.sma200) return false;
    }
    // MACD Cross
    if (filters.macdCross && filters.macdCross !== 'any' && row.macd) {
      if (filters.macdCross === 'bullish' && row.macd.histogram <= 0) return false;
      if (filters.macdCross === 'bearish' && row.macd.histogram >= 0) return false;
    }
    // ADX
    if (filters.minAdx !== undefined && row.adx !== null && row.adx < filters.minAdx) return false;
    // Candle patterns
    if (filters.candlePattern && filters.candlePattern.length > 0) {
      if (!row.pattern || !filters.candlePattern.includes(row.pattern)) return false;
    }
    // BB Squeeze
    if (filters.bbSqueeze && row.bb) {
      if (row.bb.bandwidth > 4) return false; // Not squeezing
    }
    // BB Breakout
    if (filters.bbBreakout && filters.bbBreakout !== 'any' && row.bb) {
      if (filters.bbBreakout === 'upper' && row.price <= row.bb.upper) return false;
      if (filters.bbBreakout === 'lower' && row.price >= row.bb.lower) return false;
    }
    // Ichimoku
    if (filters.ichiKumo && filters.ichiKumo !== 'any' && row.ichiKumo !== filters.ichiKumo) return false;
    if (filters.ichiTk && filters.ichiTk !== 'any' && row.ichiTk !== filters.ichiTk) return false;
    // Market Structure
    if (filters.msHighs && filters.msHighs.length > 0 && (!row.msHighs || !filters.msHighs.includes(row.msHighs))) return false;
    if (filters.msLows && filters.msLows.length > 0 && (!row.msLows || !filters.msLows.includes(row.msLows))) return false;
    // Break High/Low
    if (filters.breakHigh && row.candles.length >= 20) {
      const prev20High = Math.max(...row.candles.slice(-21, -1).map(c => c.high));
      if (row.price <= prev20High) return false;
    }
    if (filters.breakLow && row.candles.length >= 20) {
      const prev20Low = Math.min(...row.candles.slice(-21, -1).map(c => c.low));
      if (row.price >= prev20Low) return false;
    }
    // Sweep High/Low
    if (filters.sweepHigh && row.candles.length >= 20) {
      const prev20High = Math.max(...row.candles.slice(-21, -1).map(c => c.high));
      const curr = row.candles[row.candles.length - 1];
      if (!(curr.high > prev20High && curr.close < prev20High)) return false;
    }
    if (filters.sweepLow && row.candles.length >= 20) {
      const prev20Low = Math.min(...row.candles.slice(-21, -1).map(c => c.low));
      const curr = row.candles[row.candles.length - 1];
      if (!(curr.low < prev20Low && curr.close > prev20Low)) return false;
    }
    // Custom formula
    if (filters.customFormula) {
      try {
        const ctx = {
          price: row.price, change: row.change24h, volume: row.volume24h,
          rsi: row.rsi ?? 0, ema20: row.ema20 ?? 0, ema50: row.ema50 ?? 0, ema200: row.ema200 ?? 0,
          sma20: row.sma20 ?? 0, sma50: row.sma50 ?? 0, sma200: row.sma200 ?? 0,
          adx: row.adx ?? 0, atr: row.atr ?? 0, vwap: row.vwap ?? 0,
          macd: row.macd?.histogram ?? 0, stochK: row.stochRsi?.k ?? 0, stochD: row.stochRsi?.d ?? 0,
          bbUpper: row.bb?.upper ?? 0, bbLower: row.bb?.lower ?? 0, bbBandwidth: row.bb?.bandwidth ?? 0,
        };
        const result = new Function(...Object.keys(ctx), `return ${filters.customFormula}`)(...Object.values(ctx));
        if (!result) return false;
      } catch { return false; }
    }
    return true;
  });
}

export function sortScreenerData(data: ScreenerRow[], sortBy: keyof ScreenerRow, order: 'asc' | 'desc'): ScreenerRow[] {
  return [...data].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    if (typeof aVal === 'number' && typeof bVal === 'number') return order === 'asc' ? aVal - bVal : bVal - aVal;
    if (typeof aVal === 'string' && typeof bVal === 'string') return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    return 0;
  });
}

export const ALL_PATTERNS = ['Bullish Engulfing', 'Bearish Engulfing', 'Doji', 'Hammer', 'Shooting Star', 'Morning Star'];
