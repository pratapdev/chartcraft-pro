export interface Candle {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '1m' | '3m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W';

export type MarketType = 'crypto' | 'indian';

export type LineStyleType = 'solid' | 'dashed' | 'dotted';

export interface Trendline {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
  color: string;
  thickness: number;
  lineStyle?: LineStyleType;
  createdAt: number;
}

export type DrawingTool = 'cursor' | 'trendline' | 'horizontal' | 'vertical' | 'ray' | 'measure' | 'fibonacci' | 'riskreward';

export interface RiskRewardDrawing {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  entryTime: number;
  createdAt: number;
}

export interface FibonacciDrawing {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
  createdAt: number;
}

export type AlertCondition = 'cross_above' | 'cross_below' | 'cross_any';
export type ThresholdCondition = 'above' | 'below';

export interface Alert {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  trendlineId: string;
  condition: AlertCondition;
  active: boolean;
  triggered: boolean;
  triggeredAt?: number;
  message?: string;
  createdAt: number;
  telegramEnabled?: boolean;
}

export interface IndicatorCrossAlert {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  indicatorId1: string;
  indicatorId2: string;
  condition: AlertCondition;
  active: boolean;
  triggered: boolean;
  triggeredAt?: number;
  message?: string;
  createdAt: number;
  telegramEnabled?: boolean;
}

export interface IndicatorThresholdAlert {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  /** Which indicator (by id) to watch */
  indicatorId: string;
  /** 'above' or 'below' */
  condition: ThresholdCondition;
  /** The threshold value (e.g. RSI 70, ADX 25) */
  threshold: number;
  active: boolean;
  triggered: boolean;
  triggeredAt?: number;
  message?: string;
  createdAt: number;
  telegramEnabled?: boolean;
}

export interface StochRSICrossAlert {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  /** The StochRSI indicator id */
  indicatorId: string;
  condition: AlertCondition;
  active: boolean;
  triggered: boolean;
  triggeredAt?: number;
  message?: string;
  createdAt: number;
  telegramEnabled?: boolean;
}

export type PctDiffDonLine = 'main' | 'ema' | 'basis' | 'upper' | 'lower' | 'upperNew' | 'lowerNew';

export interface PctDiffDonCrossAlert {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  indicatorId: string;
  line1: PctDiffDonLine;
  line2: PctDiffDonLine;
  condition: AlertCondition;
  active: boolean;
  triggered: boolean;
  triggeredAt?: number;
  message?: string;
  createdAt: number;
  telegramEnabled?: boolean;
}

export interface AlertLog {
  id: string;
  alertId: string;
  symbol: string;
  message: string;
  timestamp: number;
  price: number;
}

export type SmartMoneyAlertCondition =
  | 'fvg_bull_entry'
  | 'fvg_bear_entry'
  | 'bos_cross'
  | 'choch_cross'
  | 'liquidity_sweep';

export interface SmartMoneyAlert {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  condition: SmartMoneyAlertCondition;
  active: boolean;
  triggered: boolean;
  triggeredAt?: number;
  lastFiredCandleTime?: number;
  message?: string;
  createdAt: number;
  telegramEnabled?: boolean;
}

export type IndicatorType = 'EMA' | 'SMA' | 'RSI' | 'STOCH_RSI' | 'MACD' | 'BBANDS' | 'VWAP' | 'SUPERTREND' | 'ADX' | 'ATR' | 'OBV' | 'PIVOT_HL' | 'PCT_DIFF_DON' | 'MSB_OB' | 'VPVR' | 'IMBALANCE' | 'FVG' | 'MARKET_STRUCTURE' | 'PATTERN' | 'ANCHORED_VWAP' | 'SESSION_VWAP' | 'SUPPLY_DEMAND' | 'DELTA_DIV' | 'LIQUIDATIONS';

export interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  period: number;
  color: string;
  visible: boolean;
  paneMode?: 'mirror' | 'independent';
  /** Line width for the indicator */
  lineWidth?: number;
  /** Line style for the indicator */
  lineStyle?: LineStyleType;
  /** For StochRSI: smoothing K period */
  kPeriod?: number;
  /** For StochRSI: smoothing D period */
  dPeriod?: number;
  /** Secondary color for D line in StochRSI, or sell color for Supertrend */
  color2?: string;
  /** Standard deviation multiplier for Bollinger Bands */
  stdDev?: number;
  /** ATR multiplier for Supertrend */
  multiplier?: number;
  /** PCT_DIFF_DON: lookback window for EMA average */
  lookbackWindow?: number;
  /** PCT_DIFF_DON: EMA smoothing period for the percentage diff line */
  emaSmoothing?: number;
  /** PCT_DIFF_DON: Donchian channel length */
  donchianLength?: number;
  /** PCT_DIFF_DON: Donchian line diff multiplier */
  donLineDiff?: number;
  /** MSB_OB: ZigZag length */
  zigzagLength?: number;
  /** MSB_OB: Fib factor for breakout confirmation */
  fibFactor?: number;
  /** IMBALANCE: ratio threshold (e.g. 3 = 300%) */
  threshold?: number;
  /** IMBALANCE: minimum consecutive levels for stacked zone */
  minStack?: number;
  /** HTF overlay: timeframe to display */
  timeframe?: Timeframe;
  /** HTF overlay: display mode */
  displayMode?: 'candles' | 'zones' | 'highlow';
  /** HTF overlay: show candle wicks */
  showWicks?: boolean;
  /** FVG: show mitigated (filled) zones */
  showMitigated?: boolean;
  /** MARKET_STRUCTURE: show liquidity sweeps */
  showSweeps?: boolean;
  /** MARKET_STRUCTURE: show swing high/low dots */
  showSwingDots?: boolean;
  /** ANCHORED_VWAP: unix timestamp (seconds) of the anchor bar; 0 = session start */
  anchorTime?: number;
  /** ANCHORED_VWAP / SESSION_VWAP: show +/-1σ and +/-2σ bands */
  showBands?: boolean;
  /** PATTERN: pivot lookback length */
  pivotLen?: number;
  /** SUPPLY_DEMAND: strength threshold 0-1 */
  sdStrength?: number;
  /** SUPPLY_DEMAND: zone ATR multiplier for height */
  sdAtrMult?: number;
  /** DELTA_DIV: pivot left lookback */
  pivotLeft?: number;
  /** DELTA_DIV: pivot right confirmation */
  pivotRight?: number;
  /** DELTA_DIV: minimum delta difference to qualify */
  minDeltaDiff?: number;
}
