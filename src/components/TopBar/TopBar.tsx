import React, { useState, useRef, useEffect } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { Search, Bell, BarChart3, ChevronDown, Wifi, WifiOff, Plus, TrendingUp, Settings } from 'lucide-react';
import { INDIAN_STOCKS, getUpstoxCredentials, saveUpstoxCredentials } from '@/lib/upstoxData';
import { MarketType } from '@/types/trading';

const CRYPTO_SYMBOLS = [
  { name: 'BTC/USD', label: 'Bitcoin' },
  { name: 'ETH/USD', label: 'Ethereum' },
  { name: 'SOL/USD', label: 'Solana' },
  { name: 'BNB/USD', label: 'BNB' },
  { name: 'XRP/USD', label: 'Ripple' },
  { name: 'ADA/USD', label: 'Cardano' },
  { name: 'DOGE/USD', label: 'Dogecoin' },
  { name: 'AVAX/USD', label: 'Avalanche' },
];

function loadCustomPairs(): { name: string; label: string }[] {
  try {
    return JSON.parse(localStorage.getItem('custom-pairs') || '[]');
  } catch { return []; }
}

function saveCustomPairs(pairs: { name: string; label: string }[]) {
  localStorage.setItem('custom-pairs', JSON.stringify(pairs));
}

const MARKET_OPTIONS: { value: MarketType; label: string; icon: string }[] = [
  { value: 'crypto', label: 'Crypto', icon: '₿' },
  { value: 'indian', label: 'Indian Stocks', icon: '🇮🇳' },
];

const UpstoxCredentialsForm: React.FC = () => {
  const stored = getUpstoxCredentials();
  const [apiKey, setApiKey] = useState(stored.apiKey);
  const [accessToken, setAccessToken] = useState(stored.accessToken);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveUpstoxCredentials(apiKey, accessToken);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="border-t border-border p-2 space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
        <Settings size={10} />
        Upstox Credentials
      </div>
      <input
        type="password"
        placeholder="API Key"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        className="w-full bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none placeholder:text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
      />
      <input
        type="password"
        placeholder="Access Token"
        value={accessToken}
        onChange={(e) => setAccessToken(e.target.value)}
        className="w-full bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none placeholder:text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={handleSave}
        className="w-full text-xs py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
      >
        {saved ? '✓ Saved' : 'Save Credentials'}
      </button>
    </div>
  );
};

export const TopBar: React.FC = () => {
  const { symbol, setSymbol, setRightPanelTab, alertLogs, connected, marketType, setMarketType } = useChartStore();
  const [showSymbols, setShowSymbols] = useState(false);
  const [showMarketDropdown, setShowMarketDropdown] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPair, setNewPair] = useState('');
  const [addError, setAddError] = useState('');
  const [customPairs, setCustomPairs] = useState(loadCustomPairs);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const marketRef = useRef<HTMLDivElement>(null);

  const symbolList = marketType === 'crypto'
    ? [...CRYPTO_SYMBOLS, ...customPairs]
    : INDIAN_STOCKS.map((s) => ({ name: s.name, label: s.label }));

  const filtered = symbolList.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.label.toLowerCase().includes(search.toLowerCase())
  );

  const currentMarket = MARKET_OPTIONS.find((m) => m.value === marketType)!;

  const handleAddPair = async () => {
    const raw = newPair.trim().toUpperCase();
    if (!raw) return;

    let binanceSymbol = raw.replace('/', '').replace('USD', 'USDT');
    if (!binanceSymbol.endsWith('USDT')) binanceSymbol += 'USDT';
    const displayName = binanceSymbol.replace('USDT', '/USD');

    if (symbolList.some((s) => s.name === displayName)) {
      setAddError('Pair already exists');
      return;
    }

    setAddError('');
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=1`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data.length) throw new Error();
    } catch {
      setAddError('Invalid pair or not on Binance');
      return;
    }

    const pair = { name: displayName, label: raw };
    const updated = [...customPairs, pair];
    setCustomPairs(updated);
    saveCustomPairs(updated);
    setNewPair('');
    setShowAddForm(false);
    setSymbol(displayName);
    setShowSymbols(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSymbols(false);
        setShowAddForm(false);
      }
      if (marketRef.current && !marketRef.current.contains(e.target as Node)) {
        setShowMarketDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="h-10 bg-card border-b border-border flex items-center px-2 gap-2 relative">
      {/* Market Type Dropdown */}
      <div className="relative" ref={marketRef}>
        <button
          onClick={() => setShowMarketDropdown(!showMarketDropdown)}
          className="flex items-center gap-1.5 trading-btn font-semibold text-foreground"
        >
          <TrendingUp size={13} className="text-primary" />
          <span className="text-xs">{currentMarket.icon} {currentMarket.label}</span>
          <ChevronDown size={12} className="text-muted-foreground" />
        </button>

        {showMarketDropdown && (
          <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-xl z-50 min-w-[240px] overflow-hidden">
            {MARKET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  if (opt.value !== marketType) setMarketType(opt.value);
                  setShowMarketDropdown(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex items-center gap-2 ${
                  opt.value === marketType ? 'text-primary' : 'text-foreground'
                }`}
              >
                <span>{opt.icon}</span>
                <span className="font-medium">{opt.label}</span>
              </button>
            ))}

            <UpstoxCredentialsForm />
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Symbol Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => { setShowSymbols(!showSymbols); setSearch(''); setShowAddForm(false); }}
          className="flex items-center gap-1.5 trading-btn font-semibold text-foreground"
        >
          <Search size={13} className="text-muted-foreground" />
          {symbol}
          <ChevronDown size={12} className="text-muted-foreground" />
        </button>

        {showSymbols && (
          <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-xl z-50 min-w-[220px] overflow-hidden">
            <div className="p-2 border-b border-border">
              <input
                type="text"
                placeholder={`Search ${marketType === 'crypto' ? 'crypto' : 'stock'}...`}
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
                  <span className="text-muted-foreground text-[10px]">{s.label}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No results found</div>
              )}
            </div>

            {marketType === 'crypto' && (
              <div className="border-t border-border">
                {!showAddForm ? (
                  <button
                    onClick={() => { setShowAddForm(true); setAddError(''); setNewPair(''); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex items-center gap-1.5 text-primary"
                  >
                    <Plus size={12} />
                    Add new pair
                  </button>
                ) : (
                  <div className="p-2 space-y-1.5">
                    <input
                      type="text"
                      placeholder="e.g. LINK, MATIC/USD"
                      value={newPair}
                      onChange={(e) => { setNewPair(e.target.value); setAddError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddPair()}
                      className="w-full bg-accent text-foreground text-xs px-2 py-1.5 rounded outline-none placeholder:text-muted-foreground"
                      autoFocus
                    />
                    {addError && <p className="text-[10px] text-destructive">{addError}</p>}
                    <button
                      onClick={handleAddPair}
                      className="w-full text-xs py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      Add & Load
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
        {marketType === 'crypto' ? (
          connected ? (
            <Wifi size={13} className="text-bull" />
          ) : (
            <WifiOff size={13} className="text-bear" />
          )
        ) : (
          <span className="text-[10px] text-muted-foreground">NSE</span>
        )}
      </div>

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
