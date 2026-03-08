import React from 'react';
import { useChartStore } from '@/stores/chartStore';
import { Bell, AlertTriangle, Trash2 } from 'lucide-react';

export const BottomPanel: React.FC = () => {
  const { alertLogs } = useChartStore();

  if (alertLogs.length === 0) {
    return (
      <div className="h-8 border-t border-border bg-card flex items-center px-3">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Bell size={12} />
          No alerts triggered
        </span>
      </div>
    );
  }

  return (
    <div className="h-24 border-t border-border bg-card overflow-y-auto">
      <div className="px-3 py-1 border-b border-border sticky top-0 bg-card flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Alert Log ({alertLogs.length})
        </span>
        <button
          onClick={() => useChartStore.getState().clearAlertLogs()}
          className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
          title="Clear all alert logs"
        >
          <Trash2 size={10} />
          Clear
        </button>
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