import { Timeframe } from './trading';

/** Supported indicator strategy types — extend this union for new indicators */
export type StrategyType = 'pct_diff_don';

/** Which lines to use for crossover detection */
export type PctDiffDonSource = 'main' | 'ema' | 'basis' | 'upper' | 'lower' | 'upperNew' | 'lowerNew';

export interface PctDiffDonStrategyConfig {
  type: 'pct_diff_don';
  source1: PctDiffDonSource;
  source2: PctDiffDonSource;
  emaPeriod: number;
  lookbackWindow: number;
  emaSmoothing: number;
  donchianLength: number;
  donLineDiff: number;
}

/** Union of all strategy configs — add new indicator configs here */
export type StrategyConfig = PctDiffDonStrategyConfig;

export interface TrackedEntry {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  strategy: StrategyConfig;
  /** Price at crossover detection */
  entryPrice: number;
  /** Timestamp of crossover */
  entryTime: number;
  /** Direction: source1 crossed above or below source2 */
  direction: 'above' | 'below';
  /** Whether tracking is active */
  active: boolean;
  /** Current price (updated in memory) */
  currentPrice?: number;
  /** Performance snapshots: price at entry + N days */
  perf1D?: number;
  perf3D?: number;
  perf7D?: number;
  perf1M?: number;
}

export interface TrackerSymbol {
  symbol: string;
  timeframe: Timeframe;
  strategy: StrategyConfig;
}
