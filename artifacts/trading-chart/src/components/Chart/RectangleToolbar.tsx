import React, { useEffect, useState, useRef } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { RectangleAlertCondition, LineStyleType } from '@/types/trading';
import {
  Bell,
  Trash2,
  X,
  TrendingUp,
  Square
} from 'lucide-react';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

const COLORS = ['#2563eb', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', 'transparent'];
const THICKNESSES = [1, 2, 3, 4];
const LINE_STYLES: { value: LineStyleType; label: string; dash: number[] }[] = [
  { value: 'solid', label: 'Solid', dash: [] },
  { value: 'dashed', label: 'Dashed', dash: [6, 4] },
  { value: 'dotted', label: 'Dotted', dash: [2, 2] },
];

export const RectangleToolbar: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const {
    selectedRectangleId,
    rectangleDrawings,
    updateRectangle,
    removeRectangle,
    setSelectedRectangleId,
    addRectangleAlert,
    rectangleAlerts,
    symbol,
    timeframe,
    setRightPanelTab,
  } = useChartStore();

  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [showStrokeColors, setShowStrokeColors] = useState(false);
  const [showFillColors, setShowFillColors] = useState(false);
  const [showThickness, setShowThickness] = useState(false);
  const [showLineStyle, setShowLineStyle] = useState(false);
  const [showAlertMenu, setShowAlertMenu] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const selectedRect = rectangleDrawings.find((t) => t.id === selectedRectangleId);

  // Calculate toolbar position above the midpoint of the selected rectangle
  useEffect(() => {
    if (!selectedRect || !chartRef.current || !seriesRef.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series || !selectedRect) return;

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

      const x1 = timeToPixel(selectedRect.startTime);
      const x2 = timeToPixel(selectedRect.endTime);
      const y1 = series.priceToCoordinate(selectedRect.startPrice);
      const y2 = series.priceToCoordinate(selectedRect.endPrice);

      if (x1 === null || x2 === null || y1 === null || y2 === null) {
        setPosition(null);
        return;
      }

      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1 as number, y2 as number);

      const midX = (minX + maxX) / 2;
      const topY = minY - 48; // Position above the highest point

      setPosition({ x: midX, y: Math.max(8, topY) });
    };

    updatePosition();
    const interval = setInterval(updatePosition, 100);
    return () => clearInterval(interval);
  }, [selectedRect, chartRef, seriesRef]);

  // Close submenus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowStrokeColors(false);
        setShowFillColors(false);
        setShowThickness(false);
        setShowLineStyle(false);
        setShowAlertMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!selectedRect || !position) return null;

  const existingAlerts = rectangleAlerts.filter((a) => a.rectangleId === selectedRect.id);

  const handleCreateAlert = (condition: RectangleAlertCondition) => {
    addRectangleAlert({
      id: crypto.randomUUID(),
      symbol,
      timeframe,
      rectangleId: selectedRect.id,
      condition,
      active: true,
      triggered: false,
      createdAt: Date.now(),
    });
    setShowAlertMenu(false);
    setRightPanelTab('alerts');
  };

  const handleDelete = () => {
    removeRectangle(selectedRect.id);
    setSelectedRectangleId(null);
  };

  const closeAllMenus = () => {
    setShowStrokeColors(false);
    setShowFillColors(false);
    setShowThickness(false);
    setShowLineStyle(false);
    setShowAlertMenu(false);
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
            const current = showAlertMenu;
            closeAllMenus();
            setShowAlertMenu(!current);
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
              label="Touches Box"
              description="Price enters or touches box"
              onClick={() => handleCreateAlert('touches_box')}
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
                        useChartStore.getState().removeRectangleAlert(a.id);
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

      {/* Stroke Color */}
      <div className="relative">
        <ToolbarBtn
          icon={
            <div
              className="w-3 h-3 rounded border"
              style={{ background: selectedRect.color === 'transparent' ? 'transparent' : selectedRect.color, borderColor: 'hsl(var(--border))' }}
            />
          }
          tooltip="Border Color"
          active={showStrokeColors}
          onClick={() => {
            const current = showStrokeColors;
            closeAllMenus();
            setShowStrokeColors(!current);
          }}
        />
        {showStrokeColors && (
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
                className="w-6 h-6 rounded border-2 transition-transform hover:scale-110 flex items-center justify-center relative overflow-hidden"
                style={{
                  background: c === 'transparent' ? 'transparent' : c,
                  borderColor: selectedRect.color === c ? 'hsl(var(--foreground))' : 'transparent',
                }}
                onClick={() => {
                  updateRectangle(selectedRect.id, { color: c });
                  setShowStrokeColors(false);
                }}
              >
                {c === 'transparent' && <div className="absolute w-full h-[2px] bg-red-500 rotate-45" />}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Fill Color */}
      <div className="relative">
        <ToolbarBtn
          icon={
            <div className="relative flex items-center justify-center">
               <Square size={14} fill={selectedRect.fillColor} color="hsl(var(--border))" />
            </div>
          }
          tooltip="Fill Color"
          active={showFillColors}
          onClick={() => {
            const current = showFillColors;
            closeAllMenus();
            setShowFillColors(!current);
          }}
        />
        {showFillColors && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex flex-col gap-2 p-3 rounded-md border shadow-xl"
            style={{
              background: 'hsl(var(--popover))',
              borderColor: 'hsl(var(--border))',
              minWidth: '120px',
            }}
          >
            <div className="grid grid-cols-4 gap-2">
              {COLORS.map((c) => {
                const isTransparent = c === 'transparent';
                // Extract current opacity, default to 20% (0.2) if not found
                let currentOpacity = 0.2;
                let currentBase = selectedRect.fillColor;
                if (selectedRect.fillColor.startsWith('rgba')) {
                  const match = selectedRect.fillColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/);
                  if (match) currentOpacity = parseFloat(match[1]);
                } else if (selectedRect.fillColor.startsWith('#') && selectedRect.fillColor.length === 9) {
                  currentOpacity = parseInt(selectedRect.fillColor.slice(7, 9), 16) / 255;
                }
                const alphaHex = Math.round(currentOpacity * 255).toString(16).padStart(2, '0');
                const fill = isTransparent ? 'transparent' : `${c}${alphaHex}`; 
                
                // For the border highlighting, check base color
                let isSelectedBase = false;
                if (isTransparent) {
                   isSelectedBase = selectedRect.fillColor === 'transparent';
                } else {
                   if (selectedRect.fillColor.startsWith('#')) {
                      isSelectedBase = selectedRect.fillColor.toLowerCase().startsWith(c.toLowerCase());
                   } else {
                      // rough fallback for rgba defaults
                      isSelectedBase = selectedRect.color.toLowerCase() === c.toLowerCase();
                   }
                }

                return (
                  <button
                    key={c}
                    className="w-6 h-6 rounded border-2 transition-transform hover:scale-110 flex items-center justify-center relative overflow-hidden"
                    style={{
                      background: fill,
                      borderColor: isSelectedBase ? 'hsl(var(--foreground))' : 'transparent',
                    }}
                    onClick={() => {
                      updateRectangle(selectedRect.id, { fillColor: fill });
                    }}
                  >
                    {isTransparent && <div className="absolute w-full h-[2px] bg-red-500 rotate-45" />}
                  </button>
                );
              })}
            </div>
            {selectedRect.fillColor !== 'transparent' && (
              <div className="pt-2 mt-1 flex flex-col gap-1 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="flex justify-between items-center">
                  <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>Opacity</span>
                  <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {(() => {
                      if (selectedRect.fillColor.startsWith('rgba')) {
                        const match = selectedRect.fillColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/);
                        return match ? Math.round(parseFloat(match[1]) * 100) : 20;
                      } else if (selectedRect.fillColor.startsWith('#') && selectedRect.fillColor.length === 9) {
                        return Math.round((parseInt(selectedRect.fillColor.slice(7, 9), 16) / 255) * 100);
                      }
                      return 20;
                    })()}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={(() => {
                    if (selectedRect.fillColor.startsWith('rgba')) {
                      const match = selectedRect.fillColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/);
                      return match ? Math.round(parseFloat(match[1]) * 100) : 20;
                    } else if (selectedRect.fillColor.startsWith('#') && selectedRect.fillColor.length === 9) {
                      return Math.round((parseInt(selectedRect.fillColor.slice(7, 9), 16) / 255) * 100);
                    }
                    return 20;
                  })()}
                  onChange={(e) => {
                    const opacity = parseInt(e.target.value) / 100;
                    const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
                    let baseColor = selectedRect.color;
                    if (selectedRect.fillColor.startsWith('#') && selectedRect.fillColor.length === 9) {
                       baseColor = selectedRect.fillColor.slice(0, 7);
                    }
                    if (baseColor === 'transparent') baseColor = '#2563eb';
                    updateRectangle(selectedRect.id, { fillColor: `${baseColor}${alphaHex}` });
                  }}
                  className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                  style={{ background: 'hsl(var(--border))' }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Thickness */}
      <div className="relative">
        <ToolbarBtn
          icon={
            <div className="flex flex-col items-center justify-center gap-[2px]">
              <div className="rounded-full" style={{ width: 12, height: selectedRect.thickness, background: 'hsl(var(--foreground))' }} />
            </div>
          }
          tooltip="Thickness"
          active={showThickness}
          onClick={() => {
            const current = showThickness;
            closeAllMenus();
            setShowThickness(!current);
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
                  background: selectedRect.thickness === t ? 'hsl(var(--accent))' : 'transparent',
                }}
                onClick={() => {
                  updateRectangle(selectedRect.id, { thickness: t });
                  setShowThickness(false);
                }}
              >
                <div className="rounded-full" style={{ width: 20, height: t, background: selectedRect.color === 'transparent' ? 'hsl(var(--foreground))' : selectedRect.color }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Line Style */}
      <div className="relative">
        <ToolbarBtn
          icon={
            <svg width="14" height="10" viewBox="0 0 14 10">
              {(selectedRect.lineStyle ?? 'solid') === 'solid' && (
                <line x1="0" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth="2" />
              )}
              {(selectedRect.lineStyle ?? 'solid') === 'dashed' && (
                <line x1="0" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2" />
              )}
              {(selectedRect.lineStyle ?? 'solid') === 'dotted' && (
                <line x1="0" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray="1.5 2" />
              )}
            </svg>
          }
          tooltip="Line Style"
          active={showLineStyle}
          onClick={() => {
            const current = showLineStyle;
            closeAllMenus();
            setShowLineStyle(!current);
          }}
        />
        {showLineStyle && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex flex-col gap-1 p-2 rounded-md border shadow-xl"
            style={{
              background: 'hsl(var(--popover))',
              borderColor: 'hsl(var(--border))',
              minWidth: '90px',
            }}
          >
            {LINE_STYLES.map((s) => (
              <button
                key={s.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded transition-colors"
                style={{
                  background: (selectedRect.lineStyle ?? 'solid') === s.value ? 'hsl(var(--accent))' : 'transparent',
                }}
                onClick={() => {
                  updateRectangle(selectedRect.id, { lineStyle: s.value });
                  setShowLineStyle(false);
                }}
              >
                <svg width="24" height="6" viewBox="0 0 24 6">
                  <line
                    x1="0" y1="3" x2="24" y2="3"
                    stroke={selectedRect.color === 'transparent' ? 'hsl(var(--foreground))' : selectedRect.color}
                    strokeWidth={selectedRect.thickness}
                    strokeDasharray={s.value === 'dashed' ? '6 4' : s.value === 'dotted' ? '2 2' : 'none'}
                  />
                </svg>
                <span className="text-[10px]" style={{ color: 'hsl(var(--foreground))' }}>{s.label}</span>
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
