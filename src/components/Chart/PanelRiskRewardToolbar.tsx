import React, { useEffect, useState, useRef } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useMultiPanelStore } from '@/stores/multiPanelStore';
import { RiskRewardDrawing } from '@/types/trading';
import { Trash2, TrendingUp, TrendingDown } from 'lucide-react';

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
    </div>
  );
};

const ToolbarBtn: React.FC<{
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  destructive?: boolean;
}> = ({ icon, tooltip, onClick, destructive }) => (
  <button
    onClick={onClick}
    title={tooltip}
    className="flex items-center justify-center w-7 h-7 rounded transition-colors"
    style={{
      color: destructive ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))',
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
