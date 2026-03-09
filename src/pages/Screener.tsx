import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Settings2, X, Search } from 'lucide-react';
import { fetchScreenerData, applyFilters, sortScreenerData, ScreenerRow, ScreenerFilters, ALL_PATTERNS } from '@/lib/screenerService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useChartStore } from '@/stores/chartStore';
import { Timeframe } from '@/types/trading';

type SortColumn = keyof ScreenerRow;
type SortOrder = 'asc' | 'desc';

const TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1D', '1W'];

export const Screener: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ScreenerRow[]>([]);
  const [filteredData, setFilteredData] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>('change24h');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  const [filters, setFilters] = useState<ScreenerFilters>({ timeframe: '1D' });
  const [customFormula, setCustomFormula] = useState('');

  const { setSymbol } = useChartStore();

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await fetchScreenerData(filters.timeframe || '1D');
      setData(result);
    } catch (err) {
      console.error('Failed to load screener data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filters.timeframe]);

  useEffect(() => {
    let result = applyFilters(data, filters);
    result = sortScreenerData(result, sortColumn, sortOrder);
    setFilteredData(result);
  }, [data, filters, sortColumn, sortOrder]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortOrder('desc');
    }
  };

  const handleRowClick = (symbol: string) => {
    setSymbol(symbol);
    navigate('/');
  };

  const resetFilters = () => {
    setFilters({ timeframe: filters.timeframe });
    setCustomFormula('');
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    return sortOrder === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const togglePattern = (pattern: string) => {
    const current = filters.candlePattern || [];
    if (current.includes(pattern)) {
      setFilters({ ...filters, candlePattern: current.filter(p => p !== pattern) });
    } else {
      setFilters({ ...filters, candlePattern: [...current, pattern] });
    }
  };

  const toggleMsFilter = (type: 'highs' | 'lows', value: string) => {
    const key = type === 'highs' ? 'msHighs' : 'msLows';
    const current = filters[key] || [];
    if (current.includes(value)) {
      setFilters({ ...filters, [key]: current.filter(v => v !== value) });
    } else {
      setFilters({ ...filters, [key]: [...current, value] });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Advanced Crypto Screener</h1>
          <p className="text-xs text-muted-foreground">
            {filteredData.length} of {data.length} symbols • {filters.timeframe || '1D'} timeframe
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="mr-2 h-4 w-4" />
                Filters & Alerts
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[440px] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters & Alerts</SheetTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Filter the dashboard data by selecting timeframe, indicators, assets, and exchange. Create a Strategy Alert to setup push notifications.
                </p>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                {/* Timeframe Selection */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px]">1</span>
                    SELECT TIMEFRAME
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {TIMEFRAMES.map(tf => (
                      <Button
                        key={tf}
                        size="sm"
                        variant={filters.timeframe === tf ? 'default' : 'outline'}
                        className="text-xs"
                        onClick={() => setFilters({ ...filters, timeframe: tf })}
                      >
                        {tf}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Indicators Section */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px]">2</span>
                    SELECT INDICATORS
                  </Label>
                  
                  <Accordion type="multiple" className="w-full">
                    {/* Price Action */}
                    <AccordionItem value="price-action">
                      <AccordionTrigger className="text-sm py-2">
                        <div>
                          <div className="font-medium">Price Action</div>
                          <div className="text-xs text-muted-foreground">Identify key patterns and levels using candlesticks, support/resistance, breakouts, and Fibonacci zones.</div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-4">
                        <div className="flex flex-wrap gap-2">
                          {ALL_PATTERNS.map(pattern => (
                            <Button
                              key={pattern}
                              size="sm"
                              variant={(filters.candlePattern || []).includes(pattern) ? 'default' : 'outline'}
                              className="text-xs"
                              onClick={() => togglePattern(pattern)}
                            >
                              {pattern}
                            </Button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            variant={filters.breakHigh ? 'default' : 'outline'}
                            className="text-xs"
                            onClick={() => setFilters({ ...filters, breakHigh: !filters.breakHigh })}
                          >
                            Break High
                          </Button>
                          <Button
                            size="sm"
                            variant={filters.breakLow ? 'default' : 'outline'}
                            className="text-xs"
                            onClick={() => setFilters({ ...filters, breakLow: !filters.breakLow })}
                          >
                            Break Low
                          </Button>
                          <Button
                            size="sm"
                            variant={filters.sweepHigh ? 'default' : 'outline'}
                            className="text-xs"
                            onClick={() => setFilters({ ...filters, sweepHigh: !filters.sweepHigh })}
                          >
                            Sweep High
                          </Button>
                          <Button
                            size="sm"
                            variant={filters.sweepLow ? 'default' : 'outline'}
                            className="text-xs"
                            onClick={() => setFilters({ ...filters, sweepLow: !filters.sweepLow })}
                          >
                            Sweep Low
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Trend / Crossover */}
                    <AccordionItem value="trend">
                      <AccordionTrigger className="text-sm py-2">
                        <div>
                          <div className="font-medium">Trend / Crossover</div>
                          <div className="text-xs text-muted-foreground">Identify market direction and shifts using trend indicators and crossover signals.</div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">Supertrend Direction</Label>
                          <Select value={filters.trendDirection || 'any'} onValueChange={(val) => setFilters({ ...filters, trendDirection: val as any })}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="bullish">Bullish</SelectItem>
                              <SelectItem value="bearish">Bearish</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">EMA 20/50 Cross</Label>
                          <Select value={filters.emaCross || 'any'} onValueChange={(val) => setFilters({ ...filters, emaCross: val as any })}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="bullish">Bullish (20 &gt; 50)</SelectItem>
                              <SelectItem value="bearish">Bearish (20 &lt; 50)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Price vs EMA 200</Label>
                          <Select value={filters.priceVsEma200 || 'any'} onValueChange={(val) => setFilters({ ...filters, priceVsEma200: val as any })}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="above">Above</SelectItem>
                              <SelectItem value="below">Below</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Ichimoku Kumo</Label>
                          <Select value={filters.ichiKumo || 'any'} onValueChange={(val) => setFilters({ ...filters, ichiKumo: val as any })}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="bullish">Bullish (Above Cloud)</SelectItem>
                              <SelectItem value="bearish">Bearish (Below Cloud)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Ichimoku TK Cross</Label>
                          <Select value={filters.ichiTk || 'any'} onValueChange={(val) => setFilters({ ...filters, ichiTk: val as any })}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="bullish">Bullish</SelectItem>
                              <SelectItem value="bearish">Bearish</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Momentum / Oscillator */}
                    <AccordionItem value="momentum">
                      <AccordionTrigger className="text-sm py-2">
                        <div>
                          <div className="font-medium">Momentum / Oscillator</div>
                          <div className="text-xs text-muted-foreground">Identify movement intensity and turning points, including overbought/oversold signals.</div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-4">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">RSI Oversold (&lt;)</Label>
                            <Input type="number" placeholder="30" value={filters.rsiOversold ?? ''} onChange={(e) => setFilters({ ...filters, rsiOversold: e.target.value ? parseFloat(e.target.value) : undefined })} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">RSI Overbought (&gt;)</Label>
                            <Input type="number" placeholder="70" value={filters.rsiOverbought ?? ''} onChange={(e) => setFilters({ ...filters, rsiOverbought: e.target.value ? parseFloat(e.target.value) : undefined })} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">StochRSI Oversold (&lt;)</Label>
                            <Input type="number" placeholder="20" value={filters.stochRsiOversold ?? ''} onChange={(e) => setFilters({ ...filters, stochRsiOversold: e.target.value ? parseFloat(e.target.value) : undefined })} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">StochRSI Overbought (&gt;)</Label>
                            <Input type="number" placeholder="80" value={filters.stochRsiOverbought ?? ''} onChange={(e) => setFilters({ ...filters, stochRsiOverbought: e.target.value ? parseFloat(e.target.value) : undefined })} />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">MACD Cross</Label>
                          <Select value={filters.macdCross || 'any'} onValueChange={(val) => setFilters({ ...filters, macdCross: val as any })}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="bullish">Bullish (Above Signal)</SelectItem>
                              <SelectItem value="bearish">Bearish (Below Signal)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Min ADX (Trend Strength)</Label>
                          <Input type="number" placeholder="25" value={filters.minAdx ?? ''} onChange={(e) => setFilters({ ...filters, minAdx: e.target.value ? parseFloat(e.target.value) : undefined })} />
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Bollinger Bands */}
                    <AccordionItem value="bb">
                      <AccordionTrigger className="text-sm py-2">
                        <div>
                          <div className="font-medium">Bollinger Bands</div>
                          <div className="text-xs text-muted-foreground">Volatility and breakout signals.</div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-4">
                        <Button
                          size="sm"
                          variant={filters.bbSqueeze ? 'default' : 'outline'}
                          className="w-full text-xs"
                          onClick={() => setFilters({ ...filters, bbSqueeze: !filters.bbSqueeze })}
                        >
                          BB Squeeze (Low Bandwidth)
                        </Button>
                        <div>
                          <Label className="text-xs text-muted-foreground">BB Breakout</Label>
                          <Select value={filters.bbBreakout || 'any'} onValueChange={(val) => setFilters({ ...filters, bbBreakout: val as any })}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="upper">Above Upper Band</SelectItem>
                              <SelectItem value="lower">Below Lower Band</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Market Structure */}
                    <AccordionItem value="ms">
                      <AccordionTrigger className="text-sm py-2">
                        <div>
                          <div className="font-medium">Market Structure</div>
                          <div className="text-xs text-muted-foreground">Higher Highs, Lower Lows, etc.</div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-4">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">MS Highs</Label>
                          <div className="flex gap-2">
                            {['HH', 'LH', 'HL', 'LL'].map(val => (
                              <Button
                                key={val}
                                size="sm"
                                variant={(filters.msHighs || []).includes(val) ? 'default' : 'outline'}
                                className="text-xs flex-1"
                                onClick={() => toggleMsFilter('highs', val)}
                              >
                                {val}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">MS Lows</Label>
                          <div className="flex gap-2">
                            {['HH', 'LH', 'HL', 'LL'].map(val => (
                              <Button
                                key={val}
                                size="sm"
                                variant={(filters.msLows || []).includes(val) ? 'default' : 'outline'}
                                className="text-xs flex-1"
                                onClick={() => toggleMsFilter('lows', val)}
                              >
                                {val}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Price & Volume */}
                    <AccordionItem value="price-volume">
                      <AccordionTrigger className="text-sm py-2">
                        <div className="font-medium">Price & Volume Filters</div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">Price Range ($)</Label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <Input type="number" placeholder="Min" value={filters.minPrice ?? ''} onChange={(e) => setFilters({ ...filters, minPrice: e.target.value ? parseFloat(e.target.value) : undefined })} />
                            <Input type="number" placeholder="Max" value={filters.maxPrice ?? ''} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value ? parseFloat(e.target.value) : undefined })} />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">24h Volume ($)</Label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <Input type="number" placeholder="Min" value={filters.minVolume ?? ''} onChange={(e) => setFilters({ ...filters, minVolume: e.target.value ? parseFloat(e.target.value) : undefined })} />
                            <Input type="number" placeholder="Max" value={filters.maxVolume ?? ''} onChange={(e) => setFilters({ ...filters, maxVolume: e.target.value ? parseFloat(e.target.value) : undefined })} />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">24h Change (%)</Label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <Input type="number" placeholder="Min %" value={filters.minChange ?? ''} onChange={(e) => setFilters({ ...filters, minChange: e.target.value ? parseFloat(e.target.value) : undefined })} />
                            <Input type="number" placeholder="Max %" value={filters.maxChange ?? ''} onChange={(e) => setFilters({ ...filters, maxChange: e.target.value ? parseFloat(e.target.value) : undefined })} />
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Custom Value Filters */}
                    <AccordionItem value="custom">
                      <AccordionTrigger className="text-sm py-2">
                        <div>
                          <div className="font-medium">Custom Value Filters</div>
                          <div className="text-xs text-muted-foreground">Define your own filters using specific indicators, comparison rules, and custom values.</div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-4">
                        <p className="text-xs text-muted-foreground">
                          Example: <code className="bg-muted px-1 rounded text-[10px]">rsi &lt; 30 && ema20 &gt; ema50 && adx &gt; 25</code>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Available: price, change, volume, rsi, ema20, ema50, ema200, sma20, sma50, sma200, adx, atr, vwap, macd, stochK, stochD, bbUpper, bbLower, bbBandwidth
                        </p>
                        <Input
                          placeholder="rsi < 30 && change > 5"
                          value={customFormula}
                          onChange={(e) => setCustomFormula(e.target.value)}
                        />
                        <Button size="sm" className="w-full" onClick={() => setFilters({ ...filters, customFormula: customFormula || undefined })}>
                          Apply Formula
                        </Button>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>

                <Separator />

                <Button variant="outline" className="w-full" onClick={resetFilters}>
                  Reset All Filters
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-card border-b border-border z-10">
            <tr>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('symbol')}>
                <div className="flex items-center">COIN <SortIcon column="symbol" /></div>
              </th>
              <th className="text-right p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('price')}>
                <div className="flex items-center justify-end">PRICE <SortIcon column="price" /></div>
              </th>
              <th className="text-right p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('change24h')}>
                <div className="flex items-center justify-end">24H % <SortIcon column="change24h" /></div>
              </th>
              <th className="text-right p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('change7d')}>
                <div className="flex items-center justify-end">7D % <SortIcon column="change7d" /></div>
              </th>
              <th className="text-right p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('volume24h')}>
                <div className="flex items-center justify-end">VOL <SortIcon column="volume24h" /></div>
              </th>
              <th className="text-right p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('rsi')}>
                <div className="flex items-center justify-end">RSI <SortIcon column="rsi" /></div>
              </th>
              <th className="text-right p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('adx')}>
                <div className="flex items-center justify-end">ADX <SortIcon column="adx" /></div>
              </th>
              <th className="text-center p-3 text-xs font-medium text-muted-foreground">MACD</th>
              <th className="text-center p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('ichiKumo')}>
                <div className="flex items-center justify-center">ICHI KUMO <SortIcon column="ichiKumo" /></div>
              </th>
              <th className="text-center p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('ichiTk')}>
                <div className="flex items-center justify-center">ICHI TK <SortIcon column="ichiTk" /></div>
              </th>
              <th className="text-center p-3 text-xs font-medium text-muted-foreground">MS HIGHS</th>
              <th className="text-center p-3 text-xs font-medium text-muted-foreground">MS LOWS</th>
              <th className="text-center p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('supertrend')}>
                <div className="flex items-center justify-center">TREND <SortIcon column="supertrend" /></div>
              </th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('pattern')}>
                <div className="flex items-center">PATTERN <SortIcon column="pattern" /></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={14} className="text-center py-8 text-muted-foreground">Loading...</td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={14} className="text-center py-8 text-muted-foreground">No results found. Try adjusting your filters.</td>
              </tr>
            ) : (
              filteredData.map((row) => (
                <tr key={row.symbol} className="border-b border-border hover:bg-accent/30 cursor-pointer transition-colors" onClick={() => handleRowClick(row.symbol)}>
                  <td className="p-3 font-mono text-xs font-semibold">{row.symbol.replace('/USD', '')}</td>
                  <td className="p-3 text-right font-mono text-xs">${row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className={`p-3 text-right font-mono text-xs font-medium ${row.change24h >= 0 ? 'text-bull' : 'text-bear'}`}>
                    {row.change24h >= 0 ? '+' : ''}{row.change24h.toFixed(2)}%
                  </td>
                  <td className={`p-3 text-right font-mono text-xs ${row.change7d >= 0 ? 'text-bull' : 'text-bear'}`}>
                    {row.change7d ? `${row.change7d >= 0 ? '+' : ''}${row.change7d.toFixed(2)}%` : '-'}
                  </td>
                  <td className="p-3 text-right font-mono text-[10px] text-muted-foreground">
                    ${(row.volume24h / 1_000_000).toFixed(0)}M
                  </td>
                  <td className={`p-3 text-right font-mono text-xs ${row.rsi !== null ? (row.rsi < 30 ? 'text-bull' : row.rsi > 70 ? 'text-bear' : '') : ''}`}>
                    {row.rsi !== null ? row.rsi.toFixed(0) : '-'}
                  </td>
                  <td className="p-3 text-right font-mono text-xs text-muted-foreground">
                    {row.adx !== null ? row.adx.toFixed(0) : '-'}
                  </td>
                  <td className="p-3 text-center text-xs">
                    {row.macd ? (
                      <span className={row.macd.histogram > 0 ? 'text-bull' : 'text-bear'}>
                        {row.macd.histogram > 0 ? '↗' : '↘'}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-center text-xs">
                    {row.ichiKumo ? (
                      <span className={row.ichiKumo === 'bullish' ? 'text-bull' : 'text-bear'}>
                        {row.ichiKumo === 'bullish' ? '↗' : '↘'}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-center text-xs">
                    {row.ichiTk ? (
                      <span className={row.ichiTk === 'bullish' ? 'text-bull' : 'text-bear'}>
                        {row.ichiTk === 'bullish' ? '↗' : '↘'}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-center text-xs font-semibold text-muted-foreground">{row.msHighs || '-'}</td>
                  <td className="p-3 text-center text-xs font-semibold text-muted-foreground">{row.msLows || '-'}</td>
                  <td className="p-3 text-center">
                    {row.supertrend === 'bullish' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-bull/20 text-bull">↑</span>
                    ) : row.supertrend === 'bearish' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-bear/20 text-bear">↓</span>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-[10px] text-muted-foreground max-w-[120px] truncate">{row.pattern || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
