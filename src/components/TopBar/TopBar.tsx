import React from 'react';
import { useChartStore } from '@/stores/chartStore';
import { Search, Bell, BarChart3, Maximize2, ChevronDown } from 'lucide-react';

const SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'TSLA', 'MSFT', 'SPY'];

export const TopBar: React.FC = () => {
  const { symbol, setSymbol, setRightPanelTab, alertLogs } = useChartStore();
  const [showSymbols, setShowSymbols] = React.useState(false);

  return (
    <div className="h-10 bg-card border-b border-border flex items-center px-2 gap-2 relative">
      {/* Symbol selector */}
      <div className="relative">
        <button
          onClick={() => setShowSymbols(!showSymbols)}
          className="flex items-center gap-1 trading-btn font-semibold text-foreground"
        >
          <Search size={14} className="text-muted-foreground" />
          {symbol}
          <ChevronDown size={12} />
        </button>

        {showSymbols && (
          <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded shadow-lg z-50 min-w-[140px]">
            {SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => { setSymbol(s); setShowSymbols(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors ${
                  s === symbol ? 'text-primary' : 'text-foreground'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Right actions */}
      <button
        onClick={() => setRightPanelTab('indicators')}
        className="trading-btn flex items-center gap-1"
      >
        <BarChart3 size={14} />
        Indicators
      </button>

      <button
        onClick={() => setRightPanelTab('alerts')}
        className="trading-btn flex items-center gap-1 relative"
      >
        <Bell size={14} />
        Alerts
        {alertLogs.length > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 absolute -top-0.5 -right-0.5" />
        )}
      </button>
    </div>
  );
};
