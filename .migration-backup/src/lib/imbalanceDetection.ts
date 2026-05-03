import { FootprintCandle, PriceLevel, autoTickSize, processTradesIntoFootprint } from './footprintProcessor';
import { AggTrade } from './tradeData';
import { Timeframe } from '@/types/trading';

export interface ImbalanceCell {
  candleTime: number;
  price: number;
  type: 'buy' | 'sell'; // buy imbalance = aggressive buyers dominating
  ratio: number;
  buyVolume: number;
  sellVolume: number;
}

export interface StackedImbalanceZone {
  candleTime: number;
  type: 'buy' | 'sell';
  topPrice: number;
  bottomPrice: number;
  cells: ImbalanceCell[];
}

export interface ImbalanceResult {
  cells: ImbalanceCell[];
  zones: StackedImbalanceZone[];
}

/**
 * Detect imbalances within footprint candles.
 * 
 * Buy imbalance: buyVolume at price level N >= threshold * sellVolume at level N-1
 * Sell imbalance: sellVolume at price level N >= threshold * buyVolume at level N+1
 * 
 * This compares diagonal values (bid vs ask at adjacent levels) similar to TradingView.
 */
export function detectImbalances(
  candles: FootprintCandle[],
  threshold: number = 3,
  minStackSize: number = 3
): ImbalanceResult {
  const allCells: ImbalanceCell[] = [];

  for (const candle of candles) {
    const levels = candle.levels;
    if (levels.length < 2) continue;

    for (let i = 0; i < levels.length; i++) {
      const current = levels[i];

      // Buy imbalance: current buy vs previous level's sell (diagonal comparison)
      if (i > 0) {
        const below = levels[i - 1];
        const sellBelow = below.sellVolume;
        if (current.buyVolume > 0 && (sellBelow === 0 || current.buyVolume / Math.max(sellBelow, 1) >= threshold)) {
          allCells.push({
            candleTime: candle.time,
            price: current.price,
            type: 'buy',
            ratio: sellBelow === 0 ? Infinity : current.buyVolume / sellBelow,
            buyVolume: current.buyVolume,
            sellVolume: sellBelow,
          });
        }
      }

      // Sell imbalance: current sell vs next level's buy (diagonal comparison)
      if (i < levels.length - 1) {
        const above = levels[i + 1];
        const buyAbove = above.buyVolume;
        if (current.sellVolume > 0 && (buyAbove === 0 || current.sellVolume / Math.max(buyAbove, 1) >= threshold)) {
          allCells.push({
            candleTime: candle.time,
            price: current.price,
            type: 'sell',
            ratio: buyAbove === 0 ? Infinity : current.sellVolume / buyAbove,
            buyVolume: buyAbove,
            sellVolume: current.sellVolume,
          });
        }
      }
    }
  }

  // Detect stacked imbalance zones (consecutive same-type imbalances in same candle)
  const zones: StackedImbalanceZone[] = [];
  
  // Group cells by candle time and type
  const grouped = new Map<string, ImbalanceCell[]>();
  for (const cell of allCells) {
    const key = `${cell.candleTime}:${cell.type}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(cell);
  }

  for (const [, cells] of grouped) {
    // Sort by price
    cells.sort((a, b) => a.price - b.price);
    
    // Find consecutive runs
    let runStart = 0;
    for (let i = 1; i <= cells.length; i++) {
      const isConsecutive = i < cells.length && 
        Math.abs(cells[i].price - cells[i - 1].price) < cells[0].price * 0.005; // within ~0.5% = adjacent level
      
      if (!isConsecutive) {
        const run = cells.slice(runStart, i);
        if (run.length >= minStackSize) {
          zones.push({
            candleTime: run[0].candleTime,
            type: run[0].type,
            bottomPrice: run[0].price,
            topPrice: run[run.length - 1].price,
            cells: run,
          });
        }
        runStart = i;
      }
    }
  }

  return { cells: allCells, zones };
}

/**
 * Process trades and detect imbalances in one step.
 */
export function processTradesAndDetectImbalances(
  trades: AggTrade[],
  timeframe: Timeframe,
  threshold: number = 3,
  minStackSize: number = 3,
  tickSize?: number
): ImbalanceResult {
  const footprint = processTradesIntoFootprint(trades, timeframe, tickSize);
  return detectImbalances(footprint, threshold, minStackSize);
}
