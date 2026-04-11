import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { useTrackerStore } from '@/stores/trackerStore';
import { TrackerSymbol, TrackedEntry, StrategyConfig, PctDiffDonSource } from '@/types/tracker';
import { Timeframe } from '@/types/trading';
import { fetchCandles, subscribeToCandles } from '@/lib/marketData';
import { detectPctDiffDonCrossover } from '@/lib/trackerCrossover';
import { CRYPTO_SYMBOLS } from '@/lib/cryptoSymbols';
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
import { Plus, Trash2, Square, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { toast } from 'sonner';

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
  const { watchlist, entries, addSymbol, removeSymbol, addEntry, updateEntry, stopTracking, removeEntry } = useTrackerStore();

  // Add symbol form state
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
  entriesRef.current = entries;
  const pricesRef = useRef(prices);
  pricesRef.current = prices;

  // Determine minimum timeframe polling interval
  const minCheckInterval = React.useMemo(() => {
    const TF_INTERVALS: Record<string, number> = {
      '1m': 60_000, '3m': 60_000, '5m': 60_000, '15m': 60_000,
      '1h': 60_000, '4h': 120_000, '1D': 300_000, '1W': 600_000,
    };
    if (watchlist.length === 0) return 60_000;
    let minInterval = Infinity;
    for (const w of watchlist) {
      const interval = TF_INTERVALS[w.timeframe] ?? 60_000;
      if (interval < minInterval) minInterval = interval;
    }
    return minInterval;
  }, [watchlist]);

  // Periodically check crossovers for watchlist symbols
  useEffect(() => {
    if (watchlist.length === 0) return;

    const checkCrossovers = async () => {
      for (const item of watchlist) {
        try {
          const candles = await fetchCandles(item.symbol, item.timeframe, 500);
          if (item.strategy.type === 'pct_diff_don') {
            const cross = detectPctDiffDonCrossover(candles, item.strategy);
            if (cross) {
              const currentEntries = entriesRef.current;
              const exists = currentEntries.some(
                (e) => e.symbol === item.symbol && e.entryTime === cross.time
              );
              if (!exists) {
                const id = `${item.symbol}-${cross.time}-${Date.now()}`;
                addEntry({
                  id,
                  symbol: item.symbol,
                  timeframe: item.timeframe,
                  strategy: item.strategy,
                  entryPrice: cross.price,
                  entryTime: cross.time,
                  direction: cross.direction,
                  active: true,
                });
                toast.success(`Crossover detected: ${item.symbol} ${cross.direction}`, {
                  description: `Entry @ ${cross.price.toFixed(2)}`,
                });
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
  }, [watchlist, minCheckInterval, addEntry]);

  // Update performance metrics periodically — use ref to avoid loop
  useEffect(() => {
    const interval = setInterval(() => {
      const currentEntries = entriesRef.current;
      const currentPrices = pricesRef.current;
      const activeEntries = currentEntries.filter((e) => e.active);
      for (const entry of activeEntries) {
        const currentPrice = currentPrices[entry.symbol];
        if (currentPrice) {
          const now = Date.now() / 1000;
          const age = now - entry.entryTime;
          const patch: Partial<TrackedEntry> = { currentPrice };

          if (!entry.perf5m && age >= 300) patch.perf5m = currentPrice;
          if (!entry.perf15m && age >= 900) patch.perf15m = currentPrice;
          if (!entry.perf30m && age >= 1800) patch.perf30m = currentPrice;
          if (!entry.perf1h && age >= 3600) patch.perf1h = currentPrice;
          if (!entry.perf4h && age >= 14400) patch.perf4h = currentPrice;
          if (!entry.perf12h && age >= 43200) patch.perf12h = currentPrice;
          if (!entry.perf1D && age >= 86400) patch.perf1D = currentPrice;
          if (!entry.perf3D && age >= 86400 * 3) patch.perf3D = currentPrice;
          if (!entry.perf7D && age >= 86400 * 7) patch.perf7D = currentPrice;
          if (!entry.perf1M && age >= 86400 * 30) patch.perf1M = currentPrice;

          updateEntry(entry.id, patch);
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [updateEntry]);

  const handleAddSymbol = () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;
    // Auto-format: if user types "BTC" → "BTC/USD"
    const formatted = sym.includes('/') ? sym : `${sym}/USD`;
    addSymbol(formatted, newTimeframe, strategy);
    setNewSymbol('');
    toast.success(`Added ${formatted} to tracker`);
  };

  const filteredSymbols = CRYPTO_SYMBOLS.filter((s) =>
    s.toLowerCase().includes(newSymbol.toLowerCase())
  ).slice(0, 8);

  const updateStrategyField = (field: string, value: any) => {
    setStrategy((prev) => ({ ...prev, [field]: value }));
  };

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
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-muted-foreground mb-1 block">Symbol</label>
                <Input
                  value={newSymbol}
                  onChange={(e) => { setNewSymbol(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="BTC/USD or BTC"
                  className="bg-secondary border-border h-9"
                  onKeyDown={(e) => { if (e.key === 'Enter') { setShowDropdown(false); handleAddSymbol(); } }}
                />
                {showDropdown && newSymbol && filteredSymbols.length > 0 && (
                  <div className="absolute z-50 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
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
                    key={w.symbol}
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
                      onClick={() => removeSymbol(w.symbol)}
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
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tracked Entries ({entries.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Symbol</TableHead>
                  <TableHead>TF</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Entry Time</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">P&L %</TableHead>
                  <TableHead className="text-right">5m</TableHead>
                  <TableHead className="text-right">15m</TableHead>
                  <TableHead className="text-right">30m</TableHead>
                  <TableHead className="text-right">1h</TableHead>
                  <TableHead className="text-right">4h</TableHead>
                  <TableHead className="text-right">12h</TableHead>
                  <TableHead className="text-right">1D</TableHead>
                  <TableHead className="text-right">3D</TableHead>
                  <TableHead className="text-right">7D</TableHead>
                  <TableHead className="text-right">1M</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
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
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(entry.entryTime * 1000), 'MMM dd, HH:mm')}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {entry.strategy.type === 'pct_diff_don' && 
                            `%Diff ${(entry.strategy as any).source1}×${(entry.strategy as any).source2}`
                          }
                        </TableCell>
                        <TableCell className="text-right font-mono">${entry.entryPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {current ? `$${current.toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <PctBadge entry={entry.entryPrice} current={current} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {entry.perf5m ? <PctBadge entry={entry.entryPrice} current={entry.perf5m} /> : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {entry.perf15m ? <PctBadge entry={entry.entryPrice} current={entry.perf15m} /> : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {entry.perf30m ? <PctBadge entry={entry.entryPrice} current={entry.perf30m} /> : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {entry.perf1h ? <PctBadge entry={entry.entryPrice} current={entry.perf1h} /> : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {entry.perf4h ? <PctBadge entry={entry.entryPrice} current={entry.perf4h} /> : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {entry.perf12h ? <PctBadge entry={entry.entryPrice} current={entry.perf12h} /> : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {entry.perf1D ? <PctBadge entry={entry.entryPrice} current={entry.perf1D} /> : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {entry.perf3D ? <PctBadge entry={entry.entryPrice} current={entry.perf3D} /> : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {entry.perf7D ? <PctBadge entry={entry.entryPrice} current={entry.perf7D} /> : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {entry.perf1M ? <PctBadge entry={entry.entryPrice} current={entry.perf1M} /> : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={entry.active ? 'default' : 'secondary'}>
                            {entry.active ? 'Active' : 'Stopped'}
                          </Badge>
                        </TableCell>
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
