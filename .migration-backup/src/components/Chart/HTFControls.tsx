import React from 'react';
import { useChartStore } from '@/stores/chartStore';
import { HTFDisplayMode, AUTO_HTF_MAP } from '@/types/htfOverlay';
import { Timeframe } from '@/types/trading';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Layers, Eye, EyeOff, Wand2, AlertTriangle } from 'lucide-react';

const MODE_LABELS: Record<HTFDisplayMode, string> = {
  candles: 'Candles',
  zones: 'Zones',
  highlow: 'H/L Lines',
};

const TF_OPTIONS: Timeframe[] = ['5m', '15m', '1h', '4h', '1D', '1W'];

export const HTFControls: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { htfOverlay, updateHTFLayer, setHTFAutoMode, setHTFTrendAlignment, timeframe } = useChartStore();
  const autoTfs = AUTO_HTF_MAP[timeframe];

  return (
    <div className="absolute left-12 top-0 z-50 w-72 bg-popover border border-border rounded-lg shadow-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Layers size={14} />
          HTF Overlay
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs px-1">✕</button>
      </div>

      {/* Auto mode */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Wand2 size={12} />
          Auto ({autoTfs[0]} + {autoTfs[1]})
        </div>
        <Switch
          checked={htfOverlay.autoMode}
          onCheckedChange={setHTFAutoMode}
          className="h-4 w-8 [&>span]:h-3 [&>span]:w-3"
        />
      </div>

      {/* Trend alignment */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <AlertTriangle size={12} />
          Trend alignment
        </div>
        <Switch
          checked={htfOverlay.trendAlignment}
          onCheckedChange={setHTFTrendAlignment}
          className="h-4 w-8 [&>span]:h-3 [&>span]:w-3"
        />
      </div>

      <div className="h-px bg-border" />

      {/* Layer controls */}
      {htfOverlay.layers.map((layer, idx) => {
        const displayTf = htfOverlay.autoMode ? (idx === 0 ? autoTfs[0] : autoTfs[1]) : layer.timeframe;
        return (
          <div key={idx} className="space-y-2 p-2 rounded bg-accent/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateHTFLayer(idx, { enabled: !layer.enabled })}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {layer.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <span className="text-xs font-medium text-foreground">Layer {idx + 1}</span>
              </div>
              {!htfOverlay.autoMode && (
                <select
                  value={layer.timeframe}
                  onChange={(e) => updateHTFLayer(idx, { timeframe: e.target.value as Timeframe })}
                  className="text-[10px] bg-background border border-border rounded px-1 py-0.5 text-foreground"
                >
                  {TF_OPTIONS.map(tf => (
                    <option key={tf} value={tf}>{tf}</option>
                  ))}
                </select>
              )}
              {htfOverlay.autoMode && (
                <span className="text-[10px] text-muted-foreground font-mono">{displayTf}</span>
              )}
            </div>

            {layer.enabled && (
              <>
                {/* Mode */}
                <div className="flex gap-1">
                  {(Object.keys(MODE_LABELS) as HTFDisplayMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => updateHTFLayer(idx, { mode })}
                      className={`text-[9px] px-2 py-0.5 rounded transition-colors ${
                        layer.mode === mode
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-accent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {MODE_LABELS[mode]}
                    </button>
                  ))}
                </div>

                {/* Color */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-10">Color</span>
                  <input
                    type="color"
                    value={layer.color}
                    onChange={(e) => updateHTFLayer(idx, { color: e.target.value })}
                    className="w-6 h-5 rounded border border-border cursor-pointer bg-transparent"
                  />
                </div>

                {/* Opacity */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-10">
                    {Math.round(layer.opacity * 100)}%
                  </span>
                  <Slider
                    value={[layer.opacity]}
                    onValueChange={([v]) => updateHTFLayer(idx, { opacity: v })}
                    min={0.05}
                    max={1}
                    step={0.05}
                    className="flex-1 h-4 [&>span:first-child]:h-1 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
                  />
                </div>

                {/* Wicks toggle (only for candles mode) */}
                {layer.mode === 'candles' && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Show wicks</span>
                    <Switch
                      checked={layer.showWicks}
                      onCheckedChange={(v) => updateHTFLayer(idx, { showWicks: v })}
                      className="h-4 w-8 [&>span]:h-3 [&>span]:w-3"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};
