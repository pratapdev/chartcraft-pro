import { AggTrade, getTimeframeMs } from './tradeData';
import { Timeframe } from '@/types/trading';

export interface PriceLevel {
  price: number;
  buyVolume: number;
  sellVolume: number;
  delta: number; // buyVolume - sellVolume
}

export interface FootprintCandle {
  time: number; // unix seconds (candle open time)
  open: number;
  high: number;
  low: number;
  close: number;
  totalVolume: number;
  totalDelta: number;
  levels: PriceLevel[]; // sorted by price ascending
  tickSize: number;
}

/**
 * Auto-calculate tick size based on price.
 * Similar to TradingView's approach.
 */
export function autoTickSize(price: number): number {
  if (price >= 50000) return 50;
  if (price >= 10000) return 25;
  if (price >= 5000) return 10;
  if (price >= 1000) return 5;
  if (price >= 100) return 1;
  if (price >= 10) return 0.5;
  if (price >= 1) return 0.1;
  if (price >= 0.1) return 0.01;
  return 0.001;
}

function roundToTick(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

/**
 * Process an array of trades into FootprintCandles.
 */
export function processTradesIntoFootprint(
  trades: AggTrade[],
  timeframe: Timeframe,
  tickSize?: number
): FootprintCandle[] {
  if (!trades.length) return [];

  const tfMs = getTimeframeMs(timeframe);
  const candles = new Map<number, {
    open: number; high: number; low: number; close: number;
    levels: Map<number, { buy: number; sell: number }>;
    totalVol: number; totalDelta: number; firstTime: number;
  }>();

  const ts = tickSize ?? autoTickSize(trades[0].price);

  for (const trade of trades) {
    // Candle open time in seconds
    const candleTime = Math.floor(trade.time / tfMs) * (tfMs / 1000);
    const priceLevel = roundToTick(trade.price, ts);

    let candle = candles.get(candleTime);
    if (!candle) {
      candle = {
        open: trade.price, high: trade.price, low: trade.price, close: trade.price,
        levels: new Map(), totalVol: 0, totalDelta: 0, firstTime: trade.time,
      };
      candles.set(candleTime, candle);
    }

    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price;

    let level = candle.levels.get(priceLevel);
    if (!level) {
      level = { buy: 0, sell: 0 };
      candle.levels.set(priceLevel, level);
    }

    const vol = trade.price * trade.quantity;
    // isBuyerMaker=true means the buyer was the maker, so it's a sell (taker sold)
    if (trade.isBuyerMaker) {
      level.sell += vol;
      candle.totalDelta -= vol;
    } else {
      level.buy += vol;
      candle.totalDelta += vol;
    }
    candle.totalVol += vol;
  }

  const result: FootprintCandle[] = [];
  const sortedTimes = Array.from(candles.keys()).sort((a, b) => a - b);

  for (const time of sortedTimes) {
    const c = candles.get(time)!;
    const levels: PriceLevel[] = [];
    const sortedPrices = Array.from(c.levels.keys()).sort((a, b) => a - b);

    for (const price of sortedPrices) {
      const l = c.levels.get(price)!;
      levels.push({
        price,
        buyVolume: Math.round(l.buy),
        sellVolume: Math.round(l.sell),
        delta: Math.round(l.buy - l.sell),
      });
    }

    result.push({
      time,
      open: c.open, high: c.high, low: c.low, close: c.close,
      totalVolume: Math.round(c.totalVol),
      totalDelta: Math.round(c.totalDelta),
      levels,
      tickSize: ts,
    });
  }

  return result;
}

/**
 * Add a single trade to an existing footprint candle array (for live updates).
 */
export function addTradeToFootprint(
  candles: FootprintCandle[],
  trade: AggTrade,
  timeframe: Timeframe,
  tickSize?: number
): FootprintCandle[] {
  const tfMs = getTimeframeMs(timeframe);
  const candleTime = Math.floor(trade.time / tfMs) * (tfMs / 1000);
  const ts = tickSize ?? (candles.length > 0 ? candles[candles.length - 1].tickSize : autoTickSize(trade.price));
  const priceLevel = roundToTick(trade.price, ts);

  const copy = [...candles];
  let candle = copy.find((c) => c.time === candleTime);

  if (!candle) {
    candle = {
      time: candleTime,
      open: trade.price, high: trade.price, low: trade.price, close: trade.price,
      totalVolume: 0, totalDelta: 0, levels: [], tickSize: ts,
    };
    copy.push(candle);
  } else {
    // Make a copy of the candle to avoid mutation
    const idx = copy.indexOf(candle);
    candle = { ...candle, levels: candle.levels.map((l) => ({ ...l })) };
    copy[idx] = candle;
  }

  candle.high = Math.max(candle.high, trade.price);
  candle.low = Math.min(candle.low, trade.price);
  candle.close = trade.price;

  let level = candle.levels.find((l) => Math.abs(l.price - priceLevel) < ts * 0.01);
  if (!level) {
    level = { price: priceLevel, buyVolume: 0, sellVolume: 0, delta: 0 };
    candle.levels.push(level);
    candle.levels.sort((a, b) => a.price - b.price);
  }

  const vol = trade.price * trade.quantity;
  if (trade.isBuyerMaker) {
    level.sellVolume += Math.round(vol);
    level.delta -= Math.round(vol);
    candle.totalDelta -= Math.round(vol);
  } else {
    level.buyVolume += Math.round(vol);
    level.delta += Math.round(vol);
    candle.totalDelta += Math.round(vol);
  }
  candle.totalVolume += Math.round(vol);

  return copy;
}
