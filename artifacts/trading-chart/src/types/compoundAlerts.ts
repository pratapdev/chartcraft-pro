import { Timeframe } from './trading';

export interface AlertConditionRule {
  type: 'price_above' | 'price_below' | 'rsi_above' | 'rsi_below' | 'ema_above' | 'ema_below';
  value: number;
  period?: number; // for RSI/EMA
}

export interface CompoundAlert {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  /** All conditions must be true (AND logic) */
  conditions: AlertConditionRule[];
  active: boolean;
  triggered: boolean;
  triggeredAt?: number;
  message?: string;
  createdAt: number;
  telegramEnabled?: boolean;
  whatsappEnabled?: boolean;
}

export interface AlertTemplate {
  id: string;
  name: string;
  /** Conditions with symbol placeholder */
  conditions: AlertConditionRule[];
  timeframe: Timeframe;
  createdAt: number;
}
