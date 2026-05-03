import { Timeframe, Candle } from './trading';

export type HTFDisplayMode = 'candles' | 'zones' | 'highlow';

export interface HTFLayerConfig {
  timeframe: Timeframe;
  enabled: boolean;
  color: string;      // hex color for the layer
  opacity: number;     // 0-1
  showWicks: boolean;
  mode: HTFDisplayMode;
}

export interface HTFOverlayState {
  layers: HTFLayerConfig[];
  autoMode: boolean;          // auto-pick HTFs based on base TF
  trendAlignment: boolean;    // highlight trend alignment
}

export const TF_SECONDS: Record<Timeframe, number> = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900,
  '1h': 3600, '4h': 14400, '1D': 86400, '1W': 604800,
};

// For auto mode: given base TF, which HTFs to show
export const AUTO_HTF_MAP: Record<Timeframe, [Timeframe, Timeframe]> = {
  '1m': ['5m', '15m'],
  '3m': ['15m', '1h'],
  '5m': ['15m', '1h'],
  '15m': ['1h', '4h'],
  '1h': ['4h', '1D'],
  '4h': ['1D', '1W'],
  '1D': ['1W', '1W'],
  '1W': ['1W', '1W'],
};

export const DEFAULT_LAYERS: HTFLayerConfig[] = [
  { timeframe: '15m', enabled: false, color: '#FFB020', opacity: 0.35, showWicks: false, mode: 'candles' },
  { timeframe: '1h', enabled: false, color: '#6366F1', opacity: 0.15, showWicks: false, mode: 'zones' },
];
