import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { useTrackerStore } from '@/stores/trackerStore';
import { TrackerSymbol, TrackedEntry, StrategyConfig, PctDiffDonSource } from '@/types/tracker';
import { Timeframe, MarketType } from '@/types/trading';
import { fetchCandles, subscribeToCandles } from '@/lib/marketData';
import { detectPctDiffDonCrossover } from '@/lib/trackerCrossover';
import { CRYPTO_SYMBOLS } from '@/lib/cryptoSymbols';
import { FOREX_SYMBOLS } from '@/lib/forexSymbols';
import { INDIAN_STOCKS } from '@/lib/upstoxData';
import { NavLink } from '@/components/NavLink';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Square, ArrowUpRight, ArrowDownRight, Activity, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'];
const SOURCE_OPTIONS: { value: PctDiffDonSource; label: string }[] = [
  { value: 'main', label: 'Main (%Diff)' },
  { value: 'ema', label: 'EMA Line' },
  { value: 'basis', label: 'Basis' },
  { value: 'upper', label: 'Upper' },
  { value: 'lower', label: 'Lower' },
  { value: 'upperNew', label: 'Upper New' },
  { value: 'lowerNew', label: 'Lower New' },
];

const DEFAULT_STRATEGY: StrategyConfig = {
  type: 'pct_diff_don',
  source1: 'main',
  source2: 'ema',
  emaPeriod: 20,
  lookbackWindow: 10,
  emaSmoothing: 9,
  donchianLength: 20,
  donLineDiff: 0.2,
};

const COLUMN_CONFIG = [
  { id: 'direction', label: 'Direction' },
  { id: 'entryTime', label: 'Entry Time' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'entryPrice', label: 'Entry' },
  { id: 'currentPrice', label: 'Current' },
  { id: 'pnl', label: 'P&L %' },
  { id: 'perf5m', label: '5m' },
  { id: 'perf15m', label: '15m' },
  { id: 'perf30m', label: '30m' },
  { id: 'perf1h', label: '1h' },
  { id: 'perf4h', label: '4h' },
  { id: 'perf12h', label: '12h' },
  { id: 'perf1D', label: '1D' },
  { id: 'perf3D', label: '3D' },
  { id: 'perf7D', label: '7D' },
  { id: 'perf1M', label: '1M' },
  { id: 'status', label: 'Status' },
];


function pctChange(entry: number, current: number): string {
  if (!entry) return '—';
  const pct = ((current - entry) / entry) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function PctBadge({ entry, current }: { entry: number; current?: number }) {
  if (!current) return <span className="text-muted-foreground">—</span>;
  const pct = ((current - entry) / entry) * 100;
  return (
    <span className={pct >= 0 ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]'}>
      {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
    </span>
  );
}

export function Tracker() {
  const { watchlist, entries, addSymbol, removeSymbol, addEntry, updateEntry, stopTracking, removeEntry, clearAllEntries } = useTrackerStore();

  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    () => JSON.parse(localStorage.getItem('tracker-visible-cols') || '[]')
    .filter(Boolean).length > 0 
    ? JSON.parse(localStorage.getItem('tracker-visible-cols')!)
    : COLUMN_CONFIG.map(c => c.id)
  );

  useEffect(() => {
    localStorage.setItem('tracker-visible-cols', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumn = (id: string) => {
    setVisibleColumns(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };


  // Add symbol form state
  const [marketType, setMarketType] = useState<MarketType>('crypto');
  const [newSymbol, setNewSymbol] = useState('');
  const [newTimeframe, setNewTimeframe] = useState<Timeframe>('1h');
  const [strategy, setStrategy] = useState<StrategyConfig>({ ...DEFAULT_STRATEGY });
  const [showDropdown, setShowDropdown] = useState(false);

  // In-memory current prices
  const [prices, setPrices] = useState<Record<string, number>>({});
  const wsCleanups = useRef<(() => void)[]>([]);

  // Stable symbol key for subscriptions
  const activeSymbols = React.useMemo(() => {
    const syms = new Set<string>();
    watchlist.forEach((w) => syms.add(w.symbol));
    entries.filter((e) => e.active).forEach((e) => syms.add(e.symbol));
    return Array.from(syms).sort().join(',');
  }, [watchlist, entries]);

  // Subscribe to live prices for all watchlist + active entries
  useEffect(() => {
    wsCleanups.current.forEach((fn) => fn());
    wsCleanups.current = [];

    const symbols = activeSymbols ? activeSymbols.split(',') : [];

    symbols.forEach((sym) => {
      const unsub = subscribeToCandles(sym, '1m', (candle) => {
        setPrices((prev) => ({ ...prev, [sym]: candle.close }));
      });
      wsCleanups.current.push(unsub);
    });

    return () => {
      wsCleanups.current.forEach((fn) => fn());
    };
  }, [activeSymbols]);

  // Use refs for crossover check to avoid re-creating callback on every entries change
  const entriesRef = useRef(entries);
  const pricesRef = useRef(prices);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  useEffect(() => { pricesRef.current = prices; }, [prices]);

  // Background check for crossovers
  useEffect(() => {
    const minCheckInterval = 1000 * 60; // Check every minute
    
    const checkCrossovers = async () => {
      const currentEntries = entriesRef.current;
      for (const item of watchlist) {
        // Skip if already tracked
        if (currentEntries.some(e => e.symbol === item.symbol && e.timeframe === item.timeframe && e.active)) {
          continue;
        }

        try {
          const candles = await fetchCandles(item.symbol, item.timeframe, 500);
          if (candles && candles.length > 50) {
            if (item.strategy.type === 'pct_diff_don') {
              const signal = detectPctDiffDonCrossover(candles, item.strategy);
              if (signal) {
                // Check if this signal is new (we don't want to fire again if we already have it in inactive entries)
                const alreadyExists = currentEntries.some(
                  e => e.symbol === item.symbol && e.timeframe === item.timeframe && e.strategy.type === 'pct_diff_don' && e.direction === signal
                );
                
                if (!alreadyExists) {
                  const currentPrice = candles[candles.length - 1].close;
                  const id = `entry-${item.symbol}-${candles[candles.length - 1].time}-${Math.random().toString(36).slice(2, 9)}`;
                  addEntry({
                    id,
                    symbol: item.symbol,
                    timeframe: item.timeframe,
                    strategy: item.strategy,
                    entryPrice: currentPrice,
                    entryTime: candles[candles.length - 1].time,
                    direction: signal,
                    active: true,
                  });
                  toast.success(`Crossover detected for ${item.symbol}! Added to tracking.`, {
                    description: `${signal === 'long' ? 'Bullish' : 'Bearish'} signal on ${item.timeframe}`
                  });
                }
              }
            }
          }
        } catch (err) {
          console.error(`Failed to check crossover for ${item.symbol}:`, err);
        }
      }
    };

    checkCrossovers();
    const interval = setInterval(checkCrossovers, minCheckInterval);
    return () => clearInterval(interval);
  }, [watchlist, addEntry]);

  // Timeframe to seconds mapping
  const TF_SECONDS: Record<string, number> = {
    '1m': 60, '3m': 180, '5m': 300, '15m': 900,
    '1h': 3600, '4h': 14400, '1D': 86400, '1W': 604800,
  };

  // Performance slots: label, seconds, field name
  const PERF_SLOTS: { seconds: number; field: keyof TrackedEntry }[] = [
    { seconds: 300, field: 'perf5m' },
    { seconds: 900, field: 'perf15m' },
    { seconds: 1800, field: 'perf30m' },
    { seconds: 3600, field: 'perf1h' },
    { seconds: 14400, field: 'perf4h' },
    { seconds: 43200, field: 'perf12h' },
    { seconds: 86400, field: 'perf1D' },
    { seconds: 86400 * 3, field: 'perf3D' },
    { seconds: 86400 * 7, field: 'perf7D' },
    { seconds: 86400 * 30, field: 'perf1M' },
  ];

  // Update current prices and fetch candle highs for perf snapshots
  useEffect(() => {
    const interval = setInterval(async () => {
      const currentEntries = entriesRef.current;
      const currentPrices = pricesRef.current;
      const activeEntries = currentEntries.filter((e) => e.active);
      const now = Date.now() / 1000;

      for (const entry of activeEntries) {
        const currentPrice = currentPrices[entry.symbol];
        if (!currentPrice) continue;

        const age = now - entry.entryTime;
        const tfSec = TF_SECONDS[entry.timeframe] ?? 60;
        const patch: Partial<TrackedEntry> = { currentPrice };

        // Collect slots that need filling
        const slotsToFill = PERF_SLOTS.filter((slot) => {
          const candleN = Math.round(slot.seconds / tfSec);
          if (candleN < 1) return false; // perf interval smaller than timeframe
          if (entry[slot.field]) return false; // already filled
          // Need enough time elapsed: candleN candles + some buffer
          return age >= slot.seconds + tfSec;
        });

        if (slotsToFill.length > 0) {
          try {
            // Fetch candles to find the specific candle highs
            const candles = await fetchCandles(entry.symbol, entry.timeframe as Timeframe, 500);
            for (const slot of slotsToFill) {
              const candleN = Math.round(slot.seconds / tfSec);
              // Find the entry candle index
              const entryIdx = candles.findIndex((c) => c.time >= entry.entryTime);
              if (entryIdx >= 0 && entryIdx + candleN < candles.length) {
                const targetCandle = candles[entryIdx + candleN];
                (patch as any)[slot.field] = targetCandle.high;
              }
            }
          } catch (err) {
            console.error(`Failed to fetch candles for perf snapshot ${entry.symbol}:`, err);
          }
        }

        // Also fill 1D/3D/7D/1M with current price if no candle data available yet
        if (!entry.perf1D && age >= 86400) patch.perf1D = patch.perf1D ?? currentPrice;
        if (!entry.perf3D && age >= 86400 * 3) patch.perf3D = patch.perf3D ?? currentPrice;
        if (!entry.perf7D && age >= 86400 * 7) patch.perf7D = patch.perf7D ?? currentPrice;
        if (!entry.perf1M && age >= 86400 * 30) patch.perf1M = patch.perf1M ?? currentPrice;

        updateEntry(entry.id, patch);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [updateEntry]);

  const handleAddSymbol = () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;
    
    // Auto-format: if user types "BTC" -> "BTC/USD" for crypto. Indian stocks don't need '/USD'.
    let formatted = sym;
    if (marketType === 'crypto' && !sym.includes('/')) {
      formatted = `${sym}/USD`;
    }
    
    addSymbol(formatted, newTimeframe, strategy);
    setNewSymbol('');
    toast.success(`Added ${formatted} to tracker`);
  };

  const symbolList = marketType === 'crypto' ? CRYPTO_SYMBOLS 
                   : marketType === 'indian' ? INDIAN_STOCKS.map(s => s.name)
                   : FOREX_SYMBOLS;
  const filteredSymbols = symbolList.filter((s) =>
    s.toLowerCase().includes(newSymbol.toLowerCase())
  ).slice(0, 8);

  const updateStrategyField = (field: string, value: any) => {
    setStrategy((prev) => ({ ...prev, [field]: value }));
  };

  const handleDeleteAll = () => {
    if (entries.length === 0) return;
    if (window.confirm(`Are you sure you want to delete all ${entries.length} tracked entries? This cannot be undone.`)) {
      clearAllEntries();
      toast.success('All entries deleted');
    }
  };

  const isColVisible = (id: string) => visibleColumns.includes(id);

  return (

    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <div className="border-b border-border px-4 py-2 flex items-center gap-4">
        <Activity className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Strategy Tracker</h1>
        <NavLink to="/">Chart</NavLink>
        <NavLink to="/screener">Screener</NavLink>
        <NavLink to="/tracker">Tracker</NavLink>
      </div>

      <div className="p-4 space-y-6 max-w-[1400px] mx-auto">
        {/* Add Symbol Card */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add Symbol</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Row 1: Symbol + Timeframe + Add */}
            <div className="flex gap-2 items-end flex-wrap">
              <div className="w-[140px]">
                <label className="text-xs text-muted-foreground mb-1 block">Market</label>
                <Select value={marketType} onValueChange={(val) => setMarketType(val as MarketType)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="indian">Indian Stocks</SelectItem>
                    <SelectItem value="forex">Forex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px] relative">
                <label className="text-xs text-muted-foreground mb-1 block">Symbol</label>
                <Input
                  value={newSymbol}
                  onChange={(e) => { setNewSymbol(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder={marketType === 'crypto' ? "BTC/USD or BTC" : marketType === 'indian' ? "RELIANCE" : "XAU/USD"}
                  className="bg-secondary border-border h-9"
                  onKeyDown={(e) => { if (e.key === 'Enter') { setShowDropdown(false); handleAddSymbol(); } }}
                />
                {showDropdown && newSymbol && filteredSymbols.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {filteredSymbols.map((s) => (
                      <button
                        key={s}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                        onClick={() => { setNewSymbol(s); setShowDropdown(false); }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="w-[100px]">
                <label className="text-xs text-muted-foreground mb-1 block">Timeframe</label>
                <Select value={newTimeframe} onValueChange={(v) => setNewTimeframe(v as Timeframe)}>
                  <SelectTrigger className="bg-secondary border-border h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEFRAMES.map((tf) => (
                      <SelectItem key={tf} value={tf}>{tf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddSymbol} size="sm" className="h-9">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {/* Row 2: Strategy config */}
            <div className="flex gap-2 items-end flex-wrap">
              <div className="w-[140px]">
                <label className="text-xs text-muted-foreground mb-1 block">Source 1</label>
                <Select
                  value={(strategy as any).source1}
                  onValueChange={(v) => updateStrategyField('source1', v)}
                >
                  <SelectTrigger className="bg-secondary border-border h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[140px]">
                <label className="text-xs text-muted-foreground mb-1 block">Source 2</label>
                <Select
                  value={(strategy as any).source2}
                  onValueChange={(v) => updateStrategyField('source2', v)}
                >
                  <SelectTrigger className="bg-secondary border-border h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[80px]">
                <label className="text-xs text-muted-foreground mb-1 block">EMA</label>
                <Input
                  type="number"
                  value={(strategy as any).emaPeriod}
                  onChange={(e) => updateStrategyField('emaPeriod', Number(e.target.value))}
                  className="bg-secondary border-border h-8 text-xs"
                />
              </div>
              <div className="w-[80px]">
                <label className="text-xs text-muted-foreground mb-1 block">Lookback</label>
                <Input
                  type="number"
                  value={(strategy as any).lookbackWindow}
                  onChange={(e) => updateStrategyField('lookbackWindow', Number(e.target.value))}
                  className="bg-secondary border-border h-8 text-xs"
                />
              </div>
              <div className="w-[80px]">
                <label className="text-xs text-muted-foreground mb-1 block">Smooth</label>
                <Input
                  type="number"
                  value={(strategy as any).emaSmoothing}
                  onChange={(e) => updateStrategyField('emaSmoothing', Number(e.target.value))}
                  className="bg-secondary border-border h-8 text-xs"
                />
              </div>
              <div className="w-[80px]">
                <label className="text-xs text-muted-foreground mb-1 block">Don Len</label>
                <Input
                  type="number"
                  value={(strategy as any).donchianLength}
                  onChange={(e) => updateStrategyField('donchianLength', Number(e.target.value))}
                  className="bg-secondary border-border h-8 text-xs"
                />
              </div>
              <div className="w-[80px]">
                <label className="text-xs text-muted-foreground mb-1 block">Don Diff</label>
                <Input
                  type="number"
                  step="0.01"
                  value={(strategy as any).donLineDiff}
                  onChange={(e) => updateStrategyField('donLineDiff', Number(e.target.value))}
                  className="bg-secondary border-border h-8 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Watchlist */}
        {watchlist.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Watchlist ({watchlist.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {watchlist.map((w) => (
                  <Badge
                    key={`${w.symbol}-${w.timeframe}`}
                    variant="secondary"

                    className="flex items-center gap-2 py-1.5 px-3"
                  >
                    <span>{w.symbol}</span>
                    <span className="text-muted-foreground text-xs">{w.timeframe}</span>
                    <span className="text-muted-foreground text-xs">
                      {w.strategy.type === 'pct_diff_don' && `${(w.strategy as any).source1}×${(w.strategy as any).source2}`}
                    </span>
                    {prices[w.symbol] && (
                      <span className="text-xs font-mono">${prices[w.symbol]?.toFixed(2)}</span>
                    )}
                    <button
                      onClick={() => removeSymbol(w.symbol, w.timeframe)}
                      className="text-muted-foreground hover:text-destructive ml-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>

                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tracked Entries Table */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Tracked Entries ({entries.length})</CardTitle>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 border-border">
                    <Settings2 className="h-4 w-4 mr-2" /> Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 max-h-80 overflow-y-auto">
                  <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {COLUMN_CONFIG.map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      checked={isColVisible(col.id)}
                      onCheckedChange={() => toggleColumn(col.id)}
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDeleteAll}
                className="h-8 text-destructive border-border hover:bg-destructive/10"
                disabled={entries.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete All
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="w-[120px]">Symbol</TableHead>
                  <TableHead className="w-[60px]">TF</TableHead>
                  {isColVisible('direction') && <TableHead>Direction</TableHead>}
                  {isColVisible('entryTime') && <TableHead>Entry Time</TableHead>}
                  {isColVisible('strategy') && <TableHead>Strategy</TableHead>}
                  {isColVisible('entryPrice') && <TableHead className="text-right">Entry</TableHead>}
                  {isColVisible('currentPrice') && <TableHead className="text-right">Current</TableHead>}
                  {isColVisible('pnl') && <TableHead className="text-right">P&L %</TableHead>}
                  {isColVisible('perf5m') && <TableHead className="text-right">5m</TableHead>}
                  {isColVisible('perf15m') && <TableHead className="text-right">15m</TableHead>}
                  {isColVisible('perf30m') && <TableHead className="text-right">30m</TableHead>}
                  {isColVisible('perf1h') && <TableHead className="text-right">1h</TableHead>}
                  {isColVisible('perf4h') && <TableHead className="text-right">4h</TableHead>}
                  {isColVisible('perf12h') && <TableHead className="text-right">12h</TableHead>}
                  {isColVisible('perf1D') && <TableHead className="text-right">1D</TableHead>}
                  {isColVisible('perf3D') && <TableHead className="text-right">3D</TableHead>}
                  {isColVisible('perf7D') && <TableHead className="text-right">7D</TableHead>}
                  {isColVisible('perf1M') && <TableHead className="text-right">1M</TableHead>}
                  {isColVisible('status') && <TableHead>Status</TableHead>}
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>

              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={20} className="text-center text-muted-foreground py-8">
                      No entries yet. Add symbols and wait for crossover signals.
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => {
                    const current = prices[entry.symbol] ?? entry.currentPrice;
                    return (
                      <TableRow key={entry.id} className="border-border">
                        <TableCell className="font-mono font-medium">{entry.symbol}</TableCell>
                        <TableCell>{entry.timeframe}</TableCell>
                        {isColVisible('direction') && (
                          <TableCell>
                            {entry.direction === 'above' ? (
                              <span className="flex items-center gap-1 text-[hsl(var(--bull))]">
                                <ArrowUpRight className="h-3 w-3" /> Above
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[hsl(var(--bear))]">
                                <ArrowDownRight className="h-3 w-3" /> Below
                              </span>
                            )}
                          </TableCell>
                        )}
                        {isColVisible('entryTime') && (
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(entry.entryTime * 1000), 'MMM dd, HH:mm')}
                          </TableCell>
                        )}
                        {isColVisible('strategy') && (
                          <TableCell className="text-xs text-muted-foreground">
                            {entry.strategy.type === 'pct_diff_don' && 
                              `%Diff ${(entry.strategy as any).source1}×${(entry.strategy as any).source2}`
                            }
                          </TableCell>
                        )}
                        {isColVisible('entryPrice') && <TableCell className="text-right font-mono">${entry.entryPrice.toFixed(2)}</TableCell>}
                        {isColVisible('currentPrice') && (
                          <TableCell className="text-right font-mono">
                            {current ? `$${current.toFixed(2)}` : '—'}
                          </TableCell>
                        )}
                        {isColVisible('pnl') && (
                          <TableCell className="text-right font-mono">
                            <PctBadge entry={entry.entryPrice} current={current} />
                          </TableCell>
                        )}
                        {isColVisible('perf5m') && (
                          <TableCell className="text-right font-mono text-xs">
                            {entry.perf5m ? <PctBadge entry={entry.entryPrice} current={entry.perf5m} /> : '—'}
                          </TableCell>
                        )}
                        {isColVisible('perf15m') && (
                          <TableCell className="text-right font-mono text-xs">
                            {entry.perf15m ? <PctBadge entry={entry.entryPrice} current={entry.perf15m} /> : '—'}
                          </TableCell>
                        )}
                        {isColVisible('perf30m') && (
                          <TableCell className="text-right font-mono text-xs">
                            {entry.perf30m ? <PctBadge entry={entry.entryPrice} current={entry.perf30m} /> : '—'}
                          </TableCell>
                        )}
                        {isColVisible('perf1h') && (
                          <TableCell className="text-right font-mono text-xs">
                            {entry.perf1h ? <PctBadge entry={entry.entryPrice} current={entry.perf1h} /> : '—'}
                          </TableCell>
                        )}
                        {isColVisible('perf4h') && (
                          <TableCell className="text-right font-mono text-xs">
                            {entry.perf4h ? <PctBadge entry={entry.entryPrice} current={entry.perf4h} /> : '—'}
                          </TableCell>
                        )}
                        {isColVisible('perf12h') && (
                          <TableCell className="text-right font-mono text-xs">
                            {entry.perf12h ? <PctBadge entry={entry.entryPrice} current={entry.perf12h} /> : '—'}
                          </TableCell>
                        )}
                        {isColVisible('perf1D') && (
                          <TableCell className="text-right font-mono text-xs">
                            {entry.perf1D ? <PctBadge entry={entry.entryPrice} current={entry.perf1D} /> : '—'}
                          </TableCell>
                        )}
                        {isColVisible('perf3D') && (
                          <TableCell className="text-right font-mono text-xs">
                            {entry.perf3D ? <PctBadge entry={entry.entryPrice} current={entry.perf3D} /> : '—'}
                          </TableCell>
                        )}
                        {isColVisible('perf7D') && (
                          <TableCell className="text-right font-mono text-xs">
                            {entry.perf7D ? <PctBadge entry={entry.entryPrice} current={entry.perf7D} /> : '—'}
                          </TableCell>
                        )}
                        {isColVisible('perf1M') && (
                          <TableCell className="text-right font-mono text-xs">
                            {entry.perf1M ? <PctBadge entry={entry.entryPrice} current={entry.perf1M} /> : '—'}
                          </TableCell>
                        )}
                        {isColVisible('status') && (
                          <TableCell>
                            <Badge variant={entry.active ? 'default' : 'secondary'}>
                              {entry.active ? 'Active' : 'Stopped'}
                            </Badge>
                          </TableCell>
                        )}

                        <TableCell>
                          <div className="flex gap-1">
                            {entry.active && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => stopTracking(entry.id)}
                                className="h-7 px-2 text-xs"
                              >
                                <Square className="h-3 w-3 mr-1" /> Stop
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeEntry(entry.id)}
                              className="h-7 px-2 text-xs text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
