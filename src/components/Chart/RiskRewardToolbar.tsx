import React, { useState, useEffect } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { Trash2, X } from 'lucide-react';

export const RiskRewardToolbar: React.FC = () => {
  const {
    selectedRiskRewardId,
    riskRewardDrawings,
    updateRiskReward,
    removeRiskReward,
    setSelectedRiskRewardId,
  } = useChartStore();

  const rr = riskRewardDrawings.find((r) => r.id === selectedRiskRewardId);

  const [entry, setEntry] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');

  useEffect(() => {
    if (rr) {
      setEntry(rr.entryPrice.toString());
      setSl(rr.stopLoss.toString());
      setTp(rr.takeProfit.toString());
    }
  }, [rr?.id]);

  if (!rr || !selectedRiskRewardId) return null;

  const risk = Math.abs(rr.entryPrice - rr.stopLoss);
  const reward = Math.abs(rr.takeProfit - rr.entryPrice);
  const ratio = risk > 0 ? (reward / risk).toFixed(2) : '∞';
  const pctRisk = ((risk / rr.entryPrice) * 100).toFixed(2);
  const pctReward = ((reward / rr.entryPrice) * 100).toFixed(2);
  const isLong = rr.stopLoss < rr.entryPrice;

  const applyChanges = () => {
    const e = parseFloat(entry);
    const s = parseFloat(sl);
    const t = parseFloat(tp);
    if (isNaN(e) || isNaN(s) || isNaN(t) || e <= 0) return;
    updateRiskReward(selectedRiskRewardId, { entryPrice: e, stopLoss: s, takeProfit: t });
  };

  const setRatio = (newRatio: number) => {
    const r = Math.abs(rr.entryPrice - rr.stopLoss);
    const newTp = isLong ? rr.entryPrice + r * newRatio : rr.entryPrice - r * newRatio;
    setTp(newTp.toString());
    updateRiskReward(selectedRiskRewardId, { takeProfit: newTp });
  };

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-lg shadow-lg px-3 py-2 flex items-center gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Entry:</span>
        <input
          className="w-20 bg-muted border border-border rounded px-1.5 py-0.5 text-foreground text-xs"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onBlur={applyChanges}
          onKeyDown={(e) => e.key === 'Enter' && applyChanges()}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-destructive">SL:</span>
        <input
          className="w-20 bg-muted border border-border rounded px-1.5 py-0.5 text-foreground text-xs"
          value={sl}
          onChange={(e) => setSl(e.target.value)}
          onBlur={applyChanges}
          onKeyDown={(e) => e.key === 'Enter' && applyChanges()}
        />
        <span className="text-destructive text-[10px]">-{pctRisk}%</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-emerald-500 dark:text-emerald-400">TP:</span>
        <input
          className="w-20 bg-muted border border-border rounded px-1.5 py-0.5 text-foreground text-xs"
          value={tp}
          onChange={(e) => setTp(e.target.value)}
          onBlur={applyChanges}
          onKeyDown={(e) => e.key === 'Enter' && applyChanges()}
        />
        <span className="text-emerald-500 dark:text-emerald-400 text-[10px]">+{pctReward}%</span>
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">R:R</span>
        <span className="font-semibold text-foreground">1:{ratio}</span>
      </div>
      <div className="flex items-center gap-1">
        {[1.5, 2, 3, 5].map((r) => (
          <button
            key={r}
            onClick={() => setRatio(r)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              Math.abs(parseFloat(ratio) - r) < 0.05
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            1:{r}
          </button>
        ))}
      </div>
      <div className="h-4 w-px bg-border" />
      <button
        onClick={() => { removeRiskReward(selectedRiskRewardId); setSelectedRiskRewardId(null); }}
        className="text-destructive hover:bg-destructive/10 rounded p-1"
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
      <button
        onClick={() => setSelectedRiskRewardId(null)}
        className="text-muted-foreground hover:text-foreground rounded p-1"
        title="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
};
