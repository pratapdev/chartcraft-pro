import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Settings2, Search, Zap } from 'lucide-react';
import { fetchPctScreenerData, PctScreenerRow, PctScreenerConfig, DEFAULT_PCT_CONFIG } from '@/lib/pctScreenerService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useChartStore } from '@/stores/chartStore';
import { Timeframe, MarketType, PctDiffStrategy } from '@/types/trading';

const TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1D', '1W'];

const STRATEGY_LABELS: Record<PctDiffStrategy, string> = {
  fail_first: 'Fail First',
  squeeze_breakout: 'Squeeze Breakout',
  momentum_divergence: 'Divergence',
  regime_mean_reversion: 'Regime MR',
  inner_band_warning: 'Inner Band',
};

const STRATEGY_COLORS: Record<PctDiffStrategy, string> = {
  fail_first: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/50',
  squeeze_breakout: 'bg-cyan-900/30 text-cyan-400 border-cyan-700/50',
  momentum_divergence: 'bg-purple-900/30 text-purple-400 border-purple-700/50',
  regime_mean_reversion: 'bg-blue-900/30 text-blue-400 border-blue-700/50',
  inner_band_warning: 'bg-orange-900/30 text-orange-400 border-orange-700/50',
};

type SortKey = 'symbol' | 'price' | 'change24h' | 'pctDiffValue' | 'channelWidth' | 'strategies';

export function PctScreener() {
  const navigate = useNavigate();
  const setSymbol = useChartStore((s) => s.setSymbol);
  const [data, setData] = useState<PctScreenerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [marketType, setMarketType] = useState<MarketType>('crypto');
  const [config, setConfig] = useState<PctScreenerConfig>(DEFAULT_PCT_CONFIG);
  const [sortKey, setSortKey] = useState<SortKey>('strategies');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [strategyFilter, setStrategyFilter] = useState<PctDiffStrategy | 'all'>('all');
  const [regimeFilter, setRegimeFilter] = useState<string>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const rows = await fetchPctScreenerData(timeframe, marketType, config);
      setData(rows);
    } catch (err) {
      console.error('PctScreener fetch error:', err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [timeframe, marketType]);

  const filteredData = useMemo(() => {
    let result = [...data];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r => r.symbol.toLowerCase().includes(term));
    }
    if (strategyFilter !== 'all') {
      result = result.filter(r => r.strategies.includes(strategyFilter));
    }
    if (regimeFilter !== 'all') {
      result = result.filter(r => r.regime === regimeFilter);
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
        case 'price': cmp = a.price - b.price; break;
        case 'change24h': cmp = a.change24h - b.change24h; break;
        case 'pctDiffValue': cmp = (a.pctDiffValue ?? 0) - (b.pctDiffValue ?? 0); break;
        case 'channelWidth': cmp = (a.channelWidth ?? 0) - (b.channelWidth ?? 0); break;
        case 'strategies': cmp = a.strategies.length - b.strategies.length; break;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [data, searchTerm, strategyFilter, regimeFilter, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortOrder('desc'); }
  };

  const handleRowClick = (symbol: string) => {
    setSymbol(symbol);
    navigate('/');
  };

  const strategyCounts = useMemo(() => {
    const counts: Record<string, number> = { all: data.length };
    (Object.keys(STRATEGY_LABELS) as PctDiffStrategy[]).forEach(s => {
      counts[s] = data.filter(r => r.strategies.includes(s)).length;
    });
    return counts;
  }, [data]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortOrder === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-400" />
            %Diff Strategy Screener
          </h1>
          <p className="text-xs text-muted-foreground">
            {filteredData.length} of {data.length} symbols • {timeframe} • Scanning 5 strategies
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="pl-7 h-8 w-[160px] text-xs" />
          </div>

          <div className="flex gap-1">
            {TIMEFRAMES.map(tf => (
              <Button key={tf} size="sm" variant={timeframe === tf ? 'default' : 'outline'}
                className="text-xs px-2 h-8" onClick={() => setTimeframe(tf)}>{tf}</Button>
            ))}
          </div>

          <Select value={marketType} onValueChange={(v) => setMarketType(v as MarketType)}>
            <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="crypto">Crypto</SelectItem>
              <SelectItem value="indian">Indian</SelectItem>
              <SelectItem value="forex">Forex</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" className="h-8" onClick={loadData} disabled={loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Settings2 className="mr-1 h-3.5 w-3.5" /> Config
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[360px]">
              <SheetHeader><SheetTitle>%Diff Indicator Config</SheetTitle></SheetHeader>
              <div className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label className="text-xs">EMA Period</Label>
                  <Input type="number" value={config.emaPeriod} onChange={e => setConfig({ ...config, emaPeriod: +e.target.value })} className="h-8 text-xs" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Lookback Window</Label>
                  <Input type="number" value={config.lookbackWindow} onChange={e => setConfig({ ...config, lookbackWindow: +e.target.value })} className="h-8 text-xs" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">EMA Smoothing</Label>
                  <Input type="number" value={config.emaSmoothing} onChange={e => setConfig({ ...config, emaSmoothing: +e.target.value })} className="h-8 text-xs" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Donchian Length</Label>
                  <Input type="number" value={config.donchianLength} onChange={e => setConfig({ ...config, donchianLength: +e.target.value })} className="h-8 text-xs" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Don Line Diff</Label>
                  <Input type="number" step="0.05" value={config.donLineDiff} onChange={e => setConfig({ ...config, donLineDiff: +e.target.value })} className="h-8 text-xs" />
                </div>
                <Button className="w-full" onClick={loadData}>Apply & Refresh</Button>
              </div>
            </SheetContent>
          </Sheet>

          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => navigate('/')}>
            Chart
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => navigate('/screener')}>
            Screener
          </Button>
        </div>
      </div>

      {/* Strategy filter chips */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50">
        <span className="text-xs text-muted-foreground mr-1">Strategy:</span>
        <button onClick={() => setStrategyFilter('all')}
          className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${strategyFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}>
          All ({strategyCounts.all})
        </button>
        {(Object.keys(STRATEGY_LABELS) as PctDiffStrategy[]).map(s => (
          <button key={s} onClick={() => setStrategyFilter(strategyFilter === s ? 'all' : s)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${strategyFilter === s ? STRATEGY_COLORS[s] : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}>
            {STRATEGY_LABELS[s]} ({strategyCounts[s] ?? 0})
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Regime:</span>
          {['all', 'trending_bull', 'trending_bear', 'ranging'].map(r => (
            <button key={r} onClick={() => setRegimeFilter(r)}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${regimeFilter === r ? 'bg-accent text-foreground border-accent' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}>
              {r === 'all' ? 'All' : r === 'trending_bull' ? 'Bull' : r === 'trending_bear' ? 'Bear' : 'Range'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Scanning {marketType === 'crypto' ? 'crypto' : marketType === 'indian' ? 'Indian stocks' : 'forex pairs'}...</p>
              <p className="text-xs text-muted-foreground mt-1">Computing %Diff Donchian for each symbol</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 cursor-pointer hover:bg-accent/50" onClick={() => handleSort('symbol')}>
                  <span className="flex items-center">COIN <SortIcon column="symbol" /></span>
                </th>
                <th className="text-right px-3 py-2 cursor-pointer hover:bg-accent/50" onClick={() => handleSort('price')}>
                  <span className="flex items-center justify-end">PRICE <SortIcon column="price" /></span>
                </th>
                <th className="text-right px-3 py-2 cursor-pointer hover:bg-accent/50" onClick={() => handleSort('change24h')}>
                  <span className="flex items-center justify-end">24H% <SortIcon column="change24h" /></span>
                </th>
                <th className="text-right px-3 py-2 cursor-pointer hover:bg-accent/50" onClick={() => handleSort('pctDiffValue')}>
                  <span className="flex items-center justify-end">%DIFF <SortIcon column="pctDiffValue" /></span>
                </th>
                <th className="text-right px-3 py-2">EMA</th>
                <th className="text-right px-3 py-2">UPPER</th>
                <th className="text-right px-3 py-2">LOWER</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:bg-accent/50" onClick={() => handleSort('channelWidth')}>
                  <span className="flex items-center justify-end">WIDTH <SortIcon column="channelWidth" /></span>
                </th>
                <th className="text-center px-3 py-2">REGIME</th>
                <th className="text-left px-3 py-2 cursor-pointer hover:bg-accent/50" onClick={() => handleSort('strategies')}>
                  <span className="flex items-center">SIGNALS <SortIcon column="strategies" /></span>
                </th>
                <th className="text-left px-3 py-2">DETAIL</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row) => (
                <tr key={row.symbol} onClick={() => handleRowClick(row.symbol)}
                  className="border-b border-border/30 hover:bg-accent/30 cursor-pointer transition-colors">
                  <td className="px-3 py-2">
                    <span className="font-mono font-semibold">{row.symbol.replace('/USD', '')}</span>
                  </td>
                  <td className="text-right px-3 py-2 font-mono">
                    ${row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right px-3 py-2">
                    <span className={`font-mono font-medium ${row.change24h >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {row.change24h >= 0 ? '+' : ''}{row.change24h.toFixed(2)}%
                    </span>
                  </td>
                  <td className="text-right px-3 py-2">
                    {row.pctDiffValue !== null ? (
                      <span className={`font-mono font-medium ${row.pctDiffValue > 0 ? 'text-bull' : row.pctDiffValue < 0 ? 'text-bear' : ''}`}>
                        {row.pctDiffValue > 0 ? '+' : ''}{row.pctDiffValue.toFixed(3)}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="text-right px-3 py-2 font-mono text-muted-foreground">
                    {row.emaValue?.toFixed(3) ?? '-'}
                  </td>
                  <td className="text-right px-3 py-2 font-mono text-muted-foreground">
                    {row.upperBand?.toFixed(3) ?? '-'}
                  </td>
                  <td className="text-right px-3 py-2 font-mono text-muted-foreground">
                    {row.lowerBand?.toFixed(3) ?? '-'}
                  </td>
                  <td className="text-right px-3 py-2">
                    {row.channelWidth !== null ? (
                      <span className={`font-mono ${row.channelWidth < 0.5 ? 'text-yellow-400 font-medium' : 'text-muted-foreground'}`}>
                        {row.channelWidth.toFixed(3)}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="text-center px-3 py-2">
                    {row.regime ? (
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${
                        row.regime === 'trending_bull' ? 'bg-bull/20 text-bull' :
                        row.regime === 'trending_bear' ? 'bg-bear/20 text-bear' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {row.regime === 'trending_bull' ? '↑ Bull' : row.regime === 'trending_bear' ? '↓ Bear' : '⇆ Range'}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {row.strategies.length > 0 ? row.strategies.map(s => (
                        <span key={s} className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium border ${STRATEGY_COLORS[s]}`}>
                          {STRATEGY_LABELS[s]}
                        </span>
                      )) : <span className="text-muted-foreground/50">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <span className="text-[10px] text-muted-foreground truncate block">
                      {row.strategies.length > 0 ? Object.values(row.strategyDetails).join(' | ') : '—'}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && !loading && (
                <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">
                  {data.length === 0 ? 'No data loaded. Click Refresh.' : 'No symbols match current filters.'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
