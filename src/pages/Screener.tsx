import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Settings2 } from 'lucide-react';
import { fetchScreenerData, applyFilters, sortScreenerData, ScreenerRow, ScreenerFilters } from '@/lib/screenerService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useChartStore } from '@/stores/chartStore';

type SortColumn = keyof ScreenerRow;
type SortOrder = 'asc' | 'desc';

export const Screener: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ScreenerRow[]>([]);
  const [filteredData, setFilteredData] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>('change24h');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  const [filters, setFilters] = useState<ScreenerFilters>({});
  const [customFormula, setCustomFormula] = useState('');

  const { setSymbol } = useChartStore();

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await fetchScreenerData('1D');
      setData(result);
    } catch (err) {
      console.error('Failed to load screener data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const applyCustomFormula = () => {
    setFilters({ ...filters, customFormula: customFormula || undefined });
  };

  const resetFilters = () => {
    setFilters({});
    setCustomFormula('');
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    return sortOrder === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Crypto Screener</h1>
          <p className="text-xs text-muted-foreground">
            {filteredData.length} of {data.length} symbols
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="mr-2 h-4 w-4" />
                Filters
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Screener Filters</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                {/* Price Range */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Price Range ($)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={filters.minPrice ?? ''}
                      onChange={(e) => setFilters({ ...filters, minPrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                    />
                    <Input
                      type="number"
                      placeholder="Max"
                      value={filters.maxPrice ?? ''}
                      onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                    />
                  </div>
                </div>

                {/* Volume Range */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">24h Volume ($)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={filters.minVolume ?? ''}
                      onChange={(e) => setFilters({ ...filters, minVolume: e.target.value ? parseFloat(e.target.value) : undefined })}
                    />
                    <Input
                      type="number"
                      placeholder="Max"
                      value={filters.maxVolume ?? ''}
                      onChange={(e) => setFilters({ ...filters, maxVolume: e.target.value ? parseFloat(e.target.value) : undefined })}
                    />
                  </div>
                </div>

                {/* Change % Range */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">24h Change (%)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="Min %"
                      value={filters.minChange ?? ''}
                      onChange={(e) => setFilters({ ...filters, minChange: e.target.value ? parseFloat(e.target.value) : undefined })}
                    />
                    <Input
                      type="number"
                      placeholder="Max %"
                      value={filters.maxChange ?? ''}
                      onChange={(e) => setFilters({ ...filters, maxChange: e.target.value ? parseFloat(e.target.value) : undefined })}
                    />
                  </div>
                </div>

                <Separator />

                {/* RSI Conditions */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">RSI Conditions</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Oversold (&lt;)</Label>
                      <Input
                        type="number"
                        placeholder="30"
                        value={filters.rsiOversold ?? ''}
                        onChange={(e) => setFilters({ ...filters, rsiOversold: e.target.value ? parseFloat(e.target.value) : undefined })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Overbought (&gt;)</Label>
                      <Input
                        type="number"
                        placeholder="70"
                        value={filters.rsiOverbought ?? ''}
                        onChange={(e) => setFilters({ ...filters, rsiOverbought: e.target.value ? parseFloat(e.target.value) : undefined })}
                      />
                    </div>
                  </div>
                </div>

                {/* Trend Direction */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Trend Direction</Label>
                  <Select
                    value={filters.trendDirection ?? 'any'}
                    onValueChange={(val) => setFilters({ ...filters, trendDirection: val as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="bullish">Bullish</SelectItem>
                      <SelectItem value="bearish">Bearish</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Custom Formula */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Custom Formula</Label>
                  <p className="text-xs text-muted-foreground">
                    Example: <code className="bg-muted px-1 rounded">rsi &lt; 30 && volume &gt; 1000000</code>
                  </p>
                  <Input
                    placeholder="rsi < 30 && change > 5"
                    value={customFormula}
                    onChange={(e) => setCustomFormula(e.target.value)}
                  />
                  <Button size="sm" className="w-full" onClick={applyCustomFormula}>
                    Apply Formula
                  </Button>
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
                <div className="flex items-center">Symbol <SortIcon column="symbol" /></div>
              </th>
              <th className="text-right p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('price')}>
                <div className="flex items-center justify-end">Price <SortIcon column="price" /></div>
              </th>
              <th className="text-right p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('change24h')}>
                <div className="flex items-center justify-end">24h % <SortIcon column="change24h" /></div>
              </th>
              <th className="text-right p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('change7d')}>
                <div className="flex items-center justify-end">7d % <SortIcon column="change7d" /></div>
              </th>
              <th className="text-right p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('volume24h')}>
                <div className="flex items-center justify-end">Volume <SortIcon column="volume24h" /></div>
              </th>
              <th className="text-right p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('rsi')}>
                <div className="flex items-center justify-end">RSI <SortIcon column="rsi" /></div>
              </th>
              <th className="text-right p-3 text-xs font-medium text-muted-foreground">
                MACD
              </th>
              <th className="text-center p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('supertrend')}>
                <div className="flex items-center justify-center">Trend <SortIcon column="supertrend" /></div>
              </th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent/50" onClick={() => handleSort('pattern')}>
                <div className="flex items-center">Pattern <SortIcon column="pattern" /></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-muted-foreground">
                  No results found. Try adjusting your filters.
                </td>
              </tr>
            ) : (
              filteredData.map((row) => (
                <tr
                  key={row.symbol}
                  className="border-b border-border hover:bg-accent/30 cursor-pointer transition-colors"
                  onClick={() => handleRowClick(row.symbol)}
                >
                  <td className="p-3 font-mono text-sm font-semibold">{row.symbol}</td>
                  <td className="p-3 text-right font-mono text-sm">${row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className={`p-3 text-right font-mono text-sm font-medium ${row.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {row.change24h >= 0 ? '+' : ''}{row.change24h.toFixed(2)}%
                  </td>
                  <td className={`p-3 text-right font-mono text-sm ${row.change7d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {row.change7d ? `${row.change7d >= 0 ? '+' : ''}${row.change7d.toFixed(2)}%` : '-'}
                  </td>
                  <td className="p-3 text-right font-mono text-xs text-muted-foreground">
                    ${(row.volume24h / 1_000_000).toFixed(2)}M
                  </td>
                  <td className={`p-3 text-right font-mono text-sm ${row.rsi !== null ? (row.rsi < 30 ? 'text-green-500' : row.rsi > 70 ? 'text-red-500' : '') : ''}`}>
                    {row.rsi !== null ? row.rsi.toFixed(1) : '-'}
                  </td>
                  <td className="p-3 text-right font-mono text-xs text-muted-foreground">
                    {row.macd ? (
                      <div className={row.macd.histogram > 0 ? 'text-green-500' : 'text-red-500'}>
                        {row.macd.histogram.toFixed(2)}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-center">
                    {row.supertrend === 'bullish' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-500">
                        ↑ Bull
                      </span>
                    ) : row.supertrend === 'bearish' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-500">
                        ↓ Bear
                      </span>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{row.pattern || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
