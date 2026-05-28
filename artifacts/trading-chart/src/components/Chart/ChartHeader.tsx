import React, { useState, useRef, useEffect } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { Timeframe } from '@/types/trading';
import { ChartMode } from '@/stores/chartStore';
import { ReplayBar } from './ReplayBar';
import { BacktestPanel } from './BacktestPanel';
import { Globe, ChevronDown, BarChart3, CandlestickChart as CandlestickIcon, Upload, Wifi } from 'lucide-react';

const TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '15m', '1h', '4h', '1D', '1W'];

const TIMEZONES = [
  { value: 'Exchange', label: 'Exchange', abbr: 'Exch' },
  { value: 'UTC', label: 'UTC', abbr: 'UTC' },
  { value: 'America/New_York', label: 'New York', abbr: 'EST' },
  { value: 'America/Chicago', label: 'Chicago', abbr: 'CST' },
  { value: 'America/Los_Angeles', label: 'Los Angeles', abbr: 'PST' },
  { value: 'Europe/London', label: 'London', abbr: 'GMT' },
  { value: 'Europe/Berlin', label: 'Berlin', abbr: 'CET' },
  { value: 'Europe/Moscow', label: 'Moscow', abbr: 'MSK' },
  { value: 'Asia/Kolkata', label: 'Mumbai', abbr: 'IST' },
  { value: 'Asia/Shanghai', label: 'Shanghai', abbr: 'CST' },
  { value: 'Asia/Tokyo', label: 'Tokyo', abbr: 'JST' },
  { value: 'Asia/Singapore', label: 'Singapore', abbr: 'SGT' },
  { value: 'Australia/Sydney', label: 'Sydney', abbr: 'AEST' },
];

export const ChartHeader: React.FC = () => {
  const { symbol, timeframe, setTimeframe, candles, connected, loading, timezone, setTimezone, chartMode, setChartMode, dataSource } = useChartStore();
  const [showTzDropdown, setShowTzDropdown] = useState(false);
  const tzRef = useRef<HTMLDivElement>(null);
  const last = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2] : null;

  const change = last && prev ? last.close - prev.close : 0;
  const changePct = prev ? (change / prev.close) * 100 : 0;
  const isUp = change >= 0;

  const currentTz = TIMEZONES.find((t) => t.value === timezone) || TIMEZONES[0];

  const handleTimeframeChange = async (tf: Timeframe) => {
    if (tf === timeframe) return;
    const store = useChartStore.getState();
    store.stopLiveUpdates();
    store.setTimeframe(tf);
    await store.loadCandles();
    if (store.marketType === 'crypto') {
      store.startLiveUpdates();
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) {
        setShowTzDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div>
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-card min-h-[40px]">
      {/* Symbol + live dot */}
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm text-foreground">{symbol}</span>
        {connected && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse-glow" />
            LIVE
          </span>
        )}
        {loading && (
          <span className="text-[10px] text-muted-foreground">Loading...</span>
        )}
        {last && (
          <>
            <span className={`font-mono text-sm font-semibold ${isUp ? 'text-bull' : 'text-bear'}`}>
              {last.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`font-mono text-xs ${isUp ? 'text-bull' : 'text-bear'}`}>
              {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
            </span>
          </>
        )}
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Timeframes */}
      <div className="flex items-center gap-0.5">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => void handleTimeframeChange(tf)}
            className={`trading-btn ${timeframe === tf ? 'active' : ''}`}
          >
            {tf}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Chart mode toggle */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setChartMode('candles')}
          className={`trading-btn flex items-center gap-1 ${chartMode === 'candles' ? 'active' : ''}`}
          title="Candlestick Chart"
        >
          <CandlestickIcon size={12} />
        </button>
        <button
          onClick={() => setChartMode('footprint')}
          className={`trading-btn flex items-center gap-1 ${chartMode === 'footprint' ? 'active' : ''}`}
          title="Delta Footprint"
        >
          <BarChart3 size={12} />
          <span className="text-[10px]">FP</span>
        </button>
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Live / CSV mode toggle */}
      {dataSource === 'csv' ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 font-semibold tracking-wide animate-pulse">
            📂 CSV MODE
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Wifi size={10} className="text-bull" />
            LIVE
          </span>
        </div>
      )}

      <div className="w-px h-5 bg-border" />
      {/* Only show ReplayBar in live mode */}
      {dataSource === 'live' && <ReplayBar />}

      <div className="w-px h-5 bg-border" />

      {/* Timezone selector */}
      <div className="relative" ref={tzRef}>
        <button
          onClick={() => setShowTzDropdown(!showTzDropdown)}
          className="trading-btn flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <Globe size={12} />
          <span className="text-[11px] font-mono">{currentTz.abbr}</span>
          <ChevronDown size={10} />
        </button>

        {showTzDropdown && (
          <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-xl z-50 min-w-[180px] overflow-hidden">
            <div className="py-1 max-h-[300px] overflow-y-auto">
              {TIMEZONES.map((tz) => (
                <button
                  key={tz.value}
                  onClick={() => {
                    setTimezone(tz.value);
                    setShowTzDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center justify-between ${
                    tz.value === timezone ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  <span>{tz.label}</span>
                  <span className="text-muted-foreground font-mono text-[10px]">{tz.abbr}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* OHLCV */}
      {last && (
        <>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-muted-foreground">
              O <span className="text-foreground">{last.open.toFixed(2)}</span>
            </span>
            <span className="text-muted-foreground">
              H <span className="text-foreground">{last.high.toFixed(2)}</span>
            </span>
            <span className="text-muted-foreground">
              L <span className="text-foreground">{last.low.toFixed(2)}</span>
            </span>
            <span className="text-muted-foreground">
              C <span className={isUp ? 'text-bull' : 'text-bear'}>{last.close.toFixed(2)}</span>
            </span>
            <span className="text-muted-foreground">
              V <span className="text-foreground">{formatVolume(last.volume)}</span>
            </span>
          </div>
        </>
      )}
    </div>
    <BacktestPanel />
    </div>
  );
};

function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}
