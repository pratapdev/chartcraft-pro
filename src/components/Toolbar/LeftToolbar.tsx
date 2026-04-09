import React, { useState } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { DrawingTool } from '@/types/trading';
import {
  MousePointer2,
  TrendingUp,
  Minus,
  SeparatorVertical,
  Bell,
  BarChart3,
  Settings,
  Trash2,
  Ruler,
  GitFork,
  Activity,
  Eraser,
  Diamond,
  Target,
  BarChart,
} from 'lucide-react';

interface ToolButton {
  id: DrawingTool | string;
  icon: React.ReactNode;
  label: string;
  action?: () => void;
}

export const LeftToolbar: React.FC = () => {
  const {
    activeTool,
    setActiveTool,
    selectedTrendlineId,
    removeTrendline,
    setRightPanelTab,
    indicators,
    addIndicator,
    trendlines,
    fibonacciDrawings,
    clearAllDrawings,
    clearAllIndicators,
  } = useChartStore();

  const [confirmDrawings, setConfirmDrawings] = useState(false);
  const [confirmIndicators, setConfirmIndicators] = useState(false);

  const tools: ToolButton[] = [
    { id: 'cursor', icon: <MousePointer2 size={18} />, label: 'Cursor' },
    { id: 'trendline', icon: <TrendingUp size={18} />, label: 'Trendline' },
    { id: 'horizontal', icon: <Minus size={18} />, label: 'Horizontal Line' },
    { id: 'vertical', icon: <SeparatorVertical size={18} />, label: 'Vertical Line' },
    { id: 'fibonacci', icon: <GitFork size={18} />, label: 'Fibonacci Retracement' },
    { id: 'riskreward', icon: <Target size={18} />, label: 'Risk/Reward' },
    { id: 'measure', icon: <Ruler size={18} />, label: 'Measure' },
  ];

  const handleToggleBBands = () => {
    const existing = indicators.find((i) => i.type === 'BBANDS');
    if (existing) {
      setRightPanelTab('indicators');
    } else {
      addIndicator({
        id: `bbands-${Date.now()}`,
        type: 'BBANDS',
        period: 20,
        color: '#2196F3',
        color2: 'rgba(33,150,243,0.08)',
        visible: true,
        stdDev: 2,
      });
      setRightPanelTab('indicators');
    }
  };

  const handleTogglePivotHL = () => {
    const existing = indicators.find((i) => i.type === 'PIVOT_HL');
    if (existing) {
      setRightPanelTab('indicators');
    } else {
      addIndicator({
        id: `pivot-hl-${Date.now()}`,
        type: 'PIVOT_HL',
        period: 5,
        color: '#22c55e',
        color2: '#ef4444',
        visible: true,
      });
      setRightPanelTab('indicators');
    }
  };

  const handleToggleVPVR = () => {
    const existing = indicators.find((i) => i.type === 'VPVR');
    if (existing) {
      setRightPanelTab('indicators');
    } else {
      addIndicator({
        id: `vpvr-${Date.now()}`,
        type: 'VPVR',
        period: 1,
        color: '#26a69a',
        visible: true,
      });
    }
  };

  const hasBBands = indicators.some((i) => i.type === 'BBANDS' && i.visible);
  const hasPivotHL = indicators.some((i) => i.type === 'PIVOT_HL' && i.visible);
  const hasVPVR = indicators.some((i) => i.type === 'VPVR' && i.visible);
  const hasDrawings = trendlines.length > 0 || fibonacciDrawings.length > 0;
  const hasIndicators = indicators.length > 0;

  const actions: ToolButton[] = [
    { id: 'bbands', icon: <Activity size={18} />, label: 'Bollinger Bands', action: handleToggleBBands },
    { id: 'pivot-hl', icon: <Diamond size={18} />, label: 'Pivot Points H/L', action: handleTogglePivotHL },
    { id: 'vpvr', icon: <BarChart size={18} />, label: 'Volume Profile (VPVR)', action: handleToggleVPVR },
    { id: 'alerts', icon: <Bell size={18} />, label: 'Alerts', action: () => setRightPanelTab('alerts') },
    { id: 'indicators', icon: <BarChart3 size={18} />, label: 'Indicators', action: () => setRightPanelTab('indicators') },
    { id: 'settings', icon: <Settings size={18} />, label: 'Settings', action: () => setRightPanelTab('settings') },
  ];

  return (
    <div className="flex flex-col items-center w-11 bg-card border-r border-border py-2 gap-1">
      {/* Drawing tools */}
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id as DrawingTool)}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            activeTool === tool.id
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          title={tool.label}
        >
          {tool.icon}
        </button>
      ))}

      <div className="w-5 h-px bg-border my-1" />

      {/* Actions */}
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={action.action}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            (action.id === 'bbands' && hasBBands) || (action.id === 'pivot-hl' && hasPivotHL) || (action.id === 'vpvr' && hasVPVR)
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          title={action.label}
        >
          {action.icon}
        </button>
      ))}

      <div className="flex-1" />

      {/* Clear all drawings */}
      {hasDrawings && (
        <div className="relative">
          <button
            onClick={() => {
              if (confirmDrawings) {
                clearAllDrawings();
                setConfirmDrawings(false);
              } else {
                setConfirmDrawings(true);
                setConfirmIndicators(false);
                setTimeout(() => setConfirmDrawings(false), 3000);
              }
            }}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
              confirmDrawings
                ? 'bg-destructive/15 text-destructive'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title={confirmDrawings ? 'Click again to confirm' : 'Delete all drawings'}
          >
            <Eraser size={16} />
          </button>
          {confirmDrawings && (
            <div className="absolute left-10 top-0 bg-popover border border-border rounded px-2 py-1 text-[10px] text-destructive whitespace-nowrap shadow-lg z-50">
              Click again to delete all drawings
            </div>
          )}
        </div>
      )}

      {/* Clear all indicators */}
      {hasIndicators && (
        <div className="relative">
          <button
            onClick={() => {
              if (confirmIndicators) {
                clearAllIndicators();
                setConfirmIndicators(false);
              } else {
                setConfirmIndicators(true);
                setConfirmDrawings(false);
                setTimeout(() => setConfirmIndicators(false), 3000);
              }
            }}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
              confirmIndicators
                ? 'bg-destructive/15 text-destructive'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title={confirmIndicators ? 'Click again to confirm' : 'Delete all indicators'}
          >
            <BarChart3 size={16} className={confirmIndicators ? '' : 'opacity-60'} />
            <Trash2 size={8} className="absolute bottom-1 right-1" />
          </button>
          {confirmIndicators && (
            <div className="absolute left-10 top-0 bg-popover border border-border rounded px-2 py-1 text-[10px] text-destructive whitespace-nowrap shadow-lg z-50">
              Click again to delete all indicators
            </div>
          )}
        </div>
      )}

      {/* Delete selected */}
      {selectedTrendlineId && (
        <button
          onClick={() => removeTrendline(selectedTrendlineId)}
          className="w-8 h-8 flex items-center justify-center rounded text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete selected"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
};
