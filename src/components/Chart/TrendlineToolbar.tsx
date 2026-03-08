import React, { useEffect, useState, useRef } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { Trendline, AlertCondition, LineStyleType } from '@/types/trading';
import {
  Bell,
  Trash2,
  Lock,
  Unlock,
  Palette,
  Settings2,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  X,
} from 'lucide-react';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

const COLORS = ['#2563eb', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const THICKNESSES = [1, 2, 3, 4];
const LINE_STYLES: { value: LineStyleType; label: string; dash: number[] }[] = [
  { value: 'solid', label: 'Solid', dash: [] },
  { value: 'dashed', label: 'Dashed', dash: [6, 4] },
  { value: 'dotted', label: 'Dotted', dash: [2, 2] },
];

export const TrendlineToolbar: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const {
    selectedTrendlineId,
    trendlines,
    updateTrendline,
    removeTrendline,
    setSelectedTrendlineId,
    addAlert,
    alerts,
    symbol,
    timeframe,
    setRightPanelTab,
  } = useChartStore();

  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [showColors, setShowColors] = useState(false);
  const [showThickness, setShowThickness] = useState(false);
  const [showLineStyle, setShowLineStyle] = useState(false);
  const [showAlertMenu, setShowAlertMenu] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const selectedLine = trendlines.find((t) => t.id === selectedTrendlineId);

  // Calculate toolbar position above the midpoint of the selected trendline
  useEffect(() => {
    if (!selectedLine || !chartRef.current || !seriesRef.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series || !selectedLine) return;

      const timeToPixel = (t: number) => {
        const px = chart.timeScale().timeToCoordinate(t as unknown as Time);
        if (px !== null) return px;
        const c = useChartStore.getState().candles;
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

      const x1 = timeToPixel(selectedLine.startTime);
      const x2 = timeToPixel(selectedLine.endTime);
      const y1 = series.priceToCoordinate(selectedLine.startPrice);
      const y2 = series.priceToCoordinate(selectedLine.endPrice);

      if (x1 === null || x2 === null || y1 === null || y2 === null) {
        setPosition(null);
        return;
      }

      const midX = (x1 + x2) / 2;
      const midY = Math.min(y1 as number, y2 as number) - 48;

      setPosition({ x: midX, y: Math.max(8, midY) });
    };

    updatePosition();
    const interval = setInterval(updatePosition, 100);
    return () => clearInterval(interval);
  }, [selectedLine, chartRef, seriesRef]);

  // Close submenus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowColors(false);
        setShowThickness(false);
        setShowLineStyle(false);
        setShowAlertMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!selectedLine || !position) return null;

  const existingAlerts = alerts.filter((a) => a.trendlineId === selectedLine.id);

  const handleCreateAlert = (condition: AlertCondition) => {
    addAlert({
      id: crypto.randomUUID(),
      symbol,
      timeframe,
      trendlineId: selectedLine.id,
      condition,
      active: true,
      triggered: false,
      createdAt: Date.now(),
    });
    setShowAlertMenu(false);
    setRightPanelTab('alerts');
  };

  const handleDelete = () => {
    removeTrendline(selectedLine.id);
    setSelectedTrendlineId(null);
  };

  return (
    <div
      ref={toolbarRef}
      className="absolute z-30 flex items-center gap-0.5 rounded-md px-1 py-0.5 shadow-lg border"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translateX(-50%)',
        background: 'hsl(var(--popover))',
        borderColor: 'hsl(var(--border))',
      }}
    >
      {/* Alert button */}
      <div className="relative">
        <ToolbarBtn
          icon={<Bell size={13} />}
          tooltip="Set Alert"
          active={showAlertMenu}
          onClick={() => {
            setShowAlertMenu(!showAlertMenu);
            setShowColors(false);
            setShowThickness(false);
            setShowLineStyle(false);
          }}
          badge={existingAlerts.length > 0 ? existingAlerts.length : undefined}
        />
        {showAlertMenu && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 rounded-md border shadow-xl p-1 space-y-0.5"
            style={{
              background: 'hsl(var(--popover))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Create Alert
            </div>
            <AlertOption
              icon={<TrendingUp size={13} />}
              label="Crossing Up"
              description="Price crosses above line"
              onClick={() => handleCreateAlert('cross_above')}
            />
            <AlertOption
              icon={<TrendingDown size={13} />}
              label="Crossing Down"
              description="Price crosses below line"
              onClick={() => handleCreateAlert('cross_below')}
            />
            <AlertOption
              icon={<ArrowUpDown size={13} />}
              label="Any Crossing"
              description="Price crosses in either direction"
              onClick={() => handleCreateAlert('cross_any')}
            />
            {existingAlerts.length > 0 && (
              <>
                <div className="border-t my-1" style={{ borderColor: 'hsl(var(--border))' }} />
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Active ({existingAlerts.length})
                </div>
                {existingAlerts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between px-2 py-1 rounded text-xs"
                    style={{ color: 'hsl(var(--foreground))' }}
                  >
                    <span>{a.condition.replace(/_/g, ' ')}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        useChartStore.getState().removeAlert(a.id);
                      }}
                      className="hover:text-destructive"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <Divider />

      {/* Color picker */}
      <div className="relative">
        <ToolbarBtn
          icon={
            <div
              className="w-3 h-3 rounded-full border"
              style={{ background: selectedLine.color, borderColor: 'hsl(var(--border))' }}
            />
          }
          tooltip="Color"
          active={showColors}
          onClick={() => {
            setShowColors(!showColors);
            setShowThickness(false);
            setShowLineStyle(false);
            setShowAlertMenu(false);
          }}
        />
        {showColors && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 grid grid-cols-4 gap-2 p-3 rounded-md border shadow-xl"
            style={{
              background: 'hsl(var(--popover))',
              borderColor: 'hsl(var(--border))',
              minWidth: '120px',
            }}
          >
            {COLORS.map((c) => (
              <button
                key={c}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  background: c,
                  borderColor: selectedLine.color === c ? 'hsl(var(--foreground))' : 'transparent',
                }}
                onClick={() => {
                  updateTrendline(selectedLine.id, { color: c });
                  setShowColors(false);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thickness */}
      <div className="relative">
        <ToolbarBtn
          icon={
            <div className="flex flex-col items-center justify-center gap-[2px]">
              <div className="rounded-full" style={{ width: 12, height: selectedLine.thickness, background: 'hsl(var(--foreground))' }} />
            </div>
          }
          tooltip="Thickness"
          active={showThickness}
          onClick={() => {
            setShowThickness(!showThickness);
            setShowColors(false);
            setShowLineStyle(false);
            setShowAlertMenu(false);
          }}
        />
        {showThickness && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex flex-col gap-1 p-2 rounded-md border shadow-xl"
            style={{
              background: 'hsl(var(--popover))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            {THICKNESSES.map((t) => (
              <button
                key={t}
                className="flex items-center gap-2 px-2 py-1 rounded transition-colors"
                style={{
                  background: selectedLine.thickness === t ? 'hsl(var(--accent))' : 'transparent',
                }}
                onClick={() => {
                  updateTrendline(selectedLine.id, { thickness: t });
                  setShowThickness(false);
                }}
              >
                <div className="rounded-full" style={{ width: 20, height: t, background: selectedLine.color }} />
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Delete */}
      <ToolbarBtn
        icon={<Trash2 size={13} />}
        tooltip="Delete"
        onClick={handleDelete}
        destructive
      />
    </div>
  );
};

// Sub-components

const ToolbarBtn: React.FC<{
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  active?: boolean;
  destructive?: boolean;
  badge?: number;
}> = ({ icon, tooltip, onClick, active, destructive, badge }) => (
  <button
    onClick={onClick}
    title={tooltip}
    className="relative flex items-center justify-center w-7 h-7 rounded transition-colors"
    style={{
      background: active ? 'hsl(var(--accent))' : 'transparent',
      color: destructive
        ? 'hsl(var(--destructive))'
        : active
          ? 'hsl(var(--foreground))'
          : 'hsl(var(--muted-foreground))',
    }}
    onMouseEnter={(e) => {
      if (!active) (e.currentTarget.style.background = 'hsl(var(--accent))');
      if (!destructive) e.currentTarget.style.color = 'hsl(var(--foreground))';
    }}
    onMouseLeave={(e) => {
      if (!active) (e.currentTarget.style.background = 'transparent');
      if (!destructive && !active) e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
    }}
  >
    {icon}
    {badge !== undefined && (
      <span
        className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center"
        style={{
          background: 'hsl(var(--primary))',
          color: 'hsl(var(--primary-foreground))',
        }}
      >
        {badge}
      </span>
    )}
  </button>
);

const AlertOption: React.FC<{
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}> = ({ icon, label, description, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left"
    style={{ color: 'hsl(var(--foreground))' }}
    onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--accent))')}
    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
  >
    <span style={{ color: 'hsl(var(--muted-foreground))' }}>{icon}</span>
    <div>
      <div className="font-medium">{label}</div>
      <div className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{description}</div>
    </div>
  </button>
);

const Divider = () => (
  <div className="w-px h-4 mx-0.5" style={{ background: 'hsl(var(--border))' }} />
);
