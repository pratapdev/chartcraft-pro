export interface Candle {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W';

export type MarketType = 'crypto' | 'indian';

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
  createdAt: number;
}

export type DrawingTool = 'cursor' | 'trendline' | 'horizontal' | 'ray' | 'measure' | 'fibonacci';

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
}

export interface AlertLog {
  id: string;
  alertId: string;
  symbol: string;
  message: string;
  timestamp: number;
  price: number;
}

export type IndicatorType = 'EMA' | 'SMA' | 'RSI' | 'STOCH_RSI' | 'MACD' | 'BBANDS' | 'VWAP';

export interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  period: number;
  color: string;
  visible: boolean;
  /** For StochRSI: smoothing K period */
  kPeriod?: number;
  /** For StochRSI: smoothing D period */
  dPeriod?: number;
  /** Secondary color for D line in StochRSI */
  color2?: string;
  /** Standard deviation multiplier for Bollinger Bands */
  stdDev?: number;
}
