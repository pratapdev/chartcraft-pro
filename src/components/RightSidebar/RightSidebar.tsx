import React, { useState, useEffect, useRef } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { X, Trash2, Eye, EyeOff, Plus, ChevronDown, Bell, Send, ArrowRightLeft, RefreshCw, CloudOff, Cloud, List, Grid3X3 } from 'lucide-react';
import { IndicatorType, IndicatorConfig, AlertCondition, LineStyleType, ThresholdCondition, PctDiffDonLine } from '@/types/trading';
import { getTelegramCredentials, saveTelegramCredentials, testTelegramNotification } from '@/lib/telegram';
import { pushState, pullState, checkSyncHealth, extractSyncPayload, getSyncServerUrl, setSyncServerUrl } from '@/lib/syncService';
import { CompoundAlertForm, CompoundAlertsList, AlertTemplatesSection } from '@/components/Alerts/CompoundAlerts';
import { WatchlistPanel } from '@/components/Watchlist/WatchlistPanel';
import { HeatmapView } from '@/components/Heatmap/HeatmapView';

const INDICATOR_PRESETS: { type: IndicatorType; label: string; defaults: Partial<IndicatorConfig> }[] = [
  { type: 'EMA', label: 'EMA', defaults: { period: 20, color: '#2962FF' } },
  { type: 'SMA', label: 'SMA', defaults: { period: 20, color: '#FF9800' } },
  { type: 'RSI', label: 'RSI', defaults: { period: 14, color: '#E040FB' } },
  { type: 'STOCH_RSI', label: 'Stoch RSI', defaults: { period: 14, color: '#00BCD4', color2: '#FF5722', kPeriod: 3, dPeriod: 3 } },
  { type: 'MACD', label: 'MACD', defaults: { period: 12, color: '#2196F3', color2: '#FF5722' } },
  { type: 'BBANDS', label: 'Bollinger Bands', defaults: { period: 20, color: '#2196F3', color2: 'rgba(33,150,243,0.08)', stdDev: 2 } },
  { type: 'VWAP', label: 'VWAP', defaults: { period: 1, color: '#FFEB3B' } },
  { type: 'SUPERTREND', label: 'Supertrend', defaults: { period: 10, color: '#22c55e', color2: '#ef4444', multiplier: 3 } },
  { type: 'ADX', label: 'ADX', defaults: { period: 14, color: '#FFEB3B' } },
  { type: 'ATR', label: 'ATR', defaults: { period: 14, color: '#26a69a' } },
  { type: 'OBV', label: 'OBV', defaults: { period: 1, color: '#AB47BC' } },
  { type: 'PIVOT_HL', label: 'Pivot Points H/L', defaults: { period: 5, color: '#22c55e', color2: '#ef4444' } },
  { type: 'PCT_DIFF_DON', label: '% Diff Donchian', defaults: { period: 20, color: '#22c55e', color2: '#ef4444', lookbackWindow: 10, emaSmoothing: 5, donchianLength: 20, donLineDiff: 0.2 } },
];

const IndicatorRow: React.FC<{ ind: IndicatorConfig }> = ({ ind }) => {
  const { toggleIndicator, removeIndicator, updateIndicator } = useChartStore();
  const [editing, setEditing] = useState(false);

  return (
    <div className="panel-section rounded p-2 text-xs space-y-1.5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setEditing(!editing)}
          className="flex items-center gap-2 hover:text-foreground transition-colors"
        >
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ind.color }} />
          <span className="text-foreground font-medium">
            {ind.type === 'STOCH_RSI' ? 'StochRSI' : ind.type}({ind.period})
          </span>
          <ChevronDown size={10} className={`text-muted-foreground transition-transform ${editing ? 'rotate-180' : ''}`} />
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => toggleIndicator(ind.id)} className="text-muted-foreground hover:text-foreground">
            {ind.visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
          <button onClick={() => { if (window.confirm(`Remove ${ind.type}(${ind.period})?`)) removeIndicator(ind.id); }} className="text-muted-foreground hover:text-destructive">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {editing && (
        <div className="space-y-1.5 pt-1 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground">Period</label>
            <input
              type="number"
              min={1}
              max={500}
              value={ind.period}
              onChange={(e) => updateIndicator(ind.id, { period: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-16 bg-accent text-foreground text-xs px-2 py-1 rounded outline-none text-right"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground">Color</label>
            <input
              type="color"
              value={ind.color}
              onChange={(e) => updateIndicator(ind.id, { color: e.target.value })}
              className="w-6 h-5 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground">Line Width</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map((w) => (
                <button
                  key={w}
                  onClick={() => updateIndicator(ind.id, { lineWidth: w })}
                  className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${(ind.lineWidth ?? 1) === w ? 'bg-accent' : 'hover:bg-accent/50'}`}
                >
                  <div className="rounded-full" style={{ width: 14, height: w, background: ind.color }} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground">Style</label>
            <div className="flex items-center gap-1">
              {([
                { value: 'solid' as LineStyleType, dash: 'none' },
                { value: 'dashed' as LineStyleType, dash: '6 3' },
                { value: 'dotted' as LineStyleType, dash: '2 2' },
              ]).map((s) => (
                <button
                  key={s.value}
                  onClick={() => updateIndicator(ind.id, { lineStyle: s.value })}
                  className={`w-8 h-6 rounded flex items-center justify-center transition-colors ${(ind.lineStyle ?? 'solid') === s.value ? 'bg-accent' : 'hover:bg-accent/50'}`}
                >
                  <svg width="20" height="4" viewBox="0 0 20 4">
                    <line x1="0" y1="2" x2="20" y2="2" stroke={ind.color} strokeWidth={ind.lineWidth ?? 1} strokeDasharray={s.dash} />
                  </svg>
                </button>
              ))}
            </div>
          </div>
          {ind.type === 'STOCH_RSI' && (
            <>
              <div className="flex items-center justify-between">
                <label className="text-muted-foreground">K Smooth</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={ind.kPeriod ?? 3}
                  onChange={(e) => updateIndicator(ind.id, { kPeriod: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-16 bg-accent text-foreground text-xs px-2 py-1 rounded outline-none text-right"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-muted-foreground">D Smooth</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={ind.dPeriod ?? 3}
                  onChange={(e) => updateIndicator(ind.id, { dPeriod: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-16 bg-accent text-foreground text-xs px-2 py-1 rounded outline-none text-right"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-muted-foreground">D Color</label>
                <input
                  type="color"
                  value={ind.color2 ?? '#FF5722'}
                  onChange={(e) => updateIndicator(ind.id, { color2: e.target.value })}
                  className="w-6 h-5 rounded cursor-pointer border-0 bg-transparent"
                />
              </div>
            </>
          )}
          {ind.type === 'BBANDS' && (
            <div className="flex items-center justify-between">
              <label className="text-muted-foreground">Std Dev</label>
              <input
                type="number"
                min={0.5}
                max={5}
                step={0.5}
                value={ind.stdDev ?? 2}
                onChange={(e) => updateIndicator(ind.id, { stdDev: Math.max(0.5, parseFloat(e.target.value) || 2) })}
                className="w-16 bg-accent text-foreground text-xs px-2 py-1 rounded outline-none text-right"
              />
            </div>
          )}
          {ind.type === 'SUPERTREND' && (
            <div className="flex items-center justify-between">
              <label className="text-muted-foreground">Multiplier</label>
              <input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={ind.multiplier ?? 3}
                onChange={(e) => updateIndicator(ind.id, { multiplier: Math.max(0.5, parseFloat(e.target.value) || 3) })}
                className="w-16 bg-accent text-foreground text-xs px-2 py-1 rounded outline-none text-right"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const CONDITION_OPTIONS: { value: AlertCondition; label: string }[] = [
  { value: 'cross_above', label: 'Cross Above' },
  { value: 'cross_below', label: 'Cross Below' },
  { value: 'cross_any', label: 'Any Cross' },
];

const QuickPriceAlert: React.FC = () => {
  const { symbol, timeframe, candles, addTrendline, addAlert } = useChartStore();
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<AlertCondition>('cross_above');

  const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const priceVal = parseFloat(price);
    if (!priceVal || priceVal <= 0) return;

    const c = candles;
    const startTime = c.length > 0 ? c[0].time : Math.floor(Date.now() / 1000) - 86400;
    const endTime = c.length > 0 ? c[c.length - 1].time + (c.length > 1 ? (c[c.length - 1].time - c[0].time) : 86400) : Math.floor(Date.now() / 1000) + 86400;

    const lineId = crypto.randomUUID();
    addTrendline({
      id: lineId,
      symbol,
      timeframe,
      startTime,
      startPrice: priceVal,
      endTime,
      endPrice: priceVal,
      color: '#eab308',
      thickness: 2,
      createdAt: Date.now(),
    });

    addAlert({
      id: crypto.randomUUID(),
      symbol,
      timeframe,
      trendlineId: lineId,
      condition,
      active: true,
      triggered: false,
      message: `Price ${condition.replace('_', ' ')} ${priceVal.toFixed(2)}`,
      createdAt: Date.now(),
    });

    setPrice('');
  };

  return (
    <form onSubmit={handleSubmit} className="panel-section rounded p-2 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Bell size={12} className="text-primary" />
        Quick Price Alert
      </div>
      <div className="flex gap-1.5">
        <input
          type="number"
          step="any"
          placeholder={lastPrice ? lastPrice.toFixed(2) : 'Price'}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="flex-1 bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none placeholder:text-muted-foreground"
        />
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as AlertCondition)}
          className="bg-accent text-foreground text-xs px-1.5 py-1.5 rounded outline-none"
        >
          {CONDITION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="w-full text-xs py-1.5 rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors font-medium"
      >
        Set Alert
      </button>
    </form>
  );
};

const IndicatorCrossAlertForm: React.FC = () => {
  const { symbol, timeframe, indicators, addIndicatorCrossAlert } = useChartStore();
  const overlayIndicators = indicators.filter((i) => i.visible && (i.type === 'EMA' || i.type === 'SMA'));
  const [ind1, setInd1] = useState('');
  const [ind2, setInd2] = useState('');
  const [condition, setCondition] = useState<AlertCondition>('cross_above');

  if (overlayIndicators.length < 2) {
    return (
      <div className="panel-section rounded p-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
          <ArrowRightLeft size={12} className="text-primary" />
          Indicator Crossover Alert
        </div>
        <p>Add at least 2 EMA/SMA indicators to create crossover alerts.</p>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const i1 = ind1 || overlayIndicators[0]?.id;
    const i2 = ind2 || overlayIndicators[1]?.id;
    if (!i1 || !i2 || i1 === i2) return;

    const label1 = overlayIndicators.find((i) => i.id === i1);
    const label2 = overlayIndicators.find((i) => i.id === i2);

    addIndicatorCrossAlert({
      id: crypto.randomUUID(),
      symbol,
      timeframe,
      indicatorId1: i1,
      indicatorId2: i2,
      condition,
      active: true,
      triggered: false,
      message: `${label1?.type}(${label1?.period}) ${condition.replace('_', ' ')} ${label2?.type}(${label2?.period})`,
      createdAt: Date.now(),
    });
  };

  const selected1 = ind1 || overlayIndicators[0]?.id;
  const selected2 = ind2 || overlayIndicators[1]?.id;

  return (
    <form onSubmit={handleSubmit} className="panel-section rounded p-2 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <ArrowRightLeft size={12} className="text-primary" />
        Indicator Crossover Alert
      </div>
      <div className="flex gap-1.5 items-center">
        <select
          value={selected1}
          onChange={(e) => setInd1(e.target.value)}
          className="flex-1 bg-accent text-foreground text-xs px-1.5 py-1.5 rounded outline-none"
        >
          {overlayIndicators.map((ind) => (
            <option key={ind.id} value={ind.id}>{ind.type}({ind.period})</option>
          ))}
        </select>
        <span className="text-muted-foreground text-[10px]">×</span>
        <select
          value={selected2}
          onChange={(e) => setInd2(e.target.value)}
          className="flex-1 bg-accent text-foreground text-xs px-1.5 py-1.5 rounded outline-none"
        >
          {overlayIndicators.map((ind) => (
            <option key={ind.id} value={ind.id}>{ind.type}({ind.period})</option>
          ))}
        </select>
      </div>
      <select
        value={condition}
        onChange={(e) => setCondition(e.target.value as AlertCondition)}
        className="w-full bg-accent text-foreground text-xs px-1.5 py-1.5 rounded outline-none"
      >
        <option value="cross_above">Cross Above</option>
        <option value="cross_below">Cross Below</option>
        <option value="cross_any">Any Cross</option>
      </select>
      <button
        type="submit"
        disabled={selected1 === selected2}
        className="w-full text-xs py-1.5 rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Set Crossover Alert
      </button>
    </form>
  );
};

const StochRSICrossAlertForm: React.FC = () => {
  const { symbol, timeframe, indicators, addStochRSICrossAlert } = useChartStore();
  const stochIndicators = indicators.filter((i) => i.visible && i.type === 'STOCH_RSI');
  const [selectedInd, setSelectedInd] = useState('');
  const [condition, setCondition] = useState<AlertCondition>('cross_above');

  if (stochIndicators.length === 0) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const indId = selectedInd || stochIndicators[0]?.id;
    if (!indId) return;
    const ind = stochIndicators.find((i) => i.id === indId);
    addStochRSICrossAlert({
      id: crypto.randomUUID(),
      symbol, timeframe, indicatorId: indId, condition,
      active: true, triggered: false,
      message: `StochRSI(${ind?.period}) K ${condition.replace('_', ' ')} D`,
      createdAt: Date.now(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="panel-section rounded p-2 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <ArrowRightLeft size={12} className="text-accent-foreground" />
        StochRSI K/D Crossover
      </div>
      {stochIndicators.length > 1 && (
        <select value={selectedInd || stochIndicators[0]?.id} onChange={(e) => setSelectedInd(e.target.value)}
          className="w-full bg-accent text-foreground text-xs px-1.5 py-1.5 rounded outline-none">
          {stochIndicators.map((ind) => (
            <option key={ind.id} value={ind.id}>StochRSI({ind.period})</option>
          ))}
        </select>
      )}
      <select value={condition} onChange={(e) => setCondition(e.target.value as AlertCondition)}
        className="w-full bg-accent text-foreground text-xs px-1.5 py-1.5 rounded outline-none">
        <option value="cross_above">K Cross Above D (Bullish)</option>
        <option value="cross_below">K Cross Below D (Bearish)</option>
        <option value="cross_any">Any K/D Cross</option>
      </select>
      <button type="submit" className="w-full text-xs py-1.5 rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors font-medium">
        Set StochRSI Alert
      </button>
    </form>
  );
};

const IndicatorThresholdAlertForm: React.FC = () => {
  const { symbol, timeframe, indicators, addIndicatorThresholdAlert } = useChartStore();
  const thresholdIndicators = indicators.filter((i) => i.visible && (i.type === 'RSI' || i.type === 'ADX' || i.type === 'ATR'));
  const [selectedInd, setSelectedInd] = useState('');
  const [condition, setCondition] = useState<ThresholdCondition>('above');
  const [threshold, setThreshold] = useState('');

  if (thresholdIndicators.length === 0) return null;

  const current = thresholdIndicators.find((i) => i.id === (selectedInd || thresholdIndicators[0]?.id));
  const defaultThreshold = current?.type === 'RSI' ? (condition === 'above' ? '70' : '30')
    : current?.type === 'ADX' ? (condition === 'above' ? '25' : '20')
    : '14';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const indId = selectedInd || thresholdIndicators[0]?.id;
    const val = parseFloat(threshold) || parseFloat(defaultThreshold);
    if (!indId || !val) return;
    const ind = thresholdIndicators.find((i) => i.id === indId);
    addIndicatorThresholdAlert({
      id: crypto.randomUUID(),
      symbol, timeframe, indicatorId: indId, condition, threshold: val,
      active: true, triggered: false,
      message: `${ind?.type}(${ind?.period}) ${condition} ${val}`,
      createdAt: Date.now(),
    });
    setThreshold('');
  };

  return (
    <form onSubmit={handleSubmit} className="panel-section rounded p-2 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Bell size={12} className="text-accent-foreground" />
        RSI / ADX Threshold Alert
      </div>
      <select value={selectedInd || thresholdIndicators[0]?.id} onChange={(e) => setSelectedInd(e.target.value)}
        className="w-full bg-accent text-foreground text-xs px-1.5 py-1.5 rounded outline-none">
        {thresholdIndicators.map((ind) => (
          <option key={ind.id} value={ind.id}>{ind.type}({ind.period})</option>
        ))}
      </select>
      <div className="flex gap-1.5">
        <select value={condition} onChange={(e) => setCondition(e.target.value as ThresholdCondition)}
          className="flex-1 bg-accent text-foreground text-xs px-1.5 py-1.5 rounded outline-none">
          <option value="above">Crosses Above</option>
          <option value="below">Crosses Below</option>
        </select>
        <input type="number" step="any" placeholder={defaultThreshold} value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          className="w-16 bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none placeholder:text-muted-foreground text-right" />
      </div>
      <button type="submit" className="w-full text-xs py-1.5 rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors font-medium">
        Set Threshold Alert
      </button>
    </form>
  );
};

const PCT_DIFF_DON_LINES: { value: PctDiffDonLine; label: string }[] = [
  { value: 'main', label: 'Main Line' },
  { value: 'ema', label: 'EMA Smooth' },
  { value: 'basis', label: 'Don Basis' },
  { value: 'upper', label: 'Don Upper' },
  { value: 'lower', label: 'Don Lower' },
  { value: 'upperNew', label: 'Don Upper-Adj' },
  { value: 'lowerNew', label: 'Don Lower-Adj' },
];

const PctDiffDonCrossAlertForm: React.FC = () => {
  const { symbol, timeframe, indicators, addPctDiffDonCrossAlert } = useChartStore();
  const pctDiffIndicators = indicators.filter((i) => i.visible && i.type === 'PCT_DIFF_DON');
  const [selectedInd, setSelectedInd] = useState('');
  const [line1, setLine1] = useState<PctDiffDonLine>('main');
  const [line2, setLine2] = useState<PctDiffDonLine>('ema');
  const [condition, setCondition] = useState<AlertCondition>('cross_any');

  if (pctDiffIndicators.length === 0) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (line1 === line2) return;
    const indId = selectedInd || pctDiffIndicators[0]?.id;
    if (!indId) return;
    const l1Label = PCT_DIFF_DON_LINES.find(l => l.value === line1)?.label ?? line1;
    const l2Label = PCT_DIFF_DON_LINES.find(l => l.value === line2)?.label ?? line2;
    addPctDiffDonCrossAlert({
      id: crypto.randomUUID(),
      symbol, timeframe, indicatorId: indId,
      line1, line2, condition,
      active: true, triggered: false,
      message: `%Diff ${l1Label} ${condition.replace('_', ' ')} ${l2Label}`,
      createdAt: Date.now(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="panel-section rounded p-2 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <ArrowRightLeft size={12} className="text-accent-foreground" />
        %Diff Donchian Crossover
      </div>
      {pctDiffIndicators.length > 1 && (
        <select value={selectedInd || pctDiffIndicators[0]?.id} onChange={(e) => setSelectedInd(e.target.value)}
          className="w-full bg-accent text-foreground text-xs px-1.5 py-1.5 rounded outline-none">
          {pctDiffIndicators.map((ind) => (
            <option key={ind.id} value={ind.id}>%Diff Don({ind.period})</option>
          ))}
        </select>
      )}
      <div className="flex gap-1.5">
        <select value={line1} onChange={(e) => setLine1(e.target.value as PctDiffDonLine)}
          className="flex-1 bg-accent text-foreground text-xs px-1.5 py-1.5 rounded outline-none">
          {PCT_DIFF_DON_LINES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <span className="text-xs text-muted-foreground self-center">×</span>
        <select value={line2} onChange={(e) => setLine2(e.target.value as PctDiffDonLine)}
          className="flex-1 bg-accent text-foreground text-xs px-1.5 py-1.5 rounded outline-none">
          {PCT_DIFF_DON_LINES.filter(l => l.value !== line1).map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>
      <select value={condition} onChange={(e) => setCondition(e.target.value as AlertCondition)}
        className="w-full bg-accent text-foreground text-xs px-1.5 py-1.5 rounded outline-none">
        <option value="cross_above">Line 1 Cross Above Line 2</option>
        <option value="cross_below">Line 1 Cross Below Line 2</option>
        <option value="cross_any">Any Crossing</option>
      </select>
      <button type="submit" className="w-full text-xs py-1.5 rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors font-medium">
        Set %Diff Crossover Alert
      </button>
    </form>
  );
};

const LINE_STYLE_OPTIONS: { value: LineStyleType; label: string }[] = [
  { value: 'solid', label: '━━━' },
  { value: 'dashed', label: '╌╌╌' },
  { value: 'dotted', label: '···' },
];

const COLOR_PALETTE = ['#2563eb', '#eab308', '#22c55e', '#ef4444', '#a855f7', '#f97316', '#06b6d4', '#ec4899', '#ffffff', '#6b7280'];

const DrawingDefaultRow: React.FC<{
  label: string;
  type: 'trendline' | 'horizontal' | 'alertLine';
}> = ({ label, type }) => {
  const defaults = useChartStore((s) => s.drawingDefaults[type]);
  const setDefault = useChartStore((s) => s.setDrawingDefault);

  return (
    <div className="space-y-1.5 panel-section rounded p-2">
      <div className="text-[10px] font-medium text-foreground uppercase tracking-wide">{label}</div>
      <div className="flex items-center justify-between">
        <label className="text-muted-foreground">Color</label>
        <div className="flex items-center gap-1">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setDefault(type, { color: c })}
              className={`w-4 h-4 rounded-full border transition-transform ${defaults.color === c ? 'border-foreground scale-125' : 'border-transparent hover:scale-110'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="text-muted-foreground">Width</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4].map((w) => (
            <button
              key={w}
              onClick={() => setDefault(type, { thickness: w })}
              className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${defaults.thickness === w ? 'bg-accent' : 'hover:bg-accent/50'}`}
            >
              <div className="rounded-full" style={{ width: 14, height: w, background: defaults.color }} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="text-muted-foreground">Style</label>
        <div className="flex items-center gap-1">
          {LINE_STYLE_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => setDefault(type, { lineStyle: s.value })}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors ${defaults.lineStyle === s.value ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const SettingsPanel: React.FC = () => {
  const trendlines = useChartStore((s) => s.trendlines);
  const fibonacciDrawings = useChartStore((s) => s.fibonacciDrawings);
  const clearAllDrawings = useChartStore((s) => s.clearAllDrawings);
  const chartFontSize = useChartStore((s) => s.chartFontSize);
  const setChartFontSize = useChartStore((s) => s.setChartFontSize);
  const stored = getTelegramCredentials();
  const [botToken, setBotToken] = useState(stored.botToken);
  const [chatId, setChatId] = useState(stored.chatId);
  const [enabled, setEnabled] = useState(stored.enabled);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);

  const handleSave = () => {
    saveTelegramCredentials({ botToken: botToken.trim(), chatId: chatId.trim(), enabled });
    setTestResult(null);
  };

  const handleTest = async () => {
    handleSave();
    setTesting(true);
    setTestResult(null);
    const ok = await testTelegramNotification();
    setTestResult(ok ? 'success' : 'fail');
    setTesting(false);
  };

  const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20];

  return (
    <div className="space-y-3 text-xs text-muted-foreground p-1">
      <div>
        <p className="font-semibold text-foreground mb-2">Chart Font Size</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground">Scale & Legend Size</label>
            <span className="text-foreground font-medium">{chartFontSize}px</span>
          </div>
          <input
            type="range"
            min={9}
            max={20}
            step={1}
            value={chartFontSize}
            onChange={(e) => setChartFontSize(parseInt(e.target.value))}
            className="w-full accent-primary h-1 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>9px</span>
            <span>14px</span>
            <span>20px</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setChartFontSize(size)}
                className={`px-2 py-1 rounded text-[10px] transition-colors ${
                  chartFontSize === size
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-muted-foreground hover:text-foreground'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <p className="font-semibold text-foreground mb-2">Drawing Defaults</p>
        <div className="space-y-2">
          <DrawingDefaultRow label="Trendline" type="trendline" />
          <DrawingDefaultRow label="Horizontal Line" type="horizontal" />
          <DrawingDefaultRow label="Alert Line (from crosshair +)" type="alertLine" />
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <p className="font-semibold text-foreground mb-1">Drawings</p>
        <p>{trendlines.length} line(s), {fibonacciDrawings.length} fibonacci</p>
        {(trendlines.length > 0 || fibonacciDrawings.length > 0) && (
          <button
            onClick={clearAllDrawings}
            className="mt-1 text-[10px] text-destructive hover:text-destructive/80 transition-colors"
          >
            Delete All Drawings
          </button>
        )}
      </div>
      <div>
        <p className="font-semibold text-foreground mb-1">Shortcuts</p>
        <div className="space-y-1">
          <p><kbd className="bg-accent px-1 rounded text-foreground">Delete</kbd> Remove selected line</p>
          <p><kbd className="bg-accent px-1 rounded text-foreground">Esc</kbd> Cancel drawing</p>
        </div>
      </div>
      <div className="border-t border-border pt-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Send size={12} className="text-primary" />
          <p className="font-semibold text-foreground">Telegram Notifications</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground">Enabled</label>
            <button
              onClick={() => { setEnabled(!enabled); saveTelegramCredentials({ botToken: botToken.trim(), chatId: chatId.trim(), enabled: !enabled }); }}
              className={`w-8 h-4 rounded-full transition-colors relative ${enabled ? 'bg-primary' : 'bg-accent'}`}
            >
              <div className={`w-3 h-3 rounded-full bg-foreground absolute top-0.5 transition-all ${enabled ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>
          <div>
            <label className="text-muted-foreground block mb-0.5">Bot Token</label>
            <input
              type="password"
              placeholder="123456:ABC-DEF..."
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              onBlur={handleSave}
              className="w-full bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="text-muted-foreground block mb-0.5">Chat ID</label>
            <input
              type="text"
              placeholder="Your chat or group ID"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              onBlur={handleSave}
              className="w-full bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none placeholder:text-muted-foreground"
            />
          </div>
          <button
            onClick={handleTest}
            disabled={testing || !botToken || !chatId}
            className="w-full text-xs py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {testing ? 'Sending...' : 'Send Test Message'}
          </button>
          {testResult === 'success' && <p className="text-bull text-[10px]">✓ Test message sent!</p>}
          {testResult === 'fail' && <p className="text-bear text-[10px]">✗ Failed. Check token & chat ID.</p>}
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Create a bot via <a href="https://t.me/BotFather" target="_blank" rel="noopener" className="text-primary hover:underline">@BotFather</a>.
            Get your Chat ID from <a href="https://t.me/userinfobot" target="_blank" rel="noopener" className="text-primary hover:underline">@userinfobot</a>.
          </p>
        </div>
      </div>
      <div className="border-t border-border pt-3">
        <div className="flex items-center gap-1.5 mb-2">
          <RefreshCw size={12} className="text-primary" />
          <p className="font-semibold text-foreground">Server Sync</p>
        </div>
        <SyncControls />
      </div>
    </div>
  );
};

const SyncControls: React.FC = () => {
  const [serverUrl, setServerUrlLocal] = useState(getSyncServerUrl());
  const [status, setStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem('auto-sync') === 'true');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    localStorage.setItem('auto-sync', String(autoSync));
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (autoSync) {
      const doSync = async () => {
        const ok = await checkSyncHealth();
        if (ok) {
          const payload = extractSyncPayload(useChartStore.getState());
          const pushed = await pushState(payload);
          setStatus('online');
          if (pushed) {
            const now = new Date().toLocaleTimeString();
            localStorage.setItem('last-sync-time', now);
            setLastResult(`Auto-synced ✓ ${now}`);
          } else {
            setLastResult('Auto-sync failed ✗');
          }
        } else {
          setStatus('offline');
        }
      };
      doSync();
      intervalRef.current = setInterval(doSync, 30_000);
    }

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoSync]);

  const handleCheckHealth = async () => {
    setStatus('checking');
    const ok = await checkSyncHealth();
    setStatus(ok ? 'online' : 'offline');
  };

  const handlePush = async () => {
    setSyncing(true);
    setLastResult(null);
    const payload = extractSyncPayload(useChartStore.getState());
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
        store.setTimeframe(data.state.timeframe as any);
        store.setMarketType(data.state.marketType as any);
        store.setChartFontSize(data.state.chartFontSize);
        if (data.state.drawingDefaults) {
          for (const [key, val] of Object.entries(data.state.drawingDefaults)) {
            store.setDrawingDefault(key as any, val as any);
          }
        }
      }
      // Replace collections via direct set
      useChartStore.setState({
        trendlines: data.trendlines || [],
        indicators: data.indicators || [],
        alerts: data.alerts || [],
        alertLogs: data.alertLogs || [],
        fibonacciDrawings: data.fibonacciDrawings || [],
        indicatorCrossAlerts: data.indicatorCrossAlerts || [],
        indicatorThresholdAlerts: data.indicatorThresholdAlerts || [],
        stochRSICrossAlerts: data.stochRSICrossAlerts || [],
      });
      setLastResult('Pulled from server ✓');
    } else {
      setLastResult('Pull failed ✗');
    }
    setSyncing(false);
  };

  return (
    <div className="space-y-2 text-xs">
      <div>
        <label className="text-muted-foreground block mb-0.5">Server URL</label>
        <input
          type="text"
          value={serverUrl}
          onChange={(e) => setServerUrlLocal(e.target.value)}
          onBlur={() => setSyncServerUrl(serverUrl.trim())}
          className="w-full bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none placeholder:text-muted-foreground"
          placeholder="http://localhost:3001"
        />
      </div>
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
      {lastResult && (
        <p className={`text-[10px] ${lastResult.includes('✓') ? 'text-bull' : 'text-bear'}`}>{lastResult}</p>
      )}
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Sync trendlines, alerts, indicators & settings to your local server for cross-device access.
      </p>
    </div>
  );
};
export const RightSidebar: React.FC = () => {
  const {
    rightPanelOpen,
    rightPanelTab,
    setRightPanelOpen,
    alerts,
    alertLogs,
    removeAlert,
    clearAllAlerts,
    indicators,
    addIndicator,
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
  } = useChartStore();

  const [showAdd, setShowAdd] = useState(false);

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
      lookbackWindow: (preset.defaults as any).lookbackWindow,
      emaSmoothing: (preset.defaults as any).emaSmoothing,
      donchianLength: (preset.defaults as any).donchianLength,
      donLineDiff: (preset.defaults as any).donLineDiff,
    });
    setShowAdd(false);
  };

  return (
    <div className="bg-card border-l border-border flex flex-col h-full w-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-panel-header">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {rightPanelTab}
        </span>
        <button onClick={() => setRightPanelOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {rightPanelTab === 'alerts' && (
          <div className="space-y-2">
            <QuickPriceAlert />
            <CompoundAlertForm />
            <IndicatorCrossAlertForm />
            <StochRSICrossAlertForm />
            <IndicatorThresholdAlertForm />
            <PctDiffDonCrossAlertForm />
            <CompoundAlertsList />
            <AlertTemplatesSection />
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const total = alerts.length
                    + indicatorCrossAlerts.filter(a => a.active && !a.triggered).length
                    + (indicatorThresholdAlerts ?? []).filter(a => a.active && !a.triggered).length
                    + (stochRSICrossAlerts ?? []).filter(a => a.active && !a.triggered).length;
                  return total === 0 ? 'No alerts set.' : `${total} active alert(s)`;
                })()}
              </p>
              {(alerts.length > 0 || indicatorCrossAlerts.length > 0 || (indicatorThresholdAlerts ?? []).length > 0 || (stochRSICrossAlerts ?? []).length > 0) && (
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
                    <button
                      onClick={() => { const updated = { ...alert, telegramEnabled: !(alert.telegramEnabled ?? true) }; removeAlert(alert.id); useChartStore.getState().addAlert(updated); }}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`Telegram ${(alert.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><Send size={10} /></button>
                    <button onClick={() => removeAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="text-muted-foreground mt-1">{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</div>
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
                    <button onClick={() => { const updated = { ...alert, telegramEnabled: !(alert.telegramEnabled ?? true) }; removeIndicatorCrossAlert(alert.id); useChartStore.getState().addIndicatorCrossAlert(updated); }}
                      className={`flex items-center gap-0.5 transition-colors ${(alert.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                      title={`Telegram ${(alert.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
                    ><Send size={10} /></button>
                    <button onClick={() => removeIndicatorCrossAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="text-muted-foreground mt-1">{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</div>
              </div>
            ))}
            {(stochRSICrossAlerts ?? []).filter(a => a.active && !a.triggered).map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ArrowRightLeft size={10} className="text-accent-foreground" />
                    <span className="text-foreground">StochRSI {alert.condition.replace('_', ' ')}</span>
                  </div>
                  <button onClick={() => removeStochRSICrossAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                </div>
                <div className="text-muted-foreground mt-1">{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</div>
              </div>
            ))}
            {(indicatorThresholdAlerts ?? []).filter(a => a.active && !a.triggered).map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Bell size={10} className="text-accent-foreground" />
                    <span className="text-foreground">{alert.condition} {alert.threshold}</span>
                  </div>
                  <button onClick={() => removeIndicatorThresholdAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                </div>
                <div className="text-muted-foreground mt-1">{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</div>
              </div>
            ))}
            {(pctDiffDonCrossAlerts ?? []).filter(a => a.active && !a.triggered).map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ArrowRightLeft size={10} className="text-accent-foreground" />
                    <span className="text-foreground">%Diff {alert.condition.replace('_', ' ')}</span>
                  </div>
                  <button onClick={() => removePctDiffDonCrossAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                </div>
                <div className="text-muted-foreground mt-1">{alert.symbol} · {alert.timeframe} · {alert.message ?? ''}</div>
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

        {rightPanelTab === 'indicators' && (
          <div className="space-y-2">
            {indicators.length > 0 && (
              <div className="flex justify-end px-1">
                <button
                  onClick={clearAllIndicators}
                  className="text-[10px] text-destructive hover:text-destructive/80 transition-colors"
                >
                  Delete All
                </button>
              </div>
            )}
            {indicators.map((ind) => (
              <IndicatorRow key={ind.id} ind={ind} />
            ))}

            {!showAdd ? (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-1.5 text-primary rounded"
              >
                <Plus size={12} />
                Add Indicator
              </button>
            ) : (
              <div className="panel-section rounded p-2 space-y-1">
                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Select indicator</div>
                {INDICATOR_PRESETS.map((preset) => (
                  <button
                    key={preset.type}
                    onClick={() => handleAddIndicator(preset)}
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent transition-colors rounded text-foreground"
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowAdd(false)}
                  className="w-full text-center px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {rightPanelTab === 'settings' && (
          <SettingsPanel />
        )}

        {rightPanelTab === 'watchlist' && (
          <WatchlistPanel />
        )}

        {rightPanelTab === 'heatmap' && (
          <HeatmapView />
        )}
      </div>
    </div>
  );
};
