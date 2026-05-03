import React, { useState } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { Bell, AlertTriangle, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

export const BottomPanel: React.FC = () => {
  const { alertLogs } = useChartStore();
  const [collapsed, setCollapsed] = useState(false);

  // Collapsed: show a thin bar with a button to expand
  if (collapsed) {
    return (
      <div className="h-6 border-t border-border bg-card flex items-center px-3">
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          title="Show alert log"
        >
          <ChevronUp size={12} />
          <Bell size={10} />
          Alert Log{alertLogs.length > 0 && ` (${alertLogs.length})`}
        </button>
      </div>
    );
  }

  if (alertLogs.length === 0) {
    return (
      <div className="h-8 border-t border-border bg-card flex items-center justify-between px-3">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Bell size={12} />
          No alerts triggered
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Hide alert log"
        >
          <ChevronDown size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="h-24 border-t border-border bg-card overflow-y-auto">
      <div className="px-3 py-1 border-b border-border sticky top-0 bg-card flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Alert Log ({alertLogs.length})
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => useChartStore.getState().clearAlertLogs()}
            className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
            title="Clear all alert logs"
          >
            <Trash2 size={10} />
            Clear
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Hide alert log"
          >
            <ChevronDown size={12} />
          </button>
        </div>
      </div>
      {alertLogs.map((log) => (
        <div
          key={log.id}
          className="flex items-center gap-2 px-3 py-1 text-xs border-b border-border/50"
        >
          <AlertTriangle size={12} className="text-destructive flex-shrink-0" />
          <span className="text-foreground flex-1">{log.message}</span>
          <span className="text-muted-foreground font-mono">{log.price.toFixed(2)}</span>
          <span className="text-muted-foreground font-mono">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
};
