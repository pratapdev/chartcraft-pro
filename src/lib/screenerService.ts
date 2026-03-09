import { Candle, Timeframe } from '@/types/trading';
import { fetchCandles, computeRSI, computeSMA, computeEMA, computeSupertrend, computeMACD, computeADX, computeStochRSI, computeBollingerBands, computeVWAP } from './marketData';

export interface ScreenerRow {
  symbol: string;
  price: number;
  change24h: number;
  change7d: number;
  volume24h: number;
  volumeChange: number;
  marketCap?: number;
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
  bollingerBands: { upper: number; middle: number; lower: number; bandwidth: number } | null;
  vwap: number | null;
  atr: number | null;
  pattern: string | null;
  ichiKumo: 'bullish' | 'bearish' | null;
  ichiTk: 'bullish' | 'bearish' | null;
  msHighs: 'LH' | 'HH' | 'HL' | 'LL' | null;
  msLows: 'LH' | 'HH' | 'HL' | 'LL' | null;
  pivotFib: number | null;
  pivPct: number | null;
  candles: Candle[];
}

export interface ScreenerFilters {
  // Timeframe
  timeframe?: Timeframe;
  
  // Price & Volume
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
  maxVolume?: number;
  minChange?: number;
  maxChange?: number;
  
  // Trend / Crossover
  trendDirection?: 'bullish' | 'bearish' | 'any';
  emaCross?: 'bullish' | 'bearish' | 'any'; // EMA 20/50 cross
  smaCross?: 'bullish' | 'bearish' | 'any'; // SMA 20/50 cross
  priceVsEma200?: 'above' | 'below' | 'any';
  priceVsSma200?: 'above' | 'below' | 'any';
  
  // Momentum / Oscillator
  rsiOversold?: number; // e.g., < 30
  rsiOverbought?: number; // e.g., > 70
  stochRsiOversold?: number; // e.g., < 20
  stochRsiOverbought?: number; // e.g., > 80
  macdCross?: 'bullish' | 'bearish' | 'any';
  adxStrength?: number; // e.g., > 25 for strong trend
  
  // Price Action
  candlePattern?: string[];
  breakHigh?: boolean; // Breaking recent high
  breakLow?: boolean; // Breaking recent low
  supportLevel?: boolean;
  resistanceLevel?: boolean;
  sweepHigh?: boolean;
  sweepLow?: boolean;
  
  // Bollinger Bands
  bbSqueeze?: boolean; // Low bandwidth
  bbBreakout?: 'upper' | 'lower' | 'any';
  
  // Ichimoku
  ichiKumo?: 'bullish' | 'bearish' | 'any';
  ichiTk?: 'bullish' | 'bearish' | 'any';
  
  // Market Structure
  msHighs?: ('LH' | 'HH' | 'HL' | 'LL')[];
  msLows?: ('LH' | 'HH' | 'HL' | 'LL')[];
  
  // Fibonacci
  fib618Bull?: boolean;
  fib618Bear?: boolean;
  
  // Custom formula
  customFormula?: string;
}

const CRYPTO_SYMBOLS = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD',
  'ADA/USD', 'DOGE/USD', 'AVAX/USD', 'MATIC/USD', 'DOT/USD',
  'LINK/USD', 'UNI/USD', 'ATOM/USD', 'LTC/USD', 'ETC/USD',
  'BCH/USD', 'XLM/USD', 'FIL/USD', 'TRX/USD', 'NEAR/USD',
];

// Fetch 24h ticker data from Binance
async function fetch24hTicker(binanceSymbol: string) {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      priceChange: parseFloat(data.priceChange),
      priceChangePercent: parseFloat(data.priceChangePercent),
      lastPrice: parseFloat(data.lastPrice),
      volume: parseFloat(data.volume),
      quoteVolume: parseFloat(data.quoteVolume),
    };
  } catch {
    return null;
  }
}

// Compute ATR
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
  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
  }
  return Math.round(atr * 100) / 100;
}

// Compute Ichimoku Cloud signals
function computeIchimoku(candles: Candle[]): { kumo: 'bullish' | 'bearish' | null; tk: 'bullish' | 'bearish' | null } {
  if (candles.length < 52) return { kumo: null, tk: null };
  
  // Tenkan-sen (9-period high+low)/2
  const tenkan = (Math.max(...candles.slice(-9).map(c => c.high)) + Math.min(...candles.slice(-9).map(c => c.low))) / 2;
  // Kijun-sen (26-period high+low)/2
  const kijun = (Math.max(...candles.slice(-26).map(c => c.high)) + Math.min(...candles.slice(-26).map(c => c.low))) / 2;
  // Senkou Span A (Tenkan + Kijun) / 2 projected 26 ahead
  const spanA = (tenkan + kijun) / 2;
  // Senkou Span B (52-period high+low)/2 projected 26 ahead
  const spanB = (Math.max(...candles.slice(-52).map(c => c.high)) + Math.min(...candles.slice(-52).map(c => c.low))) / 2;
  
  const price = candles[candles.length - 1].close;
  const kumo = price > Math.max(spanA, spanB) ? 'bullish' : price < Math.min(spanA, spanB) ? 'bearish' : null;
  const tk = tenkan > kijun ? 'bullish' : tenkan < kijun ? 'bearish' : null;
  
  return { kumo, tk };
}

// Market structure analysis (Higher Highs, Lower Lows, etc.)
function analyzeMarketStructure(candles: Candle[]): { highs: 'HH' | 'LH' | 'HL' | 'LL' | null; lows: 'HH' | 'LH' | 'HL' | 'LL' | null } {
  if (candles.length < 20) return { highs: null, lows: null };
  const recent = candles.slice(-10);
  const prev = candles.slice(-20, -10);
  
  const recentHigh = Math.max(...recent.map(c => c.high));
  const prevHigh = Math.max(...prev.map(c => c.high));
  const recentLow = Math.min(...recent.map(c => c.low));
  const prevLow = Math.min(...prev.map(c => c.low));
  
  let highs: 'HH' | 'LH' | 'HL' | 'LL' | null = null;
  let lows: 'HH' | 'LH' | 'HL' | 'LL' | null = null;
  
  if (recentHigh > prevHigh) highs = 'HH';
  else if (recentHigh < prevHigh) highs = 'LH';
  
  if (recentLow > prevLow) lows = 'HL';
  else if (recentLow < prevLow) lows = 'LL';
  
  return { highs, lows };
}

// Compute MACD with proper structure
function computeMACD(candles: Candle[]) {
  const macdData = computeMACD(candles, 12, 26, 9);
  if (macdData.histogram.length === 0) return null;
  const latest = macdData.histogram[macdData.histogram.length - 1];
  const latestMacd = macdData.macdLine[macdData.macdLine.length - 1];
  const latestSignal = macdData.signalLine[macdData.signalLine.length - 1];
  return {
    value: latestMacd.value,
    signal: latestSignal.value,
    histogram: latest.value,
  };
}

// Simple pattern detection (engulfing, doji, hammer, etc.)
function detectPattern(candles: Candle[]): string | null {
  if (candles.length < 2) return null;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const currBody = Math.abs(curr.close - curr.open);
  const prevBody = Math.abs(prev.close - prev.open);
  const currRange = curr.high - curr.low;

  // Bullish Engulfing
  if (prev.close < prev.open && curr.close > curr.open && curr.open <= prev.close && curr.close >= prev.open) {
    return 'Bullish Engulfing';
  }

  // Bearish Engulfing
  if (prev.close > prev.open && curr.close < curr.open && curr.open >= prev.close && curr.close <= prev.open) {
    return 'Bearish Engulfing';
  }

  // Doji (small body)
  if (currBody < currRange * 0.1 && currRange > 0) {
    return 'Doji';
  }

  // Hammer (bullish reversal)
  const lowerWick = Math.min(curr.open, curr.close) - curr.low;
  const upperWick = curr.high - Math.max(curr.open, curr.close);
  if (lowerWick > currBody * 2 && upperWick < currBody * 0.5 && currRange > 0) {
    return 'Hammer';
  }

  // Shooting Star (bearish reversal)
  if (upperWick > currBody * 2 && lowerWick < currBody * 0.5 && currRange > 0) {
    return 'Shooting Star';
  }

  return null;
}

export async function fetchScreenerData(timeframe: Timeframe = '1D'): Promise<ScreenerRow[]> {
  const results: ScreenerRow[] = [];

  for (const symbol of CRYPTO_SYMBOLS) {
    try {
      const binanceSymbol = symbol.replace('/', '').replace('USD', 'USDT');
      
      // Fetch candles and 24h ticker in parallel
      const [candles, ticker24h] = await Promise.all([
        fetchCandles(symbol, timeframe, 100),
        fetch24hTicker(binanceSymbol),
      ]);

      if (!candles || candles.length === 0 || !ticker24h) continue;

      // Compute indicators
      const rsiData = computeRSI(candles, 14);
      const rsi = rsiData.length > 0 ? rsiData[rsiData.length - 1].value : null;

      const macd = computeMACD(candles);

      const ema20Data = computeEMA(candles, 20);
      const ema20 = ema20Data.length > 0 ? ema20Data[ema20Data.length - 1].value : null;

      const ema50Data = computeEMA(candles, 50);
      const ema50 = ema50Data.length > 0 ? ema50Data[ema50Data.length - 1].value : null;

      const supertrendData = computeSupertrend(candles, 10, 3);
      const lastSupertrend = supertrendData.line[supertrendData.line.length - 1];
      const supertrend = lastSupertrend?.color === '#22c55e' ? 'bullish' : 'bearish';

      const pattern = detectPattern(candles);

      // Estimate 7d change (compare current price to 7 days ago if available)
      let change7d = 0;
      if (timeframe === '1D' && candles.length >= 7) {
        const weekAgoPrice = candles[candles.length - 7].close;
        change7d = ((ticker24h.lastPrice - weekAgoPrice) / weekAgoPrice) * 100;
      }

      results.push({
        symbol,
        price: ticker24h.lastPrice,
        change24h: ticker24h.priceChangePercent,
        change7d,
        volume24h: ticker24h.quoteVolume,
        volumeChange: 0, // Binance doesn't provide this directly
        rsi,
        macd,
        ema20,
        ema50,
        supertrend,
        pattern,
        candles,
      });
    } catch (err) {
      console.error(`Failed to fetch screener data for ${symbol}:`, err);
    }
  }

  return results;
}

export function applyFilters(data: ScreenerRow[], filters: ScreenerFilters): ScreenerRow[] {
  return data.filter((row) => {
    // Price filters
    if (filters.minPrice !== undefined && row.price < filters.minPrice) return false;
    if (filters.maxPrice !== undefined && row.price > filters.maxPrice) return false;

    // Volume filters
    if (filters.minVolume !== undefined && row.volume24h < filters.minVolume) return false;
    if (filters.maxVolume !== undefined && row.volume24h > filters.maxVolume) return false;

    // Change filters
    if (filters.minChange !== undefined && row.change24h < filters.minChange) return false;
    if (filters.maxChange !== undefined && row.change24h > filters.maxChange) return false;

    // RSI filters
    if (filters.rsiOversold !== undefined && row.rsi !== null && row.rsi >= filters.rsiOversold) return false;
    if (filters.rsiOverbought !== undefined && row.rsi !== null && row.rsi <= filters.rsiOverbought) return false;

    // Trend direction
    if (filters.trendDirection && filters.trendDirection !== 'any') {
      if (row.supertrend !== filters.trendDirection) return false;
    }

    // Pattern filter
    if (filters.pattern && filters.pattern.length > 0) {
      if (!row.pattern || !filters.pattern.includes(row.pattern)) return false;
    }

    // Custom formula (basic eval - in production, use a safe parser)
    if (filters.customFormula) {
      try {
        const context = {
          price: row.price,
          change: row.change24h,
          volume: row.volume24h,
          rsi: row.rsi ?? 0,
          ema20: row.ema20 ?? 0,
          ema50: row.ema50 ?? 0,
        };
        // Simple formula evaluation (e.g., "rsi < 30 && volume > 1000000")
        const result = new Function(...Object.keys(context), `return ${filters.customFormula}`)(...Object.values(context));
        if (!result) return false;
      } catch {
        return false;
      }
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

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    return 0;
  });
}
