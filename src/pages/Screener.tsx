import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Settings2, X, Search, Star, Download, Table2, LayoutGrid, Layers, Columns3, GripVertical, Eye, EyeOff, Code2, Trash2 } from 'lucide-react';
import { fetchScreenerData, applyFilters, sortScreenerData, ScreenerRow, ScreenerFilters, ALL_PATTERNS } from '@/lib/screenerService';
import { exportScreenerCSV } from '@/lib/screenerExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useChartStore } from '@/stores/chartStore';
import { Timeframe } from '@/types/trading';
import { ScreenerHeatmap } from '@/components/Screener/ScreenerHeatmap';
import { MultiTimeframePanel } from '@/components/Screener/MultiTimeframePanel';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { Candle } from '@/types/trading';

type SortColumn = keyof ScreenerRow;
type SortOrder = 'asc' | 'desc';
type ViewMode = 'table' | 'heatmap' | 'mtf';

const TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1D', '1W'];

// Column definitions
export interface ColumnDef {
  id: string;
  label: string;
  sortKey?: SortColumn;
  align?: 'left' | 'right' | 'center';
  minWidth?: string;
  render: (row: ScreenerRow) => React.ReactNode;
}

const ALL_COLUMNS: ColumnDef[] = [
  {
    id: 'symbol', label: 'COIN', sortKey: 'symbol', align: 'left',
    render: (row) => <span className="font-mono text-xs font-semibold">{row.symbol.replace('/USD', '')}</span>,
  },
  {
    id: 'price', label: 'PRICE', sortKey: 'price', align: 'right',
    render: (row) => <span className="font-mono text-xs">${row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
  },
  {
    id: 'change24h', label: '24H %', sortKey: 'change24h', align: 'right',
    render: (row) => <span className={`font-mono text-xs font-medium ${row.change24h >= 0 ? 'text-bull' : 'text-bear'}`}>{row.change24h >= 0 ? '+' : ''}{row.change24h.toFixed(2)}%</span>,
  },
  {
    id: 'change7d', label: '7D %', sortKey: 'change7d', align: 'right',
    render: (row) => <span className={`font-mono text-xs ${row.change7d >= 0 ? 'text-bull' : 'text-bear'}`}>{row.change7d ? `${row.change7d >= 0 ? '+' : ''}${row.change7d.toFixed(2)}%` : '-'}</span>,
  },
  {
    id: 'volume24h', label: 'VOL', sortKey: 'volume24h', align: 'right',
    render: (row) => <span className="font-mono text-[10px] text-muted-foreground">${(row.volume24h / 1_000_000).toFixed(0)}M</span>,
  },
  {
    id: 'rsi', label: 'RSI', sortKey: 'rsi', align: 'right',
    render: (row) => <span className={`font-mono text-xs ${row.rsi !== null ? (row.rsi < 30 ? 'text-bull' : row.rsi > 70 ? 'text-bear' : '') : ''}`}>{row.rsi !== null ? row.rsi.toFixed(0) : '-'}</span>,
  },
  {
    id: 'adx', label: 'ADX', sortKey: 'adx', align: 'right',
    render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.adx !== null ? row.adx.toFixed(0) : '-'}</span>,
  },
  {
    id: 'macd', label: 'MACD', align: 'center',
    render: (row) => row.macd ? <span className={row.macd.histogram > 0 ? 'text-bull' : 'text-bear'}>{row.macd.histogram > 0 ? '↗' : '↘'}</span> : <span>-</span>,
  },
  {
    id: 'ichiKumo', label: 'ICHI KUMO', sortKey: 'ichiKumo', align: 'center',
    render: (row) => row.ichiKumo ? <span className={row.ichiKumo === 'bullish' ? 'text-bull' : 'text-bear'}>{row.ichiKumo === 'bullish' ? '↗' : '↘'}</span> : <span>-</span>,
  },
  {
    id: 'ichiTk', label: 'ICHI TK', sortKey: 'ichiTk', align: 'center',
    render: (row) => row.ichiTk ? <span className={row.ichiTk === 'bullish' ? 'text-bull' : 'text-bear'}>{row.ichiTk === 'bullish' ? '↗' : '↘'}</span> : <span>-</span>,
  },
  {
    id: 'msHighs', label: 'MS HIGHS', align: 'center',
    render: (row) => <span className="font-semibold text-xs text-muted-foreground">{row.msHighs || '-'}</span>,
  },
  {
    id: 'msLows', label: 'MS LOWS', align: 'center',
    render: (row) => <span className="font-semibold text-xs text-muted-foreground">{row.msLows || '-'}</span>,
  },
  {
    id: 'supertrend', label: 'TREND', sortKey: 'supertrend', align: 'center',
    render: (row) => row.supertrend === 'bullish'
      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-bull/20 text-bull">↑</span>
      : row.supertrend === 'bearish'
        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-bear/20 text-bear">↓</span>
        : <span>-</span>,
  },
  {
    id: 'pattern', label: 'PATTERN', sortKey: 'pattern', align: 'left',
    render: (row) => <span className="text-[10px] text-muted-foreground max-w-[120px] truncate block">{row.pattern || '-'}</span>,
  },
  {
    id: 'stochRsi', label: 'STOCH RSI', align: 'center',
    render: (row) => row.stochRsi ? <span className="font-mono text-xs text-muted-foreground">{row.stochRsi.k.toFixed(0)}/{row.stochRsi.d.toFixed(0)}</span> : <span>-</span>,
  },
  {
    id: 'bb', label: 'BB BW', align: 'right',
    render: (row) => row.bb ? <span className="font-mono text-xs text-muted-foreground">{row.bb.bandwidth.toFixed(1)}%</span> : <span>-</span>,
  },
  {
    id: 'vwap', label: 'VWAP', sortKey: 'vwap', align: 'right',
    render: (row) => row.vwap ? <span className="font-mono text-xs text-muted-foreground">${row.vwap.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> : <span>-</span>,
  },
  {
    id: 'atr', label: 'ATR', sortKey: 'atr', align: 'right',
    render: (row) => row.atr ? <span className="font-mono text-xs text-muted-foreground">{row.atr.toFixed(2)}</span> : <span>-</span>,
  },
  {
    id: 'ema20', label: 'EMA 20', sortKey: 'ema20', align: 'right',
    render: (row) => row.ema20 ? <span className="font-mono text-xs text-muted-foreground">{row.ema20.toFixed(2)}</span> : <span>-</span>,
  },
  {
    id: 'ema50', label: 'EMA 50', sortKey: 'ema50', align: 'right',
    render: (row) => row.ema50 ? <span className="font-mono text-xs text-muted-foreground">{row.ema50.toFixed(2)}</span> : <span>-</span>,
  },
  {
    id: 'ema200', label: 'EMA 200', sortKey: 'ema200', align: 'right',
    render: (row) => row.ema200 ? <span className="font-mono text-xs text-muted-foreground">{row.ema200.toFixed(2)}</span> : <span>-</span>,
  },
  {
    id: 'sma20', label: 'SMA 20', sortKey: 'sma20', align: 'right',
    render: (row) => row.sma20 ? <span className="font-mono text-xs text-muted-foreground">{row.sma20.toFixed(2)}</span> : <span>-</span>,
  },
  {
    id: 'sma50', label: 'SMA 50', sortKey: 'sma50', align: 'right',
    render: (row) => row.sma50 ? <span className="font-mono text-xs text-muted-foreground">{row.sma50.toFixed(2)}</span> : <span>-</span>,
  },
  {
    id: 'sma200', label: 'SMA 200', sortKey: 'sma200', align: 'right',
    render: (row) => row.sma200 ? <span className="font-mono text-xs text-muted-foreground">{row.sma200.toFixed(2)}</span> : <span>-</span>,
  },
];

const DEFAULT_VISIBLE = ['symbol', 'price', 'change24h', 'change7d', 'volume24h', 'rsi', 'adx', 'macd', 'ichiKumo', 'ichiTk', 'msHighs', 'msLows', 'supertrend', 'pattern'];

function loadColumnConfig(): { visible: string[]; order: string[] } {
  try {
    const saved = localStorage.getItem('screener-columns');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Ensure all column ids are valid
      const allIds = ALL_COLUMNS.map(c => c.id);
      const visible = (parsed.visible || DEFAULT_VISIBLE).filter((id: string) => allIds.includes(id));
      const order = (parsed.order || allIds).filter((id: string) => allIds.includes(id));
      // Add any new columns not in saved order
      allIds.forEach(id => { if (!order.includes(id)) order.push(id); });
      return { visible, order };
    }
  } catch {}
  return { visible: [...DEFAULT_VISIBLE], order: ALL_COLUMNS.map(c => c.id) };
}

function saveColumnConfig(visible: string[], order: string[]) {
  localStorage.setItem('screener-columns', JSON.stringify({ visible, order }));
}

// Custom indicator types
interface CustomIndicator {
  id: string;
  name: string;
  code: string;
}

interface CustomIndicatorResult {
  signal: 'bullish' | 'bearish' | 'neutral';
  value?: number;
  label?: string;
}

function loadCustomIndicators(): CustomIndicator[] {
  try {
    const saved = localStorage.getItem('screener-custom-indicators');
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

function saveCustomIndicators(indicators: CustomIndicator[]) {
  localStorage.setItem('screener-custom-indicators', JSON.stringify(indicators));
}

/**
 * Evaluates custom indicator code against a row's candle data.
 * The code receives: candles, price, ema20, ema50, ema200, sma20, sma50, sma200, rsi, adx, atr, vwap
 * Must return: { signal: 'bullish'|'bearish'|'neutral', value?: number, label?: string }
 */
function evaluateCustomIndicator(code: string, row: ScreenerRow): CustomIndicatorResult {
  try {
    const fn = new Function(
      'candles', 'price', 'ema20', 'ema50', 'ema200', 'sma20', 'sma50', 'sma200',
      'rsi', 'adx', 'atr', 'vwap', 'macdHist', 'stochK', 'stochD',
      'bbUpper', 'bbLower', 'bbMiddle', 'volume',
      code
    );
    const result = fn(
      row.candles, row.price, row.ema20 ?? 0, row.ema50 ?? 0, row.ema200 ?? 0,
      row.sma20 ?? 0, row.sma50 ?? 0, row.sma200 ?? 0,
      row.rsi ?? 0, row.adx ?? 0, row.atr ?? 0, row.vwap ?? 0,
      row.macd?.histogram ?? 0, row.stochRsi?.k ?? 0, row.stochRsi?.d ?? 0,
      row.bb?.upper ?? 0, row.bb?.lower ?? 0, row.bb?.middle ?? 0, row.volume24h
    );
    if (result && typeof result === 'object' && result.signal) {
      return { signal: result.signal, value: result.value, label: result.label };
    }
    // If returns boolean, treat as bullish/bearish
    if (typeof result === 'boolean') {
      return { signal: result ? 'bullish' : 'bearish' };
    }
    return { signal: 'neutral' };
  } catch {
    return { signal: 'neutral' };
  }
}

export const Screener: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ScreenerRow[]>([]);
  const [filteredData, setFilteredData] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>('change24h');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const [filters, setFilters] = useState<ScreenerFilters>({ timeframe: '1D' });
  const [customFormula, setCustomFormula] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Column customization
  const [columnConfig, setColumnConfig] = useState(loadColumnConfig);
  const [draggedCol, setDraggedCol] = useState<string | null>(null);

  // Custom indicators
  const [customIndicators, setCustomIndicators] = useState<CustomIndicator[]>(loadCustomIndicators);
  const [newIndicatorName, setNewIndicatorName] = useState('');
  const [newIndicatorCode, setNewIndicatorCode] = useState('');
  const [indicatorError, setIndicatorError] = useState<string | null>(null);

  // Memoize custom indicator results
  const customIndicatorResults = useMemo(() => {
    const results: Record<string, Record<string, CustomIndicatorResult>> = {};
    customIndicators.forEach(ind => {
      results[ind.id] = {};
      filteredData.forEach(row => {
        results[ind.id][row.symbol] = evaluateCustomIndicator(ind.code, row);
      });
    });
    return results;
  }, [customIndicators, filteredData]);

  const { setSymbol, favorites, toggleFavorite } = useChartStore();

  const visibleColumns = columnConfig.order
    .filter(id => columnConfig.visible.includes(id))
    .map(id => ALL_COLUMNS.find(c => c.id === id)!)
    .filter(Boolean);

  const toggleColumnVisibility = useCallback((colId: string) => {
    setColumnConfig(prev => {
      const newVisible = prev.visible.includes(colId)
        ? prev.visible.filter(id => id !== colId)
        : [...prev.visible, colId];
      saveColumnConfig(newVisible, prev.order);
      return { ...prev, visible: newVisible };
    });
  }, []);

  const handleColumnDragStart = (colId: string) => setDraggedCol(colId);

  const handleColumnDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetId) return;
    setColumnConfig(prev => {
      const newOrder = [...prev.order];
      const fromIdx = newOrder.indexOf(draggedCol);
      const toIdx = newOrder.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, draggedCol);
      saveColumnConfig(prev.visible, newOrder);
      return { ...prev, order: newOrder };
    });
  };

  const handleColumnDragEnd = () => setDraggedCol(null);

  const resetColumns = useCallback(() => {
    const defaultOrder = ALL_COLUMNS.map(c => c.id);
    setColumnConfig({ visible: [...DEFAULT_VISIBLE], order: defaultOrder });
    saveColumnConfig([...DEFAULT_VISIBLE], defaultOrder);
  }, []);

  const addCustomIndicator = useCallback(() => {
    const name = newIndicatorName.trim();
    const code = newIndicatorCode.trim();
    if (!name || !code) {
      setIndicatorError('Name and code are required.');
      return;
    }
    if (name.length > 50) {
      setIndicatorError('Name must be under 50 characters.');
      return;
    }
    // Validate code by running it against a dummy
    try {
      const testFn = new Function(
        'candles', 'price', 'ema20', 'ema50', 'ema200', 'sma20', 'sma50', 'sma200',
        'rsi', 'adx', 'atr', 'vwap', 'macdHist', 'stochK', 'stochD',
        'bbUpper', 'bbLower', 'bbMiddle', 'volume',
        code
      );
      testFn([], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    } catch (e: any) {
      setIndicatorError(`Code error: ${e.message}`);
      return;
    }
    const newInd: CustomIndicator = { id: `ci_${Date.now()}`, name, code };
    const updated = [...customIndicators, newInd];
    setCustomIndicators(updated);
    saveCustomIndicators(updated);
    setNewIndicatorName('');
    setNewIndicatorCode('');
    setIndicatorError(null);
  }, [newIndicatorName, newIndicatorCode, customIndicators]);

  const removeCustomIndicator = useCallback((id: string) => {
    const updated = customIndicators.filter(i => i.id !== id);
    setCustomIndicators(updated);
    saveCustomIndicators(updated);
  }, [customIndicators]);

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
    if (showFavoritesOnly) {
      result = result.filter(r => favorites.includes(r.symbol));
    }
    result = sortScreenerData(result, sortColumn, sortOrder);
    setFilteredData(result);
  }, [data, filters, sortColumn, sortOrder, showFavoritesOnly, favorites]);

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

  const normalizedFilterSearch = filterSearch.trim().toLowerCase();
  const showPriceAction = !normalizedFilterSearch || ['price action', 'candlestick', 'pattern', 'break high', 'break low', 'sweep'].some((term) => term.includes(normalizedFilterSearch));
  const showTrend = !normalizedFilterSearch || ['trend', 'crossover', 'supertrend', 'ema', 'ichimoku'].some((term) => term.includes(normalizedFilterSearch));
  const showMomentum = !normalizedFilterSearch || ['momentum', 'oscillator', 'rsi', 'stochrsi', 'macd', 'adx'].some((term) => term.includes(normalizedFilterSearch));
  const showBollinger = !normalizedFilterSearch || ['bollinger', 'bb', 'squeeze', 'breakout'].some((term) => term.includes(normalizedFilterSearch));
  const showMarketStructure = !normalizedFilterSearch || ['market structure', 'ms highs', 'ms lows', 'hh', 'hl', 'lh', 'll'].some((term) => term.includes(normalizedFilterSearch));
  const showPriceVolume = !normalizedFilterSearch || ['price', 'volume', 'change', 'range'].some((term) => term.includes(normalizedFilterSearch));
  const showCustom = !normalizedFilterSearch || ['custom', 'formula', 'rule'].some((term) => term.includes(normalizedFilterSearch));
  const hasFilterMatches = showPriceAction || showTrend || showMomentum || showBollinger || showMarketStructure || showPriceVolume || showCustom;

  const colCount = visibleColumns.length + 1; // +1 for star column

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Advanced Crypto Screener</h1>
          <p className="text-xs text-muted-foreground">
            {filteredData.length} of {data.length} symbols • {filters.timeframe || '1D'} timeframe
            {showFavoritesOnly && ` • ★ Favorites only`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <TooltipProvider>
            <div className="flex items-center border border-border rounded-md overflow-hidden">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`p-1.5 transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setViewMode('table')}
                  >
                    <Table2 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Table View</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`p-1.5 transition-colors ${viewMode === 'heatmap' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setViewMode('heatmap')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Heatmap View</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`p-1.5 transition-colors ${viewMode === 'mtf' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setViewMode('mtf')}
                  >
                    <Layers className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Multi-Timeframe</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          {/* Column Customization */}
          <Popover>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="px-2">
                      <Columns3 className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Customize Columns</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent className="w-64 max-h-[420px] overflow-y-auto p-0" align="end">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Columns</span>
                <button onClick={resetColumns} className="text-[10px] text-muted-foreground hover:text-foreground underline">Reset</button>
              </div>
              <div className="p-1">
                {columnConfig.order.map(colId => {
                  const col = ALL_COLUMNS.find(c => c.id === colId);
                  if (!col) return null;
                  const isVisible = columnConfig.visible.includes(colId);
                  return (
                    <div
                      key={colId}
                      draggable
                      onDragStart={() => handleColumnDragStart(colId)}
                      onDragOver={(e) => handleColumnDragOver(e, colId)}
                      onDragEnd={handleColumnDragEnd}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-grab text-xs transition-colors hover:bg-accent/50 ${draggedCol === colId ? 'opacity-50 bg-accent' : ''}`}
                    >
                      <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                      <Checkbox
                        checked={isVisible}
                        onCheckedChange={() => toggleColumnVisibility(colId)}
                        className="h-3.5 w-3.5"
                      />
                      <span className={`flex-1 ${isVisible ? 'text-foreground' : 'text-muted-foreground'}`}>{col.label}</span>
                      {isVisible ? <Eye className="h-3 w-3 text-muted-foreground" /> : <EyeOff className="h-3 w-3 text-muted-foreground/50" />}
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {/* Favorites Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showFavoritesOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className="px-2"
                >
                  <Star className={`h-4 w-4 ${showFavoritesOnly ? 'fill-current' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showFavoritesOnly ? 'Show All' : 'Show Favorites Only'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* CSV Export */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => exportScreenerCSV(filteredData)} className="px-2">
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export CSV</TooltipContent>
            </Tooltip>
          </TooltipProvider>

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

                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      placeholder="Search filters (RSI, EMA, Breakout...)"
                      className="h-8 pl-8 pr-8 text-xs"
                    />
                    {filterSearch && (
                      <button
                        type="button"
                        onClick={() => setFilterSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear filter search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <Accordion type="multiple" className="w-full">
                    {/* Price Action */}
                    {showPriceAction && (
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
                          <Button size="sm" variant={filters.breakHigh ? 'default' : 'outline'} className="text-xs" onClick={() => setFilters({ ...filters, breakHigh: !filters.breakHigh })}>Break High</Button>
                          <Button size="sm" variant={filters.breakLow ? 'default' : 'outline'} className="text-xs" onClick={() => setFilters({ ...filters, breakLow: !filters.breakLow })}>Break Low</Button>
                          <Button size="sm" variant={filters.sweepHigh ? 'default' : 'outline'} className="text-xs" onClick={() => setFilters({ ...filters, sweepHigh: !filters.sweepHigh })}>Sweep High</Button>
                          <Button size="sm" variant={filters.sweepLow ? 'default' : 'outline'} className="text-xs" onClick={() => setFilters({ ...filters, sweepLow: !filters.sweepLow })}>Sweep Low</Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                    )}

                    {/* Trend / Crossover */}
                    {showTrend && (
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
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="bullish">Bullish</SelectItem>
                              <SelectItem value="bearish">Bearish</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </AccordionContent>
                      </AccordionItem>
                    )}

                    {/* Momentum / Oscillator */}
                    {showMomentum && (
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
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                    )}

                    {/* Bollinger Bands */}
                    {showBollinger && (
                      <AccordionItem value="bb">
                      <AccordionTrigger className="text-sm py-2">
                        <div>
                          <div className="font-medium">Bollinger Bands</div>
                          <div className="text-xs text-muted-foreground">Volatility and breakout signals.</div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-4">
                        <Button size="sm" variant={filters.bbSqueeze ? 'default' : 'outline'} className="w-full text-xs" onClick={() => setFilters({ ...filters, bbSqueeze: !filters.bbSqueeze })}>
                          BB Squeeze (Low Bandwidth)
                        </Button>
                        <div>
                          <Label className="text-xs text-muted-foreground">BB Breakout</Label>
                          <Select value={filters.bbBreakout || 'any'} onValueChange={(val) => setFilters({ ...filters, bbBreakout: val as any })}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="upper">Above Upper Band</SelectItem>
                              <SelectItem value="lower">Below Lower Band</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </AccordionContent>
                      </AccordionItem>
                    )}

                    {/* Market Structure */}
                    {showMarketStructure && (
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
                              <Button key={val} size="sm" variant={(filters.msHighs || []).includes(val) ? 'default' : 'outline'} className="text-xs flex-1" onClick={() => toggleMsFilter('highs', val)}>{val}</Button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">MS Lows</Label>
                          <div className="flex gap-2">
                            {['HH', 'LH', 'HL', 'LL'].map(val => (
                              <Button key={val} size="sm" variant={(filters.msLows || []).includes(val) ? 'default' : 'outline'} className="text-xs flex-1" onClick={() => toggleMsFilter('lows', val)}>{val}</Button>
                            ))}
                          </div>
                        </div>
                      </AccordionContent>
                      </AccordionItem>
                    )}

                    {/* Price & Volume */}
                    {showPriceVolume && (
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
                    )}

                    {/* Custom Value Filters */}
                    {showCustom && (
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
                    )}

                    {!hasFilterMatches && (
                      <div className="py-3 text-center text-xs text-muted-foreground">
                        No matching filters found.
                      </div>
                    )}
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

      {/* Content area */}
      {viewMode === 'heatmap' ? (
        <div className="flex-1 overflow-auto">
          <ScreenerHeatmap data={filteredData} />
        </div>
      ) : viewMode === 'mtf' ? (
        <MultiTimeframePanel />
      ) : (
        /* Table View */
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr>
                <th className="w-8 p-3"></th>
                {visibleColumns.map(col => (
                  <th
                    key={col.id}
                    className={`p-3 text-xs font-medium text-muted-foreground ${col.sortKey ? 'cursor-pointer hover:bg-accent/50' : ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                    onClick={() => col.sortKey && handleSort(col.sortKey)}
                  >
                    <div className={`flex items-center ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                      {col.label}
                      {col.sortKey && <SortIcon column={col.sortKey} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colCount} className="text-center py-8 text-muted-foreground">Loading...</td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="text-center py-8 text-muted-foreground">No results found. Try adjusting your filters.</td>
                </tr>
              ) : (
                filteredData.map((row) => {
                  const isFav = favorites.includes(row.symbol);
                  return (
                    <tr key={row.symbol} className="border-b border-border hover:bg-accent/30 cursor-pointer transition-colors" onClick={() => handleRowClick(row.symbol)}>
                      <td className="p-2 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(row.symbol); }}
                          className="hover:scale-110 transition-transform"
                        >
                          <Star className={`h-3.5 w-3.5 ${isFav ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-foreground'}`} />
                        </button>
                      </td>
                      {visibleColumns.map(col => (
                        <td
                          key={col.id}
                          className={`p-3 text-xs ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                        >
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
