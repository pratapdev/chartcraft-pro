import React, { useState, useRef, useEffect } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { Search, Bell, BarChart3, ChevronDown, Wifi, WifiOff } from 'lucide-react';

const SYMBOLS = [
  { name: 'BTC/USD', label: 'Bitcoin' },
  { name: 'ETH/USD', label: 'Ethereum' },
  { name: 'SOL/USD', label: 'Solana' },
  { name: 'BNB/USD', label: 'BNB' },
  { name: 'XRP/USD', label: 'Ripple' },
  { name: 'ADA/USD', label: 'Cardano' },
  { name: 'DOGE/USD', label: 'Dogecoin' },
  { name: 'AVAX/USD', label: 'Avalanche' },
];

export const TopBar: React.FC = () => {
  const { symbol, setSymbol, setRightPanelTab, alertLogs, connected } = useChartStore();
  const [showSymbols, setShowSymbols] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = SYMBOLS.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.label.toLowerCase().includes(search.toLowerCase())
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSymbols(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="h-10 bg-card border-b border-border flex items-center px-2 gap-2 relative">
      {/* Symbol selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => { setShowSymbols(!showSymbols); setSearch(''); }}
          className="flex items-center gap-1.5 trading-btn font-semibold text-foreground"
        >
          <Search size={13} className="text-muted-foreground" />
          {symbol}
          <ChevronDown size={12} className="text-muted-foreground" />
        </button>

        {showSymbols && (
          <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-xl z-50 min-w-[200px] overflow-hidden">
            <div className="p-2 border-b border-border">
              <input
                type="text"
                placeholder="Search symbol..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filtered.map((s) => (
                <button
                  key={s.name}
                  onClick={() => {
                    setSymbol(s.name);
                    setShowSymbols(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex items-center justify-between ${
                    s.name === symbol ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Connection status */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
        {connected ? (
          <Wifi size={13} className="text-bull" />
        ) : (
          <WifiOff size={13} className="text-bear" />
        )}
      </div>

      {/* Right actions */}
      <button
        onClick={() => setRightPanelTab('indicators')}
        className="trading-btn flex items-center gap-1"
      >
        <BarChart3 size={14} />
        <span className="hidden sm:inline">Indicators</span>
      </button>

      <button
        onClick={() => setRightPanelTab('alerts')}
        className="trading-btn flex items-center gap-1 relative"
      >
        <Bell size={14} />
        <span className="hidden sm:inline">Alerts</span>
        {alertLogs.length > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-destructive absolute -top-0.5 -right-0.5" />
        )}
      </button>
    </div>
  );
};
