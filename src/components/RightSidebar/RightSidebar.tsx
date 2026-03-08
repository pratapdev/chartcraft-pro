import React from 'react';
import { useChartStore } from '@/stores/chartStore';
import { X, Bell, BarChart3, Settings, Trash2, Plus, Eye, EyeOff } from 'lucide-react';

export const RightSidebar: React.FC = () => {
  const {
    rightPanelOpen,
    rightPanelTab,
    setRightPanelOpen,
    alerts,
    alertLogs,
    removeAlert,
    indicators,
    toggleIndicator,
    removeIndicator,
    trendlines,
  } = useChartStore();

  if (!rightPanelOpen) return null;

  return (
    <div className="w-64 bg-card border-l border-border flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-panel-header">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {rightPanelTab}
        </span>
        <button
          onClick={() => setRightPanelOpen(false)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {rightPanelTab === 'alerts' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground px-1">
              {alerts.length === 0 ? 'No alerts set. Select a trendline and create an alert.' : `${alerts.length} active alert(s)`}
            </p>
            {alerts.map((alert) => (
              <div key={alert.id} className="panel-section rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-foreground">{alert.condition.replace('_', ' ')}</span>
                  <button onClick={() => removeAlert(alert.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="text-muted-foreground mt-1">{alert.symbol} · {alert.timeframe}</div>
              </div>
            ))}

            {alertLogs.length > 0 && (
              <>
                <div className="text-xs font-semibold text-muted-foreground mt-4 px-1">Recent Alerts</div>
                {alertLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="panel-section rounded p-2 text-xs">
                    <div className="text-foreground">{log.message}</div>
                    <div className="text-muted-foreground mt-1">
                      {new Date(log.timestamp).toLocaleTimeString()} · {log.price.toFixed(2)}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {rightPanelTab === 'indicators' && (
          <div className="space-y-2">
            {indicators.map((ind) => (
              <div key={ind.id} className="panel-section rounded p-2 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: ind.color }} />
                  <span className="text-foreground">{ind.type}({ind.period})</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleIndicator(ind.id)} className="text-muted-foreground hover:text-foreground">
                    {ind.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button onClick={() => removeIndicator(ind.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {rightPanelTab === 'settings' && (
          <div className="space-y-3 text-xs text-muted-foreground p-1">
            <div>
              <p className="font-semibold text-foreground mb-1">Trendlines</p>
              <p>{trendlines.length} line(s) drawn</p>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Shortcuts</p>
              <div className="space-y-1">
                <p><kbd className="bg-accent px-1 rounded text-foreground">Delete</kbd> Remove selected line</p>
                <p><kbd className="bg-accent px-1 rounded text-foreground">Esc</kbd> Cancel drawing</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
