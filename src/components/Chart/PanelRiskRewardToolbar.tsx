import React, { useEffect, useState, useRef } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useMultiPanelStore } from '@/stores/multiPanelStore';
import { RiskRewardDrawing } from '@/types/trading';
import { Trash2, TrendingUp, TrendingDown, Settings2, X, Check } from 'lucide-react';

interface Props {
  panelIndex: number;
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export const PanelRiskRewardToolbar: React.FC<Props> = ({ panelIndex, chartRef, seriesRef }) => {
  const panel = useMultiPanelStore((s) => s.panels[panelIndex]);
  const syncDrawings = useMultiPanelStore((s) => s.syncDrawings);
  const allPanels = useMultiPanelStore((s) => s.panels);
  
  const updatePanelRiskReward = useMultiPanelStore((s) => s.updatePanelRiskReward);
  const removePanelRiskReward = useMultiPanelStore((s) => s.removePanelRiskReward);
  const setPanelSelectedRiskRewardId = useMultiPanelStore((s) => s.setPanelSelectedRiskRewardId);

  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({ entry: 0, tp: 0, sl: 0 });
  
  if (!panel) return null;

  const riskRewardDrawings = React.useMemo(() => {
    if (!syncDrawings) return panel.riskRewardDrawings;
    const aggregated: RiskRewardDrawing[] = [];
    for (const p of Object.values(allPanels)) {
      if (p.symbol === panel.symbol) aggregated.push(...p.riskRewardDrawings);
    }
    return Array.from(new Map(aggregated.map(r => [r.id, r])).values());
  }, [syncDrawings, panel.riskRewardDrawings, panel.symbol, allPanels]);

  const selectedRR = riskRewardDrawings.find((r) => r.id === panel.selectedRiskRewardId);

  useEffect(() => {
    if (!selectedRR || !chartRef.current || !seriesRef.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series || !selectedRR) return;

      const timeToPixel = (t: number) => {
        const px = chart.timeScale().timeToCoordinate(t as unknown as Time);
        if (px !== null) return px;
        const c = panel.candles;
        if (c.length < 2) return null;
        const lastTime = c[c.length - 1].time;
        const interval = c[c.length - 1].time - c[c.length - 2].time;
        const lastX = chart.timeScale().timeToCoordinate(lastTime as unknown as Time);
        const prevX = chart.timeScale().timeToCoordinate(c[c.length - 2].time as unknown as Time);
        if (lastX === null || prevX === null) return null;
        const pxPerBar = lastX - prevX;
        if (pxPerBar <= 0) return null;
        return lastX + ((t - lastTime) / interval) * pxPerBar;
      };

      const x = timeToPixel(selectedRR.entryTime);
      const y = series.priceToCoordinate(Math.max(selectedRR.takeProfit, selectedRR.stopLoss));

      if (x === null || y === null) {
        setPosition(null);
        return;
      }

      setPosition({ x: x + 60, y: Math.max(8, y - 40) });
    };

    updatePosition();
    const interval = setInterval(updatePosition, 100);
    return () => clearInterval(interval);
  }, [selectedRR, chartRef, seriesRef, panel.candles]);

  if (!selectedRR || !position) return null;

  const isLong = selectedRR.stopLoss < selectedRR.entryPrice;

  const flipSetup = () => {
    const risk = Math.abs(selectedRR.entryPrice - selectedRR.stopLoss);
    const reward = Math.abs(selectedRR.takeProfit - selectedRR.entryPrice);
    
    if (isLong) {
      updatePanelRiskReward(panelIndex, selectedRR.id, {
        stopLoss: selectedRR.entryPrice + risk,
        takeProfit: selectedRR.entryPrice - reward
      });
    } else {
      updatePanelRiskReward(panelIndex, selectedRR.id, {
        stopLoss: selectedRR.entryPrice - risk,
        takeProfit: selectedRR.entryPrice + reward
      });
    }
  };

  const handleDelete = () => {
    removePanelRiskReward(panelIndex, selectedRR.id);
    setPanelSelectedRiskRewardId(panelIndex, null);
  };

  const handleEditOpen = () => {
    setEditValues({
      entry: selectedRR.entryPrice,
      tp: selectedRR.takeProfit,
      sl: selectedRR.stopLoss,
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updatePanelRiskReward(panelIndex, selectedRR.id, {
      entryPrice: editValues.entry,
      takeProfit: editValues.tp,
      stopLoss: editValues.sl,
    });
    setIsEditing(false);
  };

  return (
    <div
      className="absolute z-30 flex items-center gap-0.5 rounded-md px-1 py-0.5 shadow-lg border pointer-events-auto"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translateX(-50%)',
        background: 'hsl(var(--popover))',
        borderColor: 'hsl(var(--border))',
      }}
    >
      {isEditing ? (
        <div className="flex items-center gap-2 p-1 px-2 text-xs text-foreground">
          <div className="flex flex-col gap-1 w-20">
            <label className="text-[9px] text-muted-foreground uppercase">Entry</label>
            <input 
              type="number" step="0.01" 
              className="bg-accent/50 rounded px-1 py-0.5 w-full outline-none no-spinners" 
              value={editValues.entry} 
              onChange={e => setEditValues(v => ({ ...v, entry: parseFloat(e.target.value) || 0 }))} 
            />
          </div>
          <div className="flex flex-col gap-1 w-20">
            <label className="text-[9px] text-green-500 uppercase">TP</label>
            <input 
              type="number" step="0.01" 
              className="bg-green-500/10 text-green-400 rounded px-1 py-0.5 w-full outline-none no-spinners" 
              value={editValues.tp} 
              onChange={e => setEditValues(v => ({ ...v, tp: parseFloat(e.target.value) || 0 }))} 
            />
          </div>
          <div className="flex flex-col gap-1 w-20">
            <label className="text-[9px] text-red-500 uppercase">SL</label>
            <input 
              type="number" step="0.01" 
              className="bg-red-500/10 text-red-400 rounded px-1 py-0.5 w-full outline-none no-spinners" 
              value={editValues.sl} 
              onChange={e => setEditValues(v => ({ ...v, sl: parseFloat(e.target.value) || 0 }))} 
            />
          </div>
          <div className="w-px h-6 bg-border mx-1" />
          <ToolbarBtn icon={<Check size={13} />} tooltip="Save" onClick={handleSave} className="text-green-500" />
          <ToolbarBtn icon={<X size={13} />} tooltip="Cancel" onClick={() => setIsEditing(false)} />
        </div>
      ) : (
        <>
          <ToolbarBtn
            icon={<Settings2 size={13} />}
            tooltip="Settings"
            onClick={handleEditOpen}
          />
          <ToolbarBtn
            icon={isLong ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
            tooltip={`Flip to ${isLong ? 'Short' : 'Long'}`}
            onClick={flipSetup}
          />
          <div className="w-px h-4 mx-0.5" style={{ background: 'hsl(var(--border))' }} />
          <ToolbarBtn
            icon={<Trash2 size={13} />}
            tooltip="Delete"
            onClick={handleDelete}
            destructive
          />
        </>
      )}
    </div>
  );
};

const ToolbarBtn: React.FC<{
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  destructive?: boolean;
  className?: string;
}> = ({ icon, tooltip, onClick, destructive, className }) => (
  <button
    onClick={onClick}
    title={tooltip}
    className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${className || ''}`}
    style={{
      color: destructive ? 'hsl(var(--destructive))' : className ? undefined : 'hsl(var(--muted-foreground))',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'hsl(var(--accent))';
      if (!destructive) e.currentTarget.style.color = 'hsl(var(--foreground))';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'transparent';
      if (!destructive) e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
    }}
  >
    {icon}
  </button>
);
