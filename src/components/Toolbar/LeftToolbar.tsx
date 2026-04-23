import React, { useState } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { useMultiPanelStore } from '@/stores/multiPanelStore';
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
  Zap,
  Layers,
  AlignLeft,
} from 'lucide-react';
import { HTFControls } from '@/components/Chart/HTFControls';

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
    multiTfMode,
  } = useChartStore();

  // Multi-panel store for routing in multi-TF mode
  const activePanelIndex = useMultiPanelStore((s) => s.activePanelIndex);
  const activePanel = useMultiPanelStore((s) => s.panels[s.activePanelIndex]);
  const setPanelActiveTool = useMultiPanelStore((s) => s.setPanelActiveTool);
  const addPanelIndicator = useMultiPanelStore((s) => s.addPanelIndicator);
  const clearPanelDrawings = useMultiPanelStore((s) => s.clearPanelDrawings);
  const clearPanelIndicators = useMultiPanelStore((s) => s.clearPanelIndicators);
  const removePanelTrendline = useMultiPanelStore((s) => s.removePanelTrendline);

  // Route to the correct state source
  const currentActiveTool = multiTfMode ? (activePanel?.activeTool ?? 'cursor') : activeTool;
  const currentIndicators = multiTfMode ? (activePanel?.indicators ?? []) : indicators;
  const currentTrendlines = multiTfMode ? (activePanel?.trendlines ?? []) : trendlines;
  const currentFibs = multiTfMode ? (activePanel?.fibonacciDrawings ?? []) : fibonacciDrawings;
  const currentSelectedId = multiTfMode ? (activePanel?.selectedTrendlineId ?? null) : selectedTrendlineId;

  const [confirmDrawings, setConfirmDrawings] = useState(false);
  const [confirmIndicators, setConfirmIndicators] = useState(false);
  const [showHTF, setShowHTF] = useState(false);
  const hasHTF = useChartStore((s) => s.htfOverlay.layers.some(l => l.enabled));

  // ─── Routed actions ──────────────────────────────────────────

  const handleSetTool = (tool: DrawingTool) => {
    if (multiTfMode) {
      setPanelActiveTool(activePanelIndex, tool);
    } else {
      setActiveTool(tool);
    }
  };

  const handleDeleteSelected = () => {
    if (multiTfMode && currentSelectedId) {
      removePanelTrendline(activePanelIndex, currentSelectedId);
    } else if (selectedTrendlineId) {
      removeTrendline(selectedTrendlineId);
    }
  };

  const handleClearDrawings = () => {
    if (multiTfMode) {
      clearPanelDrawings(activePanelIndex);
    } else {
      clearAllDrawings();
    }
  };

  const handleClearIndicators = () => {
    if (multiTfMode) {
      clearPanelIndicators(activePanelIndex);
    } else {
      clearAllIndicators();
    }
  };

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
    const existing = currentIndicators.find((i) => i.type === 'BBANDS');
    if (existing) {
      setRightPanelTab('indicators');
    } else {
      const ind = {
        id: `bbands-${Date.now()}`,
        type: 'BBANDS' as const,
        period: 20,
        color: '#2196F3',
        color2: 'rgba(33,150,243,0.08)',
        visible: true,
        stdDev: 2,
      };
      if (multiTfMode) {
        addPanelIndicator(activePanelIndex, ind);
      } else {
        addIndicator(ind);
      }
      setRightPanelTab('indicators');
    }
  };

  const handleTogglePivotHL = () => {
    const existing = currentIndicators.find((i) => i.type === 'PIVOT_HL');
    if (existing) {
      setRightPanelTab('indicators');
    } else {
      const ind = {
        id: `pivot-hl-${Date.now()}`,
        type: 'PIVOT_HL' as const,
        period: 5,
        color: '#22c55e',
        color2: '#ef4444',
        visible: true,
      };
      if (multiTfMode) {
        addPanelIndicator(activePanelIndex, ind);
      } else {
        addIndicator(ind);
      }
      setRightPanelTab('indicators');
    }
  };

  const handleToggleVPVR = () => {
    const existing = currentIndicators.find((i) => i.type === 'VPVR');
    if (existing) {
      setRightPanelTab('indicators');
    } else {
      const ind = {
        id: `vpvr-${Date.now()}`,
        type: 'VPVR' as const,
        period: 1,
        color: '#26a69a',
        visible: true,
      };
      if (multiTfMode) {
        addPanelIndicator(activePanelIndex, ind);
      } else {
        addIndicator(ind);
      }
    }
  };

  const handleToggleTPO = () => {
    const existing = currentIndicators.find((i) => i.type === 'TPO');
    if (existing) {
      setRightPanelTab('indicators');
    } else {
      const ind = {
        id: `tpo-${Date.now()}`,
        type: 'TPO' as const,
        period: 1, // Doesn't strictly need a period, but keeping schema happy
        color: '#ff9800', // Orange color for TPO blocks
        visible: true,
      };
      if (multiTfMode) {
        addPanelIndicator(activePanelIndex, ind);
      } else {
        addIndicator(ind);
      }
    }
  };

  const handleToggleImbalance = () => {
    const existing = currentIndicators.find((i) => i.type === 'IMBALANCE');
    if (existing) {
      setRightPanelTab('indicators');
    } else {
      const ind = {
        id: `imbalance-${Date.now()}`,
        type: 'IMBALANCE' as const,
        period: 1,
        color: '#0096FF',
        visible: true,
        threshold: 3,
        minStack: 3,
      };
      if (multiTfMode) {
        addPanelIndicator(activePanelIndex, ind);
      } else {
        addIndicator(ind);
      }
    }
  };

  const hasBBands = currentIndicators.some((i) => i.type === 'BBANDS' && i.visible);
  const hasPivotHL = currentIndicators.some((i) => i.type === 'PIVOT_HL' && i.visible);
  const hasVPVR = currentIndicators.some((i) => i.type === 'VPVR' && i.visible);
  const hasTPO = currentIndicators.some((i) => i.type === 'TPO' && i.visible);
  const hasImbalance = currentIndicators.some((i) => i.type === 'IMBALANCE' && i.visible);
  const hasDrawings = currentTrendlines.length > 0 || currentFibs.length > 0;
  const hasIndicators = currentIndicators.length > 0;

  const actions: ToolButton[] = [
    { id: 'bbands', icon: <Activity size={18} />, label: 'Bollinger Bands', action: handleToggleBBands },
    { id: 'pivot-hl', icon: <Diamond size={18} />, label: 'Pivot Points H/L', action: handleTogglePivotHL },
    { id: 'vpvr', icon: <BarChart size={18} />, label: 'Volume Profile (VPVR)', action: handleToggleVPVR },
    { id: 'tpo', icon: <AlignLeft size={18} />, label: 'Market Profile (TPO)', action: handleToggleTPO },
    { id: 'imbalance', icon: <Zap size={18} />, label: 'Imbalance Detection', action: handleToggleImbalance },
    ...(!multiTfMode ? [{ id: 'htf-overlay', icon: <Layers size={18} />, label: 'HTF Overlay', action: () => setShowHTF(v => !v) }] : []),
    { id: 'alerts', icon: <Bell size={18} />, label: 'Alerts', action: () => setRightPanelTab('alerts') },
    { id: 'indicators', icon: <BarChart3 size={18} />, label: 'Indicators', action: () => setRightPanelTab('indicators') },
    { id: 'settings', icon: <Settings size={18} />, label: 'Settings', action: () => setRightPanelTab('settings') },
  ];

  return (
    <div className="flex flex-col items-center w-11 bg-card border-r border-border py-2 gap-1">
      {/* Active panel badge (only in multi-TF mode) */}
      {multiTfMode && (
        <div className="text-[8px] font-bold text-blue-400 bg-blue-500/15 rounded px-1.5 py-0.5 mb-1">
          P{activePanelIndex + 1}
        </div>
      )}

      {/* Drawing tools */}
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => handleSetTool(tool.id as DrawingTool)}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            currentActiveTool === tool.id
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
            (action.id === 'bbands' && hasBBands) || (action.id === 'pivot-hl' && hasPivotHL) || (action.id === 'vpvr' && hasVPVR) || (action.id === 'tpo' && hasTPO) || (action.id === 'imbalance' && hasImbalance) || (action.id === 'htf-overlay' && hasHTF)
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          title={action.label}
        >
          {action.icon}
        </button>
      ))}

      <div className="flex-1" />

      {!multiTfMode && showHTF && <HTFControls onClose={() => setShowHTF(false)} />}

      {/* Clear all drawings */}
      {hasDrawings && (
        <div className="relative">
          <button
            onClick={() => {
              if (confirmDrawings) {
                handleClearDrawings();
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
                handleClearIndicators();
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
      {currentSelectedId && (
        <button
          onClick={handleDeleteSelected}
          className="w-8 h-8 flex items-center justify-center rounded text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete selected"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
};
