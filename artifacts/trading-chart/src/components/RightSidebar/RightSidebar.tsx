import { useEffect, useRef, useState } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { useShallow } from 'zustand/react/shallow';
import { useTrackerStore } from '@/stores/trackerStore';
import {
  X, Trash2, Eye, EyeOff, Plus, Bell, Send, ArrowRightLeft, PenTool,
  RefreshCw, CloudOff, Cloud, TrendingUp, BarChart2, Settings, Zap, MessageSquare,
} from 'lucide-react';

import {
  IndicatorType, IndicatorConfig, AlertCondition, LineStyleType,
  ThresholdCondition, PctDiffDonLine, PctDiffStrategy, MarketType, Timeframe,
  SmartMoneyAlertCondition, SmartMoneyAlert,
} from '@/types/trading';
import { getTelegramCredentials, saveTelegramCredentials, testTelegramNotification } from '@/lib/telegram';
import { getWhatsAppCredentials, saveWhatsAppCredentials, testWhatsAppNotification, WhatsAppProvider } from '@/lib/whatsapp';

import { pushState, pullState, checkSyncHealth, extractSyncPayload } from '@/lib/syncService';
import { CompoundAlertForm, CompoundAlertsList, AlertTemplatesSection } from '@/components/Alerts/CompoundAlerts';
import { WatchlistPanel } from '@/components/Watchlist/WatchlistPanel';
import { HeatmapView } from '@/components/Heatmap/HeatmapView';
import { FeatureGuide } from '@/components/Guide/FeatureGuide';
import { TradeBook } from '@/components/TradeBook/TradeBook';
import { HelpCircle, BookOpen } from 'lucide-react';

const INDICATOR_PRESETS: {
  type: IndicatorType;
  label: string;
  description: string;
  group: string;
  defaults: {
    period?: number;
    color?: string;
    color2?: string;
    kPeriod?: number;
    dPeriod?: number;
    stdDev?: number;
    multiplier?: number;
    lookbackWindow?: number;
    emaSmoothing?: number;
    donchianLength?: number;
    donLineDiff?: number;
    zigzagLength?: number;
    fibFactor?: number;
    threshold?: number;
    minStack?: number;
    volMult?: number;
    maxBodyAtr?: number;
  };
}[] = [
    // Trend
    { type: 'EMA', label: 'EMA', description: 'Exponential Moving Average', group: 'Trend', defaults: { period: 20, color: '#2962FF' } },
    { type: 'SMA', label: 'SMA', description: 'Simple Moving Average', group: 'Trend', defaults: { period: 20, color: '#FF6D00' } },
    { type: 'VWAP', label: 'VWAP', description: 'Volume Weighted Average Price', group: 'Trend', defaults: { period: 1, color: '#9C27B0' } },
    { type: 'SUPERTREND', label: 'Supertrend', description: 'ATR-based trend follower', group: 'Trend', defaults: { period: 10, color: '#22c55e', color2: '#ef4444', multiplier: 3 } },
    { type: 'BBANDS', label: 'Bollinger Bands', description: 'Volatility bands', group: 'Trend', defaults: { period: 20, color: '#2962FF', stdDev: 2 } },
    // Momentum
    { type: 'RSI', label: 'RSI', description: 'Relative Strength Index', group: 'Momentum', defaults: { period: 14, color: '#9C27B0' } },
    { type: 'STOCH_RSI', label: 'Stoch RSI', description: 'Stochastic RSI', group: 'Momentum', defaults: { period: 14, color: '#2962FF', color2: '#FF6D00', kPeriod: 3, dPeriod: 3 } },
    { type: 'MACD', label: 'MACD', description: 'Moving Average Convergence Divergence', group: 'Momentum', defaults: { period: 12, color: '#2962FF' } },
    { type: 'ADX', label: 'ADX', description: 'Average Directional Index', group: 'Momentum', defaults: { period: 14, color: '#FF6D00' } },
    // Volatility / Other
    { type: 'ATR', label: 'ATR', description: 'Average True Range', group: 'Volatility', defaults: { period: 14, color: '#6b7280' } },
    { type: 'OBV', label: 'OBV', description: 'On-Balance Volume', group: 'Volatility', defaults: { period: 1, color: '#06b6d4' } },
    { type: 'PIVOT_HL', label: 'Pivot H/L', description: 'Pivot highs and lows', group: 'Volatility', defaults: { period: 5, color: '#22c55e', color2: '#ef4444' } },
    { type: 'PCT_DIFF_DON', label: 'PctDiff Don', description: 'Pct diff with Donchian', group: 'Volatility', defaults: { period: 20, color: '#06b6d4', lookbackWindow: 10, emaSmoothing: 5, donchianLength: 20, donLineDiff: 0.1 } },
    { type: 'VPVR', label: 'VPVR', description: 'Volume Profile Visible Range', group: 'Volatility', defaults: { period: 1, color: '#6b7280' } },
    { type: 'SESSION_VPVR', label: 'Session Volume Profile', description: 'Per-day volume profile drawn at the right edge of each session (POC highlighted)', group: 'Volatility', defaults: { period: 1, color: '#facc15' } },
    { type: 'COMPOSITE_VPVR', label: 'Composite VPVR', description: 'Aggregated profile across ALL loaded candles with VAH/VAL/POC labels', group: 'Volatility', defaults: { period: 1, color: '#facc15' } },
    { type: 'NAKED_LEVELS', label: 'Naked POC / VAH / VAL', description: 'Untouched per-session POC, VAH and VAL extended right until price tags them', group: 'Volatility', defaults: { period: 1, color: '#facc15' } },
    { type: 'IMBALANCE', label: 'Volume Imbalance', description: 'Stacked volume imbalance zones', group: 'Volatility', defaults: { period: 1, color: '#0096FF', threshold: 3, minStack: 3 } },
    // Smart Money
    { type: 'MSB_OB', label: 'MSB + Order Blocks', description: 'Market Structure Break & Order Blocks (ZigZag)', group: 'Smart Money', defaults: { period: 1, color: '#22c55e', zigzagLength: 9, fibFactor: 0.33 } },
    { type: 'FVG', label: 'Fair Value Gap', description: 'Bullish & bearish FVG / imbalance zones (3-candle)', group: 'Smart Money', defaults: { period: 1, color: '#22c55e', threshold: 0.1 } },
    { type: 'MARKET_STRUCTURE', label: 'Market Structure', description: 'BOS, CHOCH & liquidity sweeps', group: 'Smart Money', defaults: { period: 5, color: '#22c55e' } },
    { type: 'PATTERN', label: 'Pattern Detection', description: 'Auto-detect triangles, wedges & channels', group: 'Smart Money', defaults: { period: 5, color: '#facc15' } },
    { type: 'ANCHORED_VWAP', label: 'Anchored VWAP', description: 'VWAP anchored to a specific bar with ±1σ/2σ bands', group: 'Smart Money', defaults: { period: 1, color: '#a855f7' } },
    { type: 'SESSION_VWAP', label: 'Session VWAP', description: 'Daily-reset VWAP with standard deviation bands', group: 'Smart Money', defaults: { period: 1, color: '#f59e0b' } },
    { type: 'SUPPLY_DEMAND', label: 'Supply & Demand', description: 'Auto supply (red) and demand (green) zone detection', group: 'Smart Money', defaults: { period: 5, color: '#f97316', threshold: 0.4 } },
    { type: 'DELTA_DIV', label: 'Delta Divergence', description: 'Pivot-based price/delta divergence detector', group: 'Smart Money', defaults: { period: 1, color: '#FFD700' } },
    { type: 'LIQUIDATIONS', label: 'Liquidations', description: 'Live Binance Futures liquidation bubbles (red=longs, green=shorts)', group: 'Volatility', defaults: { period: 1, color: '#ef4444', threshold: 10000 } },
    { type: 'ABSORPTION', label: 'Iceberg / Absorption', description: 'Tags bars where heavy volume failed to move price (passive iceberg orders)', group: 'Smart Money', defaults: { period: 20, color: '#eab308', volMult: 2.5, maxBodyAtr: 0.35 } },
  ];

// Group presets
const PRESET_GROUPS = ['Smart Money', 'Trend', 'Momentum', 'Volatility'];

// ============================================================
// Stub alert form components (shown as collapsed sections)
// ============================================================

const QuickPriceAlert: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel-section rounded text-xs">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-2 py-1.5 text-left">
        <span className="font-medium flex items-center gap-1.5"><Bell size={10} className="text-primary" /> Price Alert</span>
        <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 text-muted-foreground text-[10px]">
          Draw a horizontal line on the chart, then right-click it to set a price alert.
        </div>
      )}
    </div>
  );
};

const IndicatorCrossAlertForm: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel-section rounded text-xs">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-2 py-1.5 text-left">
        <span className="font-medium flex items-center gap-1.5"><ArrowRightLeft size={10} className="text-primary" /> Indicator Cross Alert</span>
        <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 text-muted-foreground text-[10px]">
          Add two EMA or SMA indicators, then configure a cross alert here. (Cross alerting requires at least 2 overlay indicators.)
        </div>
      )}
    </div>
  );
};

const StochRSICrossAlertForm: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel-section rounded text-xs">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-2 py-1.5 text-left">
        <span className="font-medium flex items-center gap-1.5"><ArrowRightLeft size={10} className="text-accent-foreground" /> StochRSI K/D Cross</span>
        <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 text-muted-foreground text-[10px]">
          Add a StochRSI indicator first, then trigger an alert when K crosses D.
        </div>
      )}
    </div>
  );
};

const IndicatorThresholdAlertForm: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel-section rounded text-xs">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-2 py-1.5 text-left">
        <span className="font-medium flex items-center gap-1.5"><Bell size={10} className="text-accent-foreground" /> Threshold Alert</span>
        <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 text-muted-foreground text-[10px]">
          Alert when an indicator (RSI, ADX, etc.) crosses above or below a threshold value.
        </div>
      )}
    </div>
  );
};

const SMART_MONEY_CONDITIONS: { value: SmartMoneyAlertCondition; label: string; description: string }[] = [
  { value: 'fvg_bull_entry', label: 'Price enters Bull FVG', description: 'Fires when a candle touches an unmitigated bullish FVG zone' },
  { value: 'fvg_bear_entry', label: 'Price enters Bear FVG', description: 'Fires when a candle touches an unmitigated bearish FVG zone' },
  { value: 'supply_zone_entry', label: 'Price enters Supply Zone', description: 'Fires when a candle touches an active Supply zone' },
  { value: 'demand_zone_entry', label: 'Price enters Demand Zone', description: 'Fires when a candle touches an active Demand zone' },
  { value: 'bos_cross', label: 'BOS level crossed', description: 'Fires when price closes on the other side of a Break of Structure level' },
  { value: 'choch_cross', label: 'CHOCH level crossed', description: 'Fires when price closes on the other side of a Change of Character level' },
  { value: 'liquidity_sweep', label: 'Liquidity sweep detected', description: 'Fires when a candle wicks through a swing and closes back below/above it' },
];

const SmartMoneyAlertForm: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { symbol, timeframe, smartMoneyAlerts, addSmartMoneyAlert, removeSmartMoneyAlert } = useChartStore();
  const [condition, setCondition] = useState<SmartMoneyAlertCondition>('fvg_bull_entry');
  const [zoneIndex, setZoneIndex] = useState<'any' | 1 | 2 | 3>('any');
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);

  const handleAdd = () => {
    const alert: SmartMoneyAlert = {
      id: crypto.randomUUID(),
      symbol,
      timeframe,
      condition,
      zoneIndex,
      active: true,
      triggered: false,
      createdAt: Date.now(),
      telegramEnabled,
      whatsappEnabled,
    };

    addSmartMoneyAlert(alert);
  };

  const activeAlerts = (smartMoneyAlerts ?? []).filter((a) => a.active);

  return (
    <div className="panel-section rounded text-xs">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-2 py-1.5 text-left">
        <span className="font-medium flex items-center gap-1.5">
          <Zap size={10} className="text-yellow-400" /> Smart Money Alert
          {activeAlerts.length > 0 && (
            <span className="bg-yellow-400/15 text-yellow-400 text-[9px] px-1.5 py-0.5 rounded-full">{activeAlerts.length}</span>
          )}
        </span>
        <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Condition</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as SmartMoneyAlertCondition)}
              className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
            >
              {SMART_MONEY_CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p className="text-[9px] text-muted-foreground mt-1">
              {SMART_MONEY_CONDITIONS.find((c) => c.value === condition)?.description}
            </p>
          </div>

          {(condition === 'supply_zone_entry' || condition === 'demand_zone_entry') && (
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Target Zone</label>
              <select
                value={zoneIndex}
                onChange={(e) => {
                  const val = e.target.value;
                  setZoneIndex(val === 'any' ? 'any' : parseInt(val) as 1 | 2 | 3);
                }}
                className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
              >
                <option value="any">Any Active Zone</option>
                <option value="1">1st Closest</option>
                <option value="2">2nd Closest</option>
                <option value="3">3rd Closest</option>
              </select>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{symbol} · {timeframe}</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                <Send size={9} className={telegramEnabled ? 'text-primary' : 'text-muted-foreground'} />
                <input
                  type="checkbox"
                  checked={telegramEnabled}
                  onChange={(e) => setTelegramEnabled(e.target.checked)}
                  className="w-3 h-3 accent-primary"
                />
                TG
              </label>
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                <MessageSquare size={9} className={whatsappEnabled ? 'text-primary' : 'text-muted-foreground'} />
                <input
                  type="checkbox"
                  checked={whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                  className="w-3 h-3 accent-primary"
                />
                WA
              </label>
            </div>
          </div>

          <button
            onClick={handleAdd}
            className="w-full py-1.5 rounded bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors text-xs font-medium border border-yellow-500/20"
          >
            <Zap size={10} className="inline mr-1" />Add Alert
          </button>
          {activeAlerts.length > 0 && (
            <div className="space-y-1 mt-1">
              {activeAlerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between bg-accent/30 rounded px-2 py-1">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] text-foreground truncate">
                      {SMART_MONEY_CONDITIONS.find((c) => c.value === a.condition)?.label}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {a.symbol} · {a.timeframe} · {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    {a.triggered && (
                      <span className="text-[9px] text-yellow-400">✓ Fired</span>
                    )}
                    <button
                      onClick={() => {
                        useChartStore.getState().updateSmartMoneyAlert(a.id, { telegramEnabled: !(a.telegramEnabled ?? true) });
                      }}
                      className={`transition-colors ${(a.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`Telegram ${(a.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
                    >
                      <Send size={9} />
                    </button>
                    <button
                      onClick={() => {
                        useChartStore.getState().updateSmartMoneyAlert(a.id, { whatsappEnabled: !(a.whatsappEnabled ?? true) });
                      }}
                      className={`transition-colors ${(a.whatsappEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`WhatsApp ${(a.whatsappEnabled ?? true) ? 'ON' : 'OFF'}`}
                    >
                      <MessageSquare size={9} />
                    </button>

                    <button onClick={() => removeSmartMoneyAlert(a.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PCT_CROSS_PRESETS: {
  label: string;
  description: string;
  line1: PctDiffDonLine;
  line2: PctDiffDonLine;
  condition: AlertCondition;
  color: string;
}[] = [
    { label: 'Diff ✕ EMA — Bullish', description: '%Diff crosses above EMA (bullish momentum shift)', line1: 'main', line2: 'ema', condition: 'cross_above', color: 'text-green-400' },
    { label: 'Diff ✕ EMA — Bearish', description: '%Diff crosses below EMA (bearish momentum shift)', line1: 'main', line2: 'ema', condition: 'cross_below', color: 'text-red-400' },
    { label: 'Diff ✕ EMA — Any', description: '%Diff crosses EMA in either direction', line1: 'main', line2: 'ema', condition: 'cross_any', color: 'text-blue-400' },
    { label: 'Diff ↑ from Lower Don', description: '%Diff crosses above lower Donchian band (bottom reversal)', line1: 'main', line2: 'lower', condition: 'cross_above', color: 'text-green-400' },
    { label: 'Diff ↓ from Upper Don', description: '%Diff crosses below upper Donchian band (top reversal)', line1: 'main', line2: 'upper', condition: 'cross_below', color: 'text-red-400' },
    { label: 'Diff ✕ Basis — Any', description: '%Diff crosses the Donchian basis (midline)', line1: 'main', line2: 'basis', condition: 'cross_any', color: 'text-blue-400' },
    { label: 'EMA ↑ Lower Don', description: 'EMA crosses above lower Donchian (trend recovery)', line1: 'ema', line2: 'lower', condition: 'cross_above', color: 'text-green-400' },
    { label: 'EMA ↓ Upper Don', description: 'EMA crosses below upper Donchian (trend weakening)', line1: 'ema', line2: 'upper', condition: 'cross_below', color: 'text-red-400' },
  ];

const PctDiffDonCrossAlertForm: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [line1, setLine1] = useState<PctDiffDonLine>('main');
  const [line2, setLine2] = useState<PctDiffDonLine>('ema');
  const [condition, setCondition] = useState<AlertCondition>('cross_above');
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const indicators = useChartStore((s) => s.indicators);
  const addAlert = useChartStore((s) => s.addPctDiffDonCrossAlert);
  const activeAlerts = (useChartStore((s) => s.pctDiffDonCrossAlerts) ?? []).filter((a) => a.active && !a.triggered);

  const pctDiffIndicators = indicators.filter((i) => i.type === 'PCT_DIFF_DON');
  const [selectedIndId, setSelectedIndId] = useState('');

  const LINE_LABELS: Record<PctDiffDonLine, string> = {
    main: '%Diff', ema: 'EMA', basis: 'Basis', upper: 'Upper Don', lower: 'Lower Don', upperNew: 'Inner Upper', lowerNew: 'Inner Lower',
  };

  const handleAdd = (l1: PctDiffDonLine, l2: PctDiffDonLine, cond: AlertCondition) => {
    const indId = selectedIndId || pctDiffIndicators[0]?.id;
    if (!indId) return;
    const condLabel = cond === 'cross_above' ? 'crosses above' : cond === 'cross_below' ? 'crosses below' : 'crosses';
    addAlert({
      id: crypto.randomUUID(),
      symbol,
      timeframe,
      indicatorId: indId,
      line1: l1,
      line2: l2,
      condition: cond,
      active: true,
      triggered: false,
      message: `${LINE_LABELS[l1]} ${condLabel} ${LINE_LABELS[l2]}`,
      createdAt: Date.now(),
      telegramEnabled,
      whatsappEnabled,
    });
  };

  return (
    <div className="panel-section rounded text-xs">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-2 py-1.5 text-left">
        <span className="font-medium flex items-center gap-1.5">
          <ArrowRightLeft size={10} className="text-cyan-400" /> %Diff Donchian Cross
          {activeAlerts.length > 0 && (
            <span className="bg-cyan-400/15 text-cyan-400 text-[9px] px-1.5 py-0.5 rounded-full">{activeAlerts.length}</span>
          )}
        </span>
        <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-2">
          {pctDiffIndicators.length === 0 ? (
            <div className="text-muted-foreground text-[10px]">Add a PctDiff Don indicator first.</div>
          ) : (
            <>
              {pctDiffIndicators.length > 1 && (
                <select value={selectedIndId || pctDiffIndicators[0]?.id} onChange={(e) => setSelectedIndId(e.target.value)}
                  className="w-full bg-input border border-border rounded px-1.5 py-1 text-[10px] text-foreground">
                  {pctDiffIndicators.map((ind) => (
                    <option key={ind.id} value={ind.id}>%Diff({ind.period},{ind.lookbackWindow ?? 10})</option>
                  ))}
                </select>
              )}

              {/* Mode toggle */}
              <div className="flex rounded overflow-hidden border border-border">
                <button onClick={() => setMode('preset')}
                  className={`flex-1 py-1 text-[10px] transition-colors ${mode === 'preset' ? 'bg-cyan-500/20 text-cyan-400' : 'text-muted-foreground hover:text-foreground'}`}>
                  Quick Presets
                </button>
                <button onClick={() => setMode('custom')}
                  className={`flex-1 py-1 text-[10px] transition-colors ${mode === 'custom' ? 'bg-cyan-500/20 text-cyan-400' : 'text-muted-foreground hover:text-foreground'}`}>
                  Custom
                </button>
              </div>

              {mode === 'preset' ? (
                <div className="space-y-1">
                  {PCT_CROSS_PRESETS.map((preset, idx) => (
                    <button key={idx} onClick={() => handleAdd(preset.line1, preset.line2, preset.condition)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-accent/60 transition-colors group">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-medium ${preset.color}`}>{preset.label}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{preset.description}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <div className="flex-1">
                      <label className="text-[9px] text-muted-foreground block mb-0.5">Line 1</label>
                      <select value={line1} onChange={(e) => setLine1(e.target.value as PctDiffDonLine)}
                        className="w-full bg-input border border-border rounded px-1.5 py-1 text-[10px] text-foreground">
                        {(Object.keys(LINE_LABELS) as PctDiffDonLine[]).map((l) => (
                          <option key={l} value={l}>{LINE_LABELS[l]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] text-muted-foreground block mb-0.5">Line 2</label>
                      <select value={line2} onChange={(e) => setLine2(e.target.value as PctDiffDonLine)}
                        className="w-full bg-input border border-border rounded px-1.5 py-1 text-[10px] text-foreground">
                        {(Object.keys(LINE_LABELS) as PctDiffDonLine[]).filter(l => l !== line1).map((l) => (
                          <option key={l} value={l}>{LINE_LABELS[l]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground block mb-0.5">Condition</label>
                    <select value={condition} onChange={(e) => setCondition(e.target.value as AlertCondition)}
                      className="w-full bg-input border border-border rounded px-1.5 py-1 text-[10px] text-foreground">
                      <option value="cross_above">Crosses Above ↑</option>
                      <option value="cross_below">Crosses Below ↓</option>
                      <option value="cross_any">Crosses Either ↕</option>
                    </select>
                  </div>
                  <button onClick={() => handleAdd(line1, line2, condition)}
                    className="w-full py-1.5 rounded bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 transition-colors text-[10px] font-medium border border-cyan-500/20">
                    <Plus size={10} className="inline mr-1" />Add {LINE_LABELS[line1]} ✕ {LINE_LABELS[line2]} Alert
                  </button>
                </div>
              )}

              {/* Notification toggles */}
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <span className="text-[9px] text-muted-foreground">{symbol} · {timeframe}</span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                    <Send size={9} className={telegramEnabled ? 'text-primary' : 'text-muted-foreground'} />
                    <input type="checkbox" checked={telegramEnabled} onChange={(e) => setTelegramEnabled(e.target.checked)} className="w-3 h-3 accent-primary" />
                    TG
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                    <MessageSquare size={9} className={whatsappEnabled ? 'text-primary' : 'text-muted-foreground'} />
                    <input type="checkbox" checked={whatsappEnabled} onChange={(e) => setWhatsappEnabled(e.target.checked)} className="w-3 h-3 accent-primary" />
                    WA
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const STRATEGY_LABELS: Record<PctDiffStrategy, string> = {
  fail_first: 'Fail First',
  squeeze_breakout: 'Squeeze Breakout',
  momentum_divergence: 'Momentum Divergence',
  regime_mean_reversion: 'Regime Mean Reversion',
  inner_band_warning: 'Inner Band Warning',
};

const STRATEGY_DESCRIPTIONS: Record<PctDiffStrategy, string> = {
  fail_first: 'Pullback fails near zero, trend resumes',
  squeeze_breakout: 'Narrow Donchian channel breaks out',
  momentum_divergence: 'Price vs %Diff divergence detected',
  regime_mean_reversion: 'Zero-line regime + band touch signal',
  inner_band_warning: 'Inner band early entry / profit / stop',
};

const PctDiffStrategyAlertForm: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [strategy, setStrategy] = useState<PctDiffStrategy>('fail_first');
  const [direction, setDirection] = useState<'long' | 'short' | 'both'>('both');
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const indicators = useChartStore((s) => s.indicators);
  const addAlert = useChartStore((s) => s.addPctDiffStrategyAlert);

  const pctDiffIndicators = indicators.filter((i) => i.type === 'PCT_DIFF_DON');
  const [selectedIndId, setSelectedIndId] = useState('');

  const handleAdd = () => {
    const indId = selectedIndId || pctDiffIndicators[0]?.id;
    if (!indId) return;
    addAlert({
      id: crypto.randomUUID(),
      symbol,
      timeframe,
      indicatorId: indId,
      strategy,
      direction,
      active: true,
      triggered: false,
      createdAt: Date.now(),
      telegramEnabled: true,
      whatsappEnabled: true,
    });
  };

  return (
    <div className="panel-section rounded text-xs">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-2 py-1.5 text-left">
        <span className="font-medium flex items-center gap-1.5"><Zap size={10} className="text-yellow-400" /> %Diff Strategy Alerts</span>
        <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-2">
          {pctDiffIndicators.length === 0 ? (
            <div className="text-muted-foreground text-[10px]">Add a PctDiff Don indicator first.</div>
          ) : (
            <>
              {pctDiffIndicators.length > 1 && (
                <select value={selectedIndId || pctDiffIndicators[0]?.id} onChange={(e) => setSelectedIndId(e.target.value)}
                  className="w-full bg-background border border-border rounded px-1.5 py-1 text-[10px]">
                  {pctDiffIndicators.map((ind) => (
                    <option key={ind.id} value={ind.id}>%Diff({ind.period},{ind.lookbackWindow ?? 10})</option>
                  ))}
                </select>
              )}
              <select value={strategy} onChange={(e) => setStrategy(e.target.value as PctDiffStrategy)}
                className="w-full bg-background border border-border rounded px-1.5 py-1 text-[10px]">
                {(Object.keys(STRATEGY_LABELS) as PctDiffStrategy[]).map((s) => (
                  <option key={s} value={s}>{STRATEGY_LABELS[s]}</option>
                ))}
              </select>
              <div className="text-muted-foreground text-[10px] leading-tight">{STRATEGY_DESCRIPTIONS[strategy]}</div>
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-muted-foreground">Direction:</label>
                <select value={direction} onChange={(e) => setDirection(e.target.value as 'long' | 'short' | 'both')}
                  className="flex-1 bg-background border border-border rounded px-1.5 py-1 text-[10px]">
                  <option value="both">Both</option>
                  <option value="long">Long Only</option>
                  <option value="short">Short Only</option>
                </select>
              </div>
              <button onClick={handleAdd} className="w-full bg-primary text-primary-foreground rounded py-1 text-[10px] hover:bg-primary/90 flex items-center justify-center gap-1">
                <Plus size={10} /> Add {STRATEGY_LABELS[strategy]} Alert
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Sync controls
// ============================================================

const SyncControls: React.FC = () => {
  const status = useChartStore(s => s.syncStatus);
  const setStatus = useChartStore(s => s.setSyncStatus);
  const lastResult = useChartStore(s => s.lastSyncResult);
  const setLastResult = useChartStore(s => s.setLastSyncResult);
  const [syncing, setSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem('auto-sync') !== 'false');

  const handlePush = async () => {
    setSyncing(true);
    setLastResult(null);
    const payload = extractSyncPayload(useChartStore.getState(), useTrackerStore.getState());
    const ok = await pushState(payload);

    setLastResult(ok ? 'Pushed to server ✓' : 'Push failed ✗');
    setSyncing(false);
  };

  const handlePull = async () => {
    setSyncing(true);
    setLastResult(null);
    const data = await pullState();
    if (data) {
      const store = useChartStore.getState();
      if (data.state) {
        store.setSymbol(data.state.symbol);
        store.setTimeframe(data.state.timeframe as Timeframe);
        store.setMarketType(data.state.marketType as MarketType);
        store.setChartFontSize(data.state.chartFontSize);
        if (data.state.drawingDefaults) {
          for (const [key, val] of Object.entries(data.state.drawingDefaults)) {
            store.setDrawingDefault(key as 'trendline' | 'horizontal' | 'alertLine', val as { color: string; thickness: number; lineStyle: LineStyleType });
          }
        }
      }
      useChartStore.setState({
        trendlines: data.trendlines,
        indicators: data.indicators,
        alerts: data.alerts,
        alertLogs: data.alertLogs,
        fibonacciDrawings: data.fibonacciDrawings,
        riskRewardDrawings: data.riskRewardDrawings || [],
        indicatorCrossAlerts: data.indicatorCrossAlerts,
        indicatorThresholdAlerts: data.indicatorThresholdAlerts,
        stochRSICrossAlerts: data.stochRSICrossAlerts,
        pctDiffDonCrossAlerts: data.pctDiffDonCrossAlerts,
        layouts: data.layouts,
      });
      setLastResult('Pulled from server ✓');
    } else {
      setLastResult('Pull failed ✗');
    }
    setSyncing(false);
  };

  const handleCheckHealth = async () => {
    setStatus('checking');
    const ok = await checkSyncHealth();
    setStatus(ok ? 'online' : 'offline');
  };

  useEffect(() => {
    localStorage.setItem('auto-sync', String(autoSync));
  }, [autoSync]);

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <button onClick={handleCheckHealth} className="flex items-center gap-1 text-xs text-primary hover:opacity-80 transition-opacity">
          {status === 'checking' ? <RefreshCw size={10} className="animate-spin" /> : status === 'online' ? <Cloud size={10} /> : <CloudOff size={10} />}
          {status === 'idle' ? 'Check' : status === 'checking' ? 'Checking...' : status === 'online' ? 'Online' : 'Offline'}
        </button>
        <div className="flex items-center gap-1.5">
          <label className="text-muted-foreground text-[10px]">Auto-sync</label>
          <button
            onClick={() => setAutoSync(!autoSync)}
            className={`w-8 h-4 rounded-full transition-colors relative ${autoSync ? 'bg-primary' : 'bg-accent'}`}
          >
            <div className={`w-3 h-3 rounded-full bg-foreground absolute top-0.5 transition-all ${autoSync ? 'left-4' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handlePush}
          disabled={syncing}
          className="flex-1 text-xs py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {syncing ? '...' : '↑ Push to Server'}
        </button>
        <button
          onClick={handlePull}
          disabled={syncing}
          className="flex-1 text-xs py-1.5 rounded bg-accent text-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {syncing ? '...' : '↓ Pull from Server'}
        </button>
      </div>
      {lastResult && <p className={`text-[10px] ${lastResult.includes('✓') ? 'text-bull' : 'text-bear'}`}>{lastResult}</p>}
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Sync trendlines, alerts, indicators & settings to your local server for cross-device access.
      </p>
    </div>
  );
};

// ============================================================
// Telegram settings panel
// ============================================================
const TelegramSettings: React.FC = () => {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const creds = getTelegramCredentials();
    if (creds) { setBotToken(creds.botToken); setChatId(creds.chatId); }
  }, []);

  const handleSave = () => {
    saveTelegramCredentials({ botToken, chatId, enabled: true });
    setResult('Saved ✓');
    setTimeout(() => setResult(null), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    saveTelegramCredentials({ botToken, chatId, enabled: true });
    const ok = await testTelegramNotification();
    setResult(ok ? 'Test sent ✓' : 'Failed ✗');
    setTesting(false);
  };

  return (
    <div className="space-y-2 text-xs">
      <p className="text-muted-foreground text-[10px]">Configure Telegram for alert notifications.</p>
      <input
        type="text"
        placeholder="Bot Token"
        value={botToken}
        onChange={(e) => setBotToken(e.target.value)}
        className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
      />
      <input
        type="text"
        placeholder="Chat ID"
        value={chatId}
        onChange={(e) => setChatId(e.target.value)}
        className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
      />
      <div className="flex gap-2">
        <button onClick={handleSave} className="flex-1 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:opacity-90">
          Save
        </button>
        <button onClick={handleTest} disabled={testing} className="flex-1 py-1.5 rounded bg-accent text-foreground text-xs hover:opacity-90 disabled:opacity-50">
          {testing ? '...' : 'Test'}
        </button>
      </div>
      {result && <p className={`text-[10px] ${result.includes('✓') ? 'text-bull' : 'text-bear'}`}>{result}</p>}
    </div>
  );
};

// ============================================================
// WhatsApp settings panel
// ============================================================
const WhatsAppSettings: React.FC = () => {

  const [provider, setProvider] = useState<WhatsAppProvider>('callmebot');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [greenId, setGreenId] = useState('');
  const [greenToken, setGreenToken] = useState('');
  const [ntfyTopic, setNtfyTopic] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const creds = getWhatsAppCredentials();
    if (creds) {
      setProvider(creds.provider || 'callmebot');
      setPhoneNumber(creds.phoneNumber || '');
      setApiKey(creds.apiKey || '');
      setGreenId(creds.greenApiIdInstance || '');
      setGreenToken(creds.greenApiTokenInstance || '');
      setNtfyTopic(creds.ntfyTopic || '');
    }
  }, []);

  const handleSave = () => {
    saveWhatsAppCredentials({
      provider,
      phoneNumber,
      apiKey,
      greenApiIdInstance: greenId,
      greenApiTokenInstance: greenToken,
      ntfyTopic,
      enabled: true
    });
    setResult('Saved ✓');
    setTimeout(() => setResult(null), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    saveWhatsAppCredentials({
      provider,
      phoneNumber,
      apiKey,
      greenApiIdInstance: greenId,
      greenApiTokenInstance: greenToken,
      ntfyTopic,
      enabled: true
    });
    const ok = await testWhatsAppNotification();
    setResult(ok ? 'Test sent ✓' : 'Failed ✗');
    setTesting(false);
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground">Provider</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as WhatsAppProvider)}
          className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
        >
          <option value="callmebot">CallMeBot (WhatsApp)</option>
          <option value="greenapi">Green API (WhatsApp - Free Dev)</option>
          <option value="whin">Whin (WhatsApp - RapidAPI)</option>
          <option value="ntfy">Ntfy.sh (Fast / No-Signup / Push)</option>
        </select>
      </div>

      {provider === 'callmebot' && (
        <>
          <p className="text-[9px] text-muted-foreground italic">Easiest but can be unstable. Get key from callmebot.com.</p>
          <input
            type="text"
            placeholder="Phone Number (e.g. +91...)"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
          />
          <input
            type="text"
            placeholder="API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
          />
        </>
      )}

      {provider === 'greenapi' && (
        <>
          <p className="text-[9px] text-muted-foreground italic">Very stable. Scan QR on green-api.com console.</p>
          <input
            type="text"
            placeholder="ID Instance (e.g. 1101...)"
            value={greenId}
            onChange={(e) => setGreenId(e.target.value)}
            className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
          />
          <input
            type="text"
            placeholder="API Token"
            value={greenToken}
            onChange={(e) => setGreenToken(e.target.value)}
            className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
          />
          <input
            type="text"
            placeholder="Recipient Phone (+91...)"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
          />
        </>
      )}

      {provider === 'whin' && (
        <>
          <p className="text-[9px] text-muted-foreground italic">RapidAPI based. Register on whin.dev.</p>
          <input
            type="text"
            placeholder="RapidAPI Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
          />
        </>
      )}

      {provider === 'ntfy' && (
        <>
          <p className="text-[9px] text-muted-foreground italic">Push notifications. Just pick a unique topic name.</p>
          <input
            type="text"
            placeholder="Topic Name (e.g. my_trading_alerts_99)"
            value={ntfyTopic}
            onChange={(e) => setNtfyTopic(e.target.value)}
            className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
          />
          <p className="text-[9px] text-muted-foreground leading-tight">
            Download Ntfy app or visit ntfy.sh/{ntfyTopic} in browser.
          </p>
        </>
      )}

      <div className="flex gap-2">
        <button onClick={handleSave} className="flex-1 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:opacity-90">
          Save
        </button>
        <button onClick={handleTest} disabled={testing} className="flex-1 py-1.5 rounded bg-accent text-foreground text-xs hover:opacity-90 disabled:opacity-50">
          {testing ? '...' : 'Test'}
        </button>
      </div>
      {result && <p className={`text-[10px] ${result.includes('✓') ? 'text-bull' : 'text-bear'}`}>{result}</p>}
    </div>
  );
};


// ============================================================
// AI Sidekick settings panel
// ============================================================
const AISidekickSettings: React.FC = () => {
  const provider = useChartStore(s => s.aiProvider);
  const setProvider = useChartStore(s => s.setAiProvider);
  const apiKey = useChartStore(s => s.aiApiKey);
  const setApiKey = useChartStore(s => s.setAiApiKey);
  const model = useChartStore(s => s.aiModel);
  const setModel = useChartStore(s => s.setAiModel);
  const baseUrl = useChartStore(s => s.aiBaseUrl);
  const setBaseUrl = useChartStore(s => s.setAiBaseUrl);

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground">Provider</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as 'openai' | 'google' | 'anthropic')}
          className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
        >
          <option value="openai">OpenAI (Default)</option>
          <option value="google">Google (Gemini)</option>
          <option value="anthropic">Anthropic (Claude)</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground">API Key</label>
        <input
          type="password"
          placeholder="Leave empty for server default"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground">Custom Model Name</label>
        <input
          type="text"
          placeholder="e.g. gpt-4o, gemini-1.5-pro"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
        />
        <p className="text-[9px] text-muted-foreground">If empty, server default will be used.</p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground">Custom Base URL (Proxy)</label>
        <input
          type="text"
          placeholder="e.g. https://openrouter.ai/api/v1"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
        />
      </div>
    </div>
  );
};


// ============================================================
// Main RightSidebar
// ============================================================
export const RightSidebar: React.FC = () => {
  const {
    rightPanelOpen,
    rightPanelTab,
    setRightPanelOpen,
    setRightPanelTab,
    alerts,
    alertLogs,
    removeAlert,
    clearAllAlerts,
    indicators,
    addIndicator,
    removeIndicator,
    toggleIndicator,
    updateIndicator,
    clearAllIndicators,
    trendlines,
    fibonacciDrawings,
    clearAllDrawings,
    indicatorCrossAlerts,
    removeIndicatorCrossAlert,
    indicatorThresholdAlerts,
    removeIndicatorThresholdAlert,
    stochRSICrossAlerts,
    removeStochRSICrossAlert,
    pctDiffDonCrossAlerts,
    removePctDiffDonCrossAlert,
    pctDiffStrategyAlerts,
    removePctDiffStrategyAlert,
    chartFontSize,
    setChartFontSize,
    timezone,
    setTimezone,
    smartMoneyAlerts,
    compoundAlerts,
    rectangleAlerts,
    removeRectangleAlert,
    aiProvider,
    setAiProvider,
    aiApiKey,
    setAiApiKey,
    aiModel,
    setAiModel,
    aiBaseUrl,
    setAiBaseUrl,
  // useShallow: only re-render when these specific fields change
  // (prevents re-renders from candle ticks, crosshair moves, playback, etc.)
  } = useChartStore(useShallow((s) => ({
    rightPanelOpen: s.rightPanelOpen,
    rightPanelTab: s.rightPanelTab,
    setRightPanelOpen: s.setRightPanelOpen,
    setRightPanelTab: s.setRightPanelTab,
    alerts: s.alerts,
    alertLogs: s.alertLogs,
    removeAlert: s.removeAlert,
    clearAllAlerts: s.clearAllAlerts,
    indicators: s.indicators,
    addIndicator: s.addIndicator,
    removeIndicator: s.removeIndicator,
    toggleIndicator: s.toggleIndicator,
    updateIndicator: s.updateIndicator,
    clearAllIndicators: s.clearAllIndicators,
    trendlines: s.trendlines,
    fibonacciDrawings: s.fibonacciDrawings,
    clearAllDrawings: s.clearAllDrawings,
    indicatorCrossAlerts: s.indicatorCrossAlerts,
    removeIndicatorCrossAlert: s.removeIndicatorCrossAlert,
    indicatorThresholdAlerts: s.indicatorThresholdAlerts,
    removeIndicatorThresholdAlert: s.removeIndicatorThresholdAlert,
    stochRSICrossAlerts: s.stochRSICrossAlerts,
    removeStochRSICrossAlert: s.removeStochRSICrossAlert,
    pctDiffDonCrossAlerts: s.pctDiffDonCrossAlerts,
    removePctDiffDonCrossAlert: s.removePctDiffDonCrossAlert,
    pctDiffStrategyAlerts: s.pctDiffStrategyAlerts,
    removePctDiffStrategyAlert: s.removePctDiffStrategyAlert,
    chartFontSize: s.chartFontSize,
    setChartFontSize: s.setChartFontSize,
    timezone: s.timezone,
    setTimezone: s.setTimezone,
    smartMoneyAlerts: s.smartMoneyAlerts,
    compoundAlerts: s.compoundAlerts,
    rectangleAlerts: s.rectangleAlerts,
    removeRectangleAlert: s.removeRectangleAlert,
    aiProvider: s.aiProvider,
    setAiProvider: s.setAiProvider,
    aiApiKey: s.aiApiKey,
    setAiApiKey: s.setAiApiKey,
    aiModel: s.aiModel,
    setAiModel: s.setAiModel,
    aiBaseUrl: s.aiBaseUrl,
    setAiBaseUrl: s.setAiBaseUrl,
  })));

  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [expandedSettingsId, setExpandedSettingsId] = useState<string | null>(null);

  const handleHardReset = () => {
    if (window.confirm('Are you sure? This will wipe ALL indicators, layouts, drawings, and settings. This cannot be undone.')) {
      localStorage.clear();
      sessionStorage.clear();
      // Hard redirect to clear any in-memory state
      window.location.href = window.location.origin;
    }
  };

  if (!rightPanelOpen) return null;

  const handleAddIndicator = (preset: typeof INDICATOR_PRESETS[number]) => {
    const id = `${preset.type.toLowerCase()}-${Date.now()}`;
    addIndicator({
      id,
      type: preset.type,
      period: preset.defaults.period ?? 14,
      color: preset.defaults.color ?? '#2962FF',
      visible: true,
      kPeriod: preset.defaults.kPeriod,
      dPeriod: preset.defaults.dPeriod,
      color2: preset.defaults.color2,
      stdDev: preset.defaults.stdDev,
      multiplier: preset.defaults.multiplier,
      lookbackWindow: preset.defaults.lookbackWindow,
      emaSmoothing: preset.defaults.emaSmoothing,
      donchianLength: preset.defaults.donchianLength,
      donLineDiff: preset.defaults.donLineDiff,
      zigzagLength: preset.defaults.zigzagLength,
      fibFactor: preset.defaults.fibFactor,
      threshold: preset.defaults.threshold,
      minStack: preset.defaults.minStack,
      volMult: (preset.defaults as any).volMult,
      maxBodyAtr: (preset.defaults as any).maxBodyAtr,
    });
    setShowAdd(false);
    setSearchQuery('');
  };

  const filteredPresets = INDICATOR_PRESETS.filter((p) => {
    const matchesSearch = !searchQuery || p.label.toLowerCase().includes(searchQuery.toLowerCase()) || p.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGroup = !selectedGroup || p.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  const tabs = [
    { id: 'indicators', icon: <TrendingUp size={12} />, title: 'Indicators' },
    { id: 'alerts', icon: <Bell size={12} />, title: 'Alerts' },
    { id: 'trades', icon: <BookOpen size={12} />, title: 'Trades' },
    { id: 'settings', icon: <Settings size={12} />, title: 'Settings' },
    { id: 'guide', icon: <HelpCircle size={12} />, title: 'Guide' },
  ];

  return (
    <div className="bg-card border-l border-border flex flex-col h-full w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-panel-header shrink-0">
        <div className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setRightPanelTab(t.id as any)}
              className={`p-1.5 rounded transition-colors ${rightPanelTab === t.id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              title={t.id.charAt(0).toUpperCase() + t.id.slice(1)}
            >
              {t.icon}
            </button>
          ))}
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
            {rightPanelTab}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => useChartStore.getState().setHideAllDrawings(!useChartStore.getState().hideAllDrawings)}
            className={`p-1 flex items-center gap-1 rounded transition-colors ${useChartStore.getState().hideAllDrawings ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
            title={useChartStore.getState().hideAllDrawings ? "Show All Drawings" : "Hide All Drawings"}
          >
            <PenTool size={12} />
            {useChartStore.getState().hideAllDrawings ? <EyeOff size={10} /> : <Eye size={10} />}
          </button>

          <button
            onClick={() => useChartStore.getState().setHideAllIndicators(!useChartStore.getState().hideAllIndicators)}
            className={`p-1 flex items-center gap-1 rounded transition-colors ${useChartStore.getState().hideAllIndicators ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
            title={useChartStore.getState().hideAllIndicators ? "Show All Indicators" : "Hide All Indicators"}
          >
            <TrendingUp size={12} />
            {useChartStore.getState().hideAllIndicators ? <EyeOff size={10} /> : <Eye size={10} />}
          </button>

          <button onClick={() => setRightPanelOpen(false)} className="text-muted-foreground hover:text-foreground ml-2">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">

        {/* ---- INDICATORS TAB ---- */}
        {rightPanelTab === 'indicators' && (
          <div className="space-y-2">
            {/* Active indicators list */}
            {indicators.length === 0 && !showAdd && (
              <p className="text-xs text-muted-foreground text-center py-4">No indicators added yet.</p>
            )}
            {indicators.map((ind) => (
              <div key={ind.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: ind.color }}
                    />
                    <span className="text-foreground font-medium truncate">{INDICATOR_PRESETS.find(p => p.type === ind.type)?.label ?? ind.type}</span>
                    {ind.period > 1 && <span className="text-muted-foreground shrink-0">({ind.period})</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(ind.type === 'FVG' || ind.type === 'MARKET_STRUCTURE' || ind.type === 'PATTERN' || ind.type === 'ANCHORED_VWAP' || ind.type === 'SESSION_VWAP' || ind.type === 'SUPPLY_DEMAND' || ind.type === 'PCT_DIFF_DON') && (
                      <button
                        onClick={() => setExpandedSettingsId(expandedSettingsId === ind.id ? null : ind.id)}
                        className={`p-0.5 transition-colors ${expandedSettingsId === ind.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                        title="Settings"
                      >
                        <Settings size={11} />
                      </button>
                    )}
                    <button onClick={() => toggleIndicator(ind.id)} className="text-muted-foreground hover:text-foreground p-0.5" title={ind.visible ? 'Hide' : 'Show'}>
                      {ind.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                    </button>
                    <button onClick={() => removeIndicator(ind.id)} className="text-muted-foreground hover:text-destructive p-0.5">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
                {/* Smart Money indicator badges */}
                {(ind.type === 'FVG' || ind.type === 'MARKET_STRUCTURE' || ind.type === 'MSB_OB' || ind.type === 'PATTERN' || ind.type === 'ANCHORED_VWAP' || ind.type === 'SESSION_VWAP' || ind.type === 'SUPPLY_DEMAND') && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {ind.type === 'FVG' && (
                      <>
                        <span className="bg-bull/10 text-bull text-[9px] px-1.5 py-0.5 rounded">Bullish FVG</span>
                        <span className="bg-bear/10 text-bear text-[9px] px-1.5 py-0.5 rounded">Bearish FVG</span>
                        <span className="text-[9px] text-muted-foreground">min gap {ind.threshold ?? 0.1}×ATR</span>
                      </>
                    )}
                    {ind.type === 'MARKET_STRUCTURE' && (
                      <>
                        <span className="bg-bull/10 text-bull text-[9px] px-1.5 py-0.5 rounded">BOS</span>
                        <span className="bg-[rgba(168,85,247,0.12)] text-purple-400 text-[9px] px-1.5 py-0.5 rounded">CHOCH</span>
                        {(ind.showSweeps ?? true) && <span className="bg-orange-500/10 text-orange-400 text-[9px] px-1.5 py-0.5 rounded">⚡ Sweeps</span>}
                        <span className="text-[9px] text-muted-foreground">swing len {ind.period}</span>
                      </>
                    )}
                    {ind.type === 'MSB_OB' && (
                      <>
                        <span className="bg-bull/10 text-bull text-[9px] px-1.5 py-0.5 rounded">Bu-OB</span>
                        <span className="bg-bear/10 text-bear text-[9px] px-1.5 py-0.5 rounded">Be-OB</span>
                        <span className="text-[9px] text-muted-foreground">zz {ind.zigzagLength}</span>
                      </>
                    )}
                    {ind.type === 'PATTERN' && (
                      <>
                        <span className="bg-yellow-500/10 text-yellow-400 text-[9px] px-1.5 py-0.5 rounded">Triangles</span>
                        <span className="bg-yellow-500/10 text-yellow-400 text-[9px] px-1.5 py-0.5 rounded">Wedges</span>
                        <span className="bg-yellow-500/10 text-yellow-400 text-[9px] px-1.5 py-0.5 rounded">Channels</span>
                        <span className="text-[9px] text-muted-foreground">pivot {ind.pivotLen ?? ind.period ?? 5}</span>
                      </>
                    )}
                    {ind.type === 'ANCHORED_VWAP' && (
                      <>
                        <span className="bg-purple-500/10 text-purple-400 text-[9px] px-1.5 py-0.5 rounded">⚓ AVWAP</span>
                        {(ind.showBands ?? true) && <span className="bg-purple-500/10 text-purple-400 text-[9px] px-1.5 py-0.5 rounded">±1σ ±2σ</span>}
                      </>
                    )}
                    {ind.type === 'SESSION_VWAP' && (
                      <>
                        <span className="bg-amber-500/10 text-amber-400 text-[9px] px-1.5 py-0.5 rounded">Daily Reset</span>
                        {(ind.showBands ?? true) && <span className="bg-amber-500/10 text-amber-400 text-[9px] px-1.5 py-0.5 rounded">±1σ ±2σ</span>}
                      </>
                    )}
                    {ind.type === 'SUPPLY_DEMAND' && (
                      <>
                        <span className="bg-bear/10 text-bear text-[9px] px-1.5 py-0.5 rounded">Supply</span>
                        <span className="bg-bull/10 text-bull text-[9px] px-1.5 py-0.5 rounded">Demand</span>
                        <span className="text-[9px] text-muted-foreground">str ≥{(ind.sdStrength ?? 0.4).toFixed(1)}</span>
                      </>
                    )}
                  </div>
                )}
                {/* Inline settings panel for FVG */}
                {ind.type === 'FVG' && expandedSettingsId === ind.id && (
                  <div className="mt-2 pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Min Gap (ATR×)</label>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateIndicator(ind.id, { threshold: Math.max(0.01, Number(((ind.threshold ?? 0.1) - 0.05).toFixed(2))) })}
                          className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center"
                        >−</button>
                        <span className="w-8 text-center text-[11px] tabular-nums">{(ind.threshold ?? 0.1).toFixed(2)}</span>
                        <button
                          onClick={() => updateIndicator(ind.id, { threshold: Number(((ind.threshold ?? 0.1) + 0.05).toFixed(2)) })}
                          className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center"
                        >+</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Show Mitigated Zones</label>
                      <button
                        onClick={() => updateIndicator(ind.id, { showMitigated: !(ind.showMitigated ?? false) })}
                        className={`w-8 h-4 rounded-full transition-colors relative ${(ind.showMitigated ?? false) ? 'bg-primary' : 'bg-accent'}`}
                      >
                        <div className={`w-3 h-3 rounded-full bg-foreground absolute top-0.5 transition-all ${(ind.showMitigated ?? false) ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>
                )}
                {/* Inline settings panel for PCT_DIFF_DON */}
                {ind.type === 'PCT_DIFF_DON' && expandedSettingsId === ind.id && (
                  <div className="mt-2 pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Timeframe</label>
                      <select
                        value={ind.timeframe ?? ''}
                        onChange={(e) => updateIndicator(ind.id, { timeframe: (e.target.value || undefined) as Timeframe | undefined })}
                        className="bg-accent text-foreground text-[10px] rounded px-1.5 py-0.5 border border-border"
                      >
                        <option value="">Chart TF</option>
                        {(['1m', '3m', '5m', '15m', '1h', '4h', '1D', '1W'] as Timeframe[]).map(tf => (
                          <option key={tf} value={tf}>{tf}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Period</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateIndicator(ind.id, { period: Math.max(2, (ind.period ?? 20) - 1) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">−</button>
                        <span className="w-8 text-center text-[11px] tabular-nums">{ind.period ?? 20}</span>
                        <button onClick={() => updateIndicator(ind.id, { period: (ind.period ?? 20) + 1 })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">+</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Lookback</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateIndicator(ind.id, { lookbackWindow: Math.max(2, (ind.lookbackWindow ?? 50) - 1) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">−</button>
                        <span className="w-8 text-center text-[11px] tabular-nums">{ind.lookbackWindow ?? 50}</span>
                        <button onClick={() => updateIndicator(ind.id, { lookbackWindow: (ind.lookbackWindow ?? 50) + 1 })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">+</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">EMA Smoothing</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateIndicator(ind.id, { emaSmoothing: Math.max(1, (ind.emaSmoothing ?? 9) - 1) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">−</button>
                        <span className="w-8 text-center text-[11px] tabular-nums">{ind.emaSmoothing ?? 9}</span>
                        <button onClick={() => updateIndicator(ind.id, { emaSmoothing: (ind.emaSmoothing ?? 9) + 1 })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">+</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Donchian Length</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateIndicator(ind.id, { donchianLength: Math.max(2, (ind.donchianLength ?? 20) - 1) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">−</button>
                        <span className="w-8 text-center text-[11px] tabular-nums">{ind.donchianLength ?? 20}</span>
                        <button onClick={() => updateIndicator(ind.id, { donchianLength: (ind.donchianLength ?? 20) + 1 })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">+</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Don Line Diff</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateIndicator(ind.id, { donLineDiff: Math.max(0.01, Number(((ind.donLineDiff ?? 0.1) - 0.05).toFixed(2))) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">−</button>
                        <span className="w-10 text-center text-[11px] tabular-nums">{(ind.donLineDiff ?? 0.1).toFixed(2)}</span>
                        <button onClick={() => updateIndicator(ind.id, { donLineDiff: Number(((ind.donLineDiff ?? 0.1) + 0.05).toFixed(2)) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">+</button>
                      </div>
                    </div>
                  </div>
                )}
                {/* Inline settings panel for MARKET_STRUCTURE */}
                {ind.type === 'MARKET_STRUCTURE' && expandedSettingsId === ind.id && (
                  <div className="mt-2 pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Swing Length</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateIndicator(ind.id, { period: Math.max(2, (ind.period ?? 5) - 1) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">−</button>
                        <span className="w-6 text-center text-[11px] tabular-nums">{ind.period ?? 5}</span>
                        <button onClick={() => updateIndicator(ind.id, { period: (ind.period ?? 5) + 1 })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">+</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Show Sweeps</label>
                      <button onClick={() => updateIndicator(ind.id, { showSweeps: !(ind.showSweeps ?? true) })} className={`w-8 h-4 rounded-full transition-colors relative ${(ind.showSweeps ?? true) ? 'bg-primary' : 'bg-accent'}`}>
                        <div className={`w-3 h-3 rounded-full bg-foreground absolute top-0.5 transition-all ${(ind.showSweeps ?? true) ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Show Swing Dots</label>
                      <button onClick={() => updateIndicator(ind.id, { showSwingDots: !(ind.showSwingDots ?? true) })} className={`w-8 h-4 rounded-full transition-colors relative ${(ind.showSwingDots ?? true) ? 'bg-primary' : 'bg-accent'}`}>
                        <div className={`w-3 h-3 rounded-full bg-foreground absolute top-0.5 transition-all ${(ind.showSwingDots ?? true) ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>
                )}
                {/* Inline settings: PATTERN */}
                {ind.type === 'PATTERN' && expandedSettingsId === ind.id && (
                  <div className="mt-2 pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Pivot Length</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateIndicator(ind.id, { period: Math.max(2, (ind.period ?? 5) - 1) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">−</button>
                        <span className="w-6 text-center text-[11px] tabular-nums">{ind.period ?? 5}</span>
                        <button onClick={() => updateIndicator(ind.id, { period: (ind.period ?? 5) + 1 })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">+</button>
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground">Shorter = more sensitive, longer = only major patterns.</p>
                  </div>
                )}
                {/* Inline settings: ANCHORED_VWAP */}
                {ind.type === 'ANCHORED_VWAP' && expandedSettingsId === ind.id && (
                  <div className="mt-2 pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Show ±σ Bands</label>
                      <button onClick={() => updateIndicator(ind.id, { showBands: !(ind.showBands ?? true) })} className={`w-8 h-4 rounded-full transition-colors relative ${(ind.showBands ?? true) ? 'bg-primary' : 'bg-accent'}`}>
                        <div className={`w-3 h-3 rounded-full bg-foreground absolute top-0.5 transition-all ${(ind.showBands ?? true) ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Anchor Time (Unix s, 0 = start)</label>
                      <input
                        type="number"
                        value={ind.anchorTime ?? 0}
                        onChange={(e) => updateIndicator(ind.id, { anchorTime: Number(e.target.value) })}
                        className="w-full bg-input border border-border rounded px-2 py-1 text-[10px] text-foreground tabular-nums"
                        placeholder="0"
                      />
                      <p className="text-[9px] text-muted-foreground mt-0.5">0 = full dataset start. Paste a Unix timestamp to anchor at a specific bar.</p>
                    </div>
                  </div>
                )}
                {/* Inline settings: SESSION_VWAP */}
                {ind.type === 'SESSION_VWAP' && expandedSettingsId === ind.id && (
                  <div className="mt-2 pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Show ±σ Bands</label>
                      <button onClick={() => updateIndicator(ind.id, { showBands: !(ind.showBands ?? true) })} className={`w-8 h-4 rounded-full transition-colors relative ${(ind.showBands ?? true) ? 'bg-primary' : 'bg-accent'}`}>
                        <div className={`w-3 h-3 rounded-full bg-foreground absolute top-0.5 transition-all ${(ind.showBands ?? true) ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <p className="text-[9px] text-muted-foreground">Resets every UTC day. Best on 1m–15m timeframes.</p>
                  </div>
                )}
                {/* Inline settings: SUPPLY_DEMAND */}
                {ind.type === 'SUPPLY_DEMAND' && expandedSettingsId === ind.id && (
                  <div className="mt-2 pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Pivot Length</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateIndicator(ind.id, { period: Math.max(2, (ind.period ?? 5) - 1) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">−</button>
                        <span className="w-6 text-center text-[11px] tabular-nums">{ind.period ?? 5}</span>
                        <button onClick={() => updateIndicator(ind.id, { period: (ind.period ?? 5) + 1 })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">+</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Zone Height (ATR×)</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateIndicator(ind.id, { sdAtrMult: Math.max(0.1, Number(((ind.sdAtrMult ?? 0.5) - 0.1).toFixed(1))) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">−</button>
                        <span className="w-8 text-center text-[11px] tabular-nums">{(ind.sdAtrMult ?? 0.5).toFixed(1)}</span>
                        <button onClick={() => updateIndicator(ind.id, { sdAtrMult: Number(((ind.sdAtrMult ?? 0.5) + 0.1).toFixed(1)) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">+</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Min Strength</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateIndicator(ind.id, { sdStrength: Math.max(0.1, Number(((ind.sdStrength ?? 0.4) - 0.1).toFixed(1))) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">−</button>
                        <span className="w-8 text-center text-[11px] tabular-nums">{(ind.sdStrength ?? 0.4).toFixed(1)}</span>
                        <button onClick={() => updateIndicator(ind.id, { sdStrength: Math.min(0.9, Number(((ind.sdStrength ?? 0.4) + 0.1).toFixed(1))) })} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs flex items-center justify-center">+</button>
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground">Higher strength = fewer but cleaner zones. ◇ = tested, ✗ = broken.</p>
                  </div>
                )}
              </div>
            ))}

            {/* Add indicator panel */}
            {!showAdd ? (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-primary hover:opacity-80 border border-dashed border-primary/30 rounded transition-opacity"
              >
                <Plus size={12} /> Add Indicator
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search indicators..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground"
                    autoFocus
                  />
                  <button onClick={() => { setShowAdd(false); setSearchQuery(''); setSelectedGroup(null); }} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>

                {/* Group filter chips */}
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setSelectedGroup(null)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${selectedGroup === null ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                  >All</button>
                  {PRESET_GROUPS.map((g) => (
                    <button
                      key={g}
                      onClick={() => setSelectedGroup(g === selectedGroup ? null : g)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${selectedGroup === g ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                    >{g}</button>
                  ))}
                </div>

                {/* Grouped preset list */}
                {PRESET_GROUPS.filter(g => !selectedGroup || g === selectedGroup).map((group) => {
                  const groupPresets = filteredPresets.filter((p) => p.group === group);
                  if (groupPresets.length === 0) return null;
                  return (
                    <div key={group}>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">{group}</p>
                      <div className="space-y-1">
                        {groupPresets.map((preset) => (
                          <button
                            key={preset.type}
                            onClick={() => handleAddIndicator(preset)}
                            className="w-full text-left px-2 py-1.5 rounded hover:bg-accent transition-colors text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: preset.defaults.color ?? '#6b7280' }} />
                              <span className="font-medium text-foreground">{preset.label}</span>
                              {group === 'Smart Money' && (
                                <span className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full shrink-0">SMC</span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5 ml-4">{preset.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {indicators.length > 0 && !showAdd && (
              <button onClick={clearAllIndicators} className="w-full text-[10px] text-destructive hover:text-destructive/80 transition-colors py-1">
                Clear All Indicators
              </button>
            )}
          </div>
        )}

        {/* ---- ALERTS TAB ---- */}
        {rightPanelTab === 'alerts' && (
          <div className="space-y-2">
            <QuickPriceAlert />
            <SmartMoneyAlertForm />
            <CompoundAlertForm />
            <IndicatorCrossAlertForm />
            <StochRSICrossAlertForm />
            <IndicatorThresholdAlertForm />
            <PctDiffDonCrossAlertForm />
            <PctDiffStrategyAlertForm />
            <CompoundAlertsList />
            <AlertTemplatesSection />
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const total = alerts.length
                    + indicatorCrossAlerts.filter(a => a.active && !a.triggered).length
                    + (indicatorThresholdAlerts ?? []).filter(a => a.active && !a.triggered).length
                    + (stochRSICrossAlerts ?? []).filter(a => a.active && !a.triggered).length
                    + (pctDiffDonCrossAlerts ?? []).filter(a => a.active && !a.triggered).length
                    + (pctDiffStrategyAlerts ?? []).filter(a => a.active).length
                    + (compoundAlerts ?? []).filter(a => a.active && !a.triggered).length
                    + (smartMoneyAlerts ?? []).filter(a => a.active).length
                    + (rectangleAlerts ?? []).filter(a => a.active && !a.triggered).length;
                  return total === 0 ? 'No alerts set.' : `${total} active alert(s)`;
                })()}
              </p>
              {((alerts.length
                + indicatorCrossAlerts.filter(a => a.active && !a.triggered).length
                + (indicatorThresholdAlerts ?? []).filter(a => a.active && !a.triggered).length
                + (stochRSICrossAlerts ?? []).filter(a => a.active && !a.triggered).length
                + (pctDiffDonCrossAlerts ?? []).filter(a => a.active && !a.triggered).length
                + (pctDiffStrategyAlerts ?? []).filter(a => a.active).length
                + (compoundAlerts ?? []).filter(a => a.active && !a.triggered).length
                + (smartMoneyAlerts ?? []).filter(a => a.active).length
                + (rectangleAlerts ?? []).filter(a => a.active && !a.triggered).length) > 0) && (
                  <button onClick={clearAllAlerts} className="text-[10px] text-destructive hover:text-destructive/80 transition-colors">
                    Delete All
                  </button>
                )}
            </div>
            {alerts.map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-foreground">{alert.condition.replace('_', ' ')}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => {
                      const enabled = !(alert.telegramEnabled ?? true);
                      if ('trendlineId' in alert) useChartStore.getState().updateAlert(alert.id, { telegramEnabled: enabled });
                      else useChartStore.getState().updateIndicatorCrossAlert(alert.id, { telegramEnabled: enabled });
                    }}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`Telegram ${(alert.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><Send size={10} /></button>

                    <button
                      onClick={() => useChartStore.getState().updateAlert(alert.id, { whatsappEnabled: !(alert.whatsappEnabled ?? true) })}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.whatsappEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`WhatsApp ${(alert.whatsappEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><MessageSquare size={10} /></button>

                    <button onClick={() => removeAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>

                  </div>
                </div>
                <div className="text-muted-foreground mt-1 flex justify-between">
                  <span>{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</span>
                  <span className="opacity-60">{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

              </div>
            ))}
            {indicatorCrossAlerts.filter(a => a.active && !a.triggered).map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ArrowRightLeft size={10} className="text-primary" />
                    <span className="text-foreground">{alert.condition.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => {
                      const enabled = !(alert.telegramEnabled ?? true);
                      if ('trendlineId' in alert) useChartStore.getState().updateAlert(alert.id, { telegramEnabled: enabled });
                      else useChartStore.getState().updateIndicatorCrossAlert(alert.id, { telegramEnabled: enabled });
                    }}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`Telegram ${(alert.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><Send size={10} /></button>

                    <button onClick={() => useChartStore.getState().updateIndicatorCrossAlert(alert.id, { whatsappEnabled: !(alert.whatsappEnabled ?? true) })}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.whatsappEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`WhatsApp ${(alert.whatsappEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><MessageSquare size={10} /></button>

                    <button onClick={() => removeIndicatorCrossAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>

                  </div>
                </div>
                <div className="text-muted-foreground mt-1 flex justify-between">
                  <span>{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</span>
                  <span className="opacity-60">{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

              </div>
            ))}
            {(rectangleAlerts ?? []).filter(a => a.active && !a.triggered).map((alert) => (
              <div
                key={alert.id}
                className="panel-section rounded p-2 text-xs cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => useChartStore.getState().setSelectedRectangleId(alert.rectangleId)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-foreground">Price {alert.condition.replace('_', ' ')}</span>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => useChartStore.getState().updateRectangleAlert(alert.id, { telegramEnabled: !(alert.telegramEnabled ?? true) })}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`Telegram ${(alert.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><Send size={10} /></button>

                    <button
                      onClick={() => useChartStore.getState().updateRectangleAlert(alert.id, { whatsappEnabled: !(alert.whatsappEnabled ?? true) })}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.whatsappEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`WhatsApp ${(alert.whatsappEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><MessageSquare size={10} /></button>

                    <button onClick={() => removeRectangleAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>

                  </div>
                </div>
                <div className="text-muted-foreground mt-1 flex justify-between">
                  <span>{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</span>
                  <span className="opacity-60">{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
            {(stochRSICrossAlerts ?? []).filter(a => a.active && !a.triggered).map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ArrowRightLeft size={10} className="text-accent-foreground" />
                    <span className="text-foreground">StochRSI {alert.condition.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => useChartStore.getState().updateStochRSICrossAlert(alert.id, { telegramEnabled: !(alert.telegramEnabled ?? true) })}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`Telegram ${(alert.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><Send size={10} /></button>
                    <button onClick={() => useChartStore.getState().updateStochRSICrossAlert(alert.id, { whatsappEnabled: !(alert.whatsappEnabled ?? true) })}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.whatsappEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`WhatsApp ${(alert.whatsappEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><MessageSquare size={10} /></button>
                    <button onClick={() => removeStochRSICrossAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                  </div>

                </div>
                <div className="text-muted-foreground mt-1 flex justify-between">
                  <span>{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</span>
                  <span className="opacity-60">{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

              </div>
            ))}
            {(indicatorThresholdAlerts ?? []).filter(a => a.active && !a.triggered).map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Bell size={10} className="text-accent-foreground" />
                    <span className="text-foreground">{alert.condition} {alert.threshold}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => useChartStore.getState().updateIndicatorThresholdAlert(alert.id, { telegramEnabled: !(alert.telegramEnabled ?? true) })}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`Telegram ${(alert.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><Send size={10} /></button>
                    <button onClick={() => useChartStore.getState().updateIndicatorThresholdAlert(alert.id, { whatsappEnabled: !(alert.whatsappEnabled ?? true) })}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.whatsappEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`WhatsApp ${(alert.whatsappEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><MessageSquare size={10} /></button>
                    <button onClick={() => removeIndicatorThresholdAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                  </div>

                </div>
                <div className="text-muted-foreground mt-1 flex justify-between">
                  <span>{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</span>
                  <span className="opacity-60">{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

              </div>
            ))}
            {(pctDiffDonCrossAlerts ?? []).filter(a => a.active && !a.triggered).map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ArrowRightLeft size={10} className="text-accent-foreground" />
                    <span className="text-foreground">%Diff {alert.condition.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => useChartStore.getState().updatePctDiffDonCrossAlert(alert.id, { telegramEnabled: !(alert.telegramEnabled ?? true) })}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`Telegram ${(alert.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><Send size={10} /></button>
                    <button onClick={() => useChartStore.getState().updatePctDiffDonCrossAlert(alert.id, { whatsappEnabled: !(alert.whatsappEnabled ?? true) })}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.whatsappEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`WhatsApp ${(alert.whatsappEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><MessageSquare size={10} /></button>
                    <button onClick={() => removePctDiffDonCrossAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                  </div>

                </div>
                <div className="text-muted-foreground mt-1 flex justify-between">
                  <span>{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</span>
                  <span className="opacity-60">{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

              </div>
            ))}
            {(pctDiffStrategyAlerts ?? []).filter(a => a.active).map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap size={10} className="text-yellow-400" />
                    <span className="text-foreground">{STRATEGY_LABELS[alert.strategy]}</span>
                    <span className={`text-[9px] px-1 rounded ${alert.direction === 'long' ? 'bg-green-900/40 text-green-400' : alert.direction === 'short' ? 'bg-red-900/40 text-red-400' : 'bg-blue-900/40 text-blue-400'}`}>
                      {alert.direction}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => useChartStore.getState().updatePctDiffStrategyAlert(alert.id, { active: !alert.active })}
                      className="text-muted-foreground hover:text-foreground" title="Toggle">
                      {alert.active ? <Eye size={10} /> : <EyeOff size={10} />}
                    </button>
                    <button onClick={() => useChartStore.getState().updatePctDiffStrategyAlert(alert.id, { telegramEnabled: !(alert.telegramEnabled ?? true) })}
                      className={`transition-colors ${(alert.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`Telegram ${(alert.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><Send size={10} /></button>
                    <button onClick={() => useChartStore.getState().updatePctDiffStrategyAlert(alert.id, { whatsappEnabled: !(alert.whatsappEnabled ?? true) })}
                      className={`transition-colors ${(alert.whatsappEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`WhatsApp ${(alert.whatsappEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><MessageSquare size={10} /></button>
                    <button onClick={() => removePctDiffStrategyAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="text-muted-foreground mt-1 flex justify-between">
                  <span>{alert.symbol} · {alert.timeframe}</span>
                  <span className="opacity-60">{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
            {alertLogs.length > 0 && (
              <>
                <div className="flex items-center justify-between mt-4 px-1">
                  <span className="text-xs font-semibold text-muted-foreground">Recent Alerts</span>
                  <button onClick={() => useChartStore.getState().clearAlertLogs()} className="text-[10px] text-destructive hover:text-destructive/80 transition-colors">Clear All</button>
                </div>
                {alertLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="panel-section rounded p-2 text-xs">
                    <div className="text-foreground">{log.message}</div>
                    <div className="text-muted-foreground mt-1">
                      {new Date(log.timestamp).toLocaleTimeString()} · {log.price.toFixed(2)}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ---- SETTINGS TAB ---- */}
        {rightPanelTab === 'settings' && (
          <div className="space-y-4">
            {/* Chart settings */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Chart</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-muted-foreground">Font Size</label>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setChartFontSize(Math.max(8, chartFontSize - 1))} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs">−</button>
                    <span className="w-5 text-center">{chartFontSize}</span>
                    <button onClick={() => setChartFontSize(Math.min(16, chartFontSize + 1))} className="w-5 h-5 rounded bg-accent hover:bg-accent/80 text-xs">+</button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <label className="text-muted-foreground">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="bg-input border border-border rounded px-2 py-1 text-xs text-foreground"
                  >
                    <option value="Exchange">Exchange</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">New York</option>
                    <option value="Europe/London">London</option>
                    <option value="Asia/Kolkata">India (IST)</option>
                    <option value="Asia/Tokyo">Tokyo</option>
                    <option value="Asia/Singapore">Singapore</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Drawings */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Drawings</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Trendlines: {trendlines.length}</span>
                  {trendlines.length > 0 && (
                    <button onClick={clearAllDrawings} className="text-[10px] text-destructive hover:text-destructive/80">Clear All</button>
                  )}
                </div>
                <div>Fibonacci: {fibonacciDrawings.length}</div>
              </div>
            </div>

            {/* Telegram */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Telegram Alerts</p>
              <TelegramSettings />
            </div>

            {/* WhatsApp */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">WhatsApp Alerts</p>
              <WhatsAppSettings />
            </div>

            {/* AI Sidekick */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">AI Sidekick Settings</p>
              <AISidekickSettings />
            </div>


            {/* Sync */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Server Sync</p>
              <SyncControls />
            </div>

            {/* Danger Zone */}
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] font-semibold text-destructive uppercase tracking-wider mb-2">Danger Zone</p>
              <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
                If the chart is stuck or indicators won't go away, use this to completely wipe all local data.
              </p>
              <button
                onClick={handleHardReset}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 rounded-md transition-colors text-[11px] font-medium"
              >
                <Trash2 size={12} />
                Factory Reset (Wipe All Data)
              </button>
            </div>
          </div>
        )}

        {/* ---- WATCHLIST TAB ---- */}
        {rightPanelTab === 'watchlist' && <WatchlistPanel />}

        {/* ---- HEATMAP TAB ---- */}
        {rightPanelTab === 'heatmap' && <HeatmapView />}

        {/* ---- GUIDE TAB ---- */}
        {rightPanelTab === 'guide' && <FeatureGuide />}

        {/* ---- TRADES TAB ---- */}
        {rightPanelTab === 'trades' && <TradeBook />}
      </div>
    </div>
  );
};

export default RightSidebar;
