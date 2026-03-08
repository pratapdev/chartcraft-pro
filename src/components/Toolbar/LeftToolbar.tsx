import React from 'react';
import { useChartStore } from '@/stores/chartStore';
import { DrawingTool } from '@/types/trading';
import {
  MousePointer2,
  TrendingUp,
  Minus,
  Bell,
  BarChart3,
  Settings,
  Trash2,
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
  } = useChartStore();

  const tools: ToolButton[] = [
    { id: 'cursor', icon: <MousePointer2 size={18} />, label: 'Cursor' },
    { id: 'trendline', icon: <TrendingUp size={18} />, label: 'Trendline' },
    { id: 'horizontal', icon: <Minus size={18} />, label: 'Horizontal Line' },
  ];

  const actions: ToolButton[] = [
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
          className="w-8 h-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={action.label}
        >
          {action.icon}
        </button>
      ))}

      <div className="flex-1" />

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
