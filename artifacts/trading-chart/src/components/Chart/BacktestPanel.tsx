import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { useTradeStore } from '@/stores/tradeStore';
import {
  Play, Pause, SkipForward, SkipBack, Square, FastForward,
  Upload, X, ChevronUp, ChevronDown, Calendar, BookOpen
} from 'lucide-react';
import { formatShortDate, findIndexByTimestamp } from '@/lib/csvDataLoader';

const SPEED_OPTIONS = [1, 2, 5, 10, 25, 100, 500, 1000];

export const BacktestPanel: React.FC = () => {
  const {
    dataSource,
    backtestCandles,
    backtestMeta,
    backtestIndex,
    csvLoading,
    csvLoadProgress,
    setBacktestIndex,
    loadCsvData,
    clearCsvData,
    candles,
    setRightPanelTab,
  } = useChartStore();

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [jumpDate, setJumpDate] = useState('');
  const [jumpError, setJumpError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Play / pause interval
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (playing && dataSource === 'csv') {
      const ms = Math.max(16, 500 / speed);
      intervalRef.current = setInterval(() => {
        const current = useChartStore.getState().backtestIndex;
        const total = useChartStore.getState().backtestCandles.length;
        if (current >= total) {
          setPlaying(false);
          return;
        }
        useChartStore.getState().setBacktestIndex(current + 1);
      }, ms);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, dataSource, speed]);

  // Stop playing if we exit CSV mode
  useEffect(() => {
    if (dataSource !== 'csv') setPlaying(false);
  }, [dataSource]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPlaying(false);
    await loadCsvData(file);
    // Reset file input so the same file can be re-loaded if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [loadCsvData]);

  const handleJumpToDate = () => {
    const ts = new Date(jumpDate).getTime() / 1000;
    if (isNaN(ts)) {
      setJumpError('Invalid date');
      return;
    }
    setJumpError('');
    setPlaying(false);
    const idx = findIndexByTimestamp(backtestCandles, ts) + 1;
    setBacktestIndex(Math.max(1, Math.min(idx, backtestCandles.length)));
  };

  const stepBack = () => { setPlaying(false); setBacktestIndex(Math.max(1, backtestIndex - 1)); };
  const stepForward = () => { setPlaying(false); setBacktestIndex(Math.min(backtestIndex + 1, backtestCandles.length)); };
  const handleStop = () => { setPlaying(false); setBacktestIndex(1); };
  const jumpToEnd = () => { setPlaying(false); setBacktestIndex(backtestCandles.length); };

  const total = backtestCandles.length;
  const pct = total > 0 ? (backtestIndex / total) * 100 : 0;
  const currentCandle = candles[candles.length - 1];
  const currentDateStr = currentCandle ? formatShortDate(currentCandle.time) : '—';

  // ── Upload / Loading State ──────────────────────────────────────────────
  if (csvLoading) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 bg-amber-950/30 border-b border-amber-700/40 text-xs">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-amber-400 font-medium">Loading CSV...</span>
            <span className="text-amber-300 font-mono">{csvLoadProgress}%</span>
          </div>
          <div className="w-full h-1.5 bg-accent rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-300"
              style={{ width: `${csvLoadProgress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── No CSV loaded — show upload prompt ─────────────────────────────────
  if (dataSource === 'live') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card text-xs text-muted-foreground">
        <Upload size={12} className="shrink-0" />
        <span>Load CSV for backtesting:</span>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="trading-btn bg-primary/10 hover:bg-primary/20 text-primary font-medium px-2 py-0.5"
        >
          Choose File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,.tsv"
          onChange={handleFileChange}
          className="hidden"
          id="csv-file-input"
        />
        <span className="text-[10px] opacity-60">Tab-separated: datetime open high low close volume</span>
      </div>
    );
  }

  // ── CSV Active — Playback Controls ─────────────────────────────────────
  return (
    <div className="border-b border-amber-700/50 bg-amber-950/20">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        {/* Dataset badge */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 font-semibold tracking-wide shrink-0">
            📂 CSV
          </span>
          {backtestMeta && (
            <span className="text-[10px] text-amber-400/70 truncate hidden sm:block">
              {backtestMeta.fileName} · {backtestMeta.rowCount.toLocaleString()} bars · {backtestMeta.detectedTimeframe}
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Trade Book shortcut */}
        <button
          onClick={() => setRightPanelTab('trades')}
          className="trading-btn flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300"
          title="Open Trade Book"
        >
          <BookOpen size={11} />
          Trades
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="trading-btn p-0.5"
          title={collapsed ? 'Expand controls' : 'Collapse controls'}
        >
          {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>

        {/* Unload CSV */}
        <button
          onClick={() => { setPlaying(false); clearCsvData(); }}
          className="trading-btn p-0.5 text-destructive hover:bg-destructive/10"
          title="Unload CSV – return to live mode"
        >
          <X size={11} />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pb-2 space-y-1.5">
          {/* Current date + progress */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-amber-300 font-semibold">{currentDateStr}</span>
            <div className="flex-1 h-1.5 bg-accent rounded-full overflow-hidden cursor-pointer">
              <div className="h-full bg-amber-500 rounded-full transition-none" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
              {backtestIndex.toLocaleString()}/{total.toLocaleString()}
            </span>
          </div>

          {/* Seek slider */}
          <input
            type="range"
            min={1}
            max={total}
            value={backtestIndex}
            onChange={(e) => {
              setPlaying(false);
              setBacktestIndex(parseInt(e.target.value));
            }}
            className="w-full h-1 accent-amber-500 cursor-pointer"
          />

          {/* Control buttons */}
          <div className="flex items-center gap-1 flex-wrap">
            {/* Transport */}
            <button onClick={handleStop} className="trading-btn p-1" title="Reset to start">
              <Square size={11} />
            </button>
            <button onClick={stepBack} className="trading-btn p-1" title="Step back 1 bar">
              <SkipBack size={11} />
            </button>
            <button
              onClick={() => setPlaying(!playing)}
              className={`trading-btn p-1 ${playing ? 'text-amber-400' : ''}`}
              title={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause size={11} /> : <Play size={11} />}
            </button>
            <button onClick={stepForward} className="trading-btn p-1" title="Step forward 1 bar">
              <SkipForward size={11} />
            </button>
            <button onClick={jumpToEnd} className="trading-btn p-1" title="Jump to end">
              <FastForward size={11} />
            </button>

            <div className="w-px h-4 bg-border mx-0.5" />

            {/* Speed */}
            <FastForward size={9} className="text-muted-foreground" />
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                  speed === s
                    ? 'bg-amber-500 text-black font-bold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {s}x
              </button>
            ))}

            <div className="w-px h-4 bg-border mx-0.5" />

            {/* Jump to date */}
            <Calendar size={9} className="text-muted-foreground" />
            <input
              type="datetime-local"
              value={jumpDate}
              onChange={(e) => { setJumpDate(e.target.value); setJumpError(''); }}
              className="text-[10px] bg-accent text-foreground px-1.5 py-0.5 rounded outline-none border border-transparent focus:border-amber-500/50 w-36"
              title="Jump to date"
            />
            <button
              onClick={handleJumpToDate}
              className="trading-btn text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
            >
              Go
            </button>
            {jumpError && <span className="text-[10px] text-destructive">{jumpError}</span>}
          </div>
        </div>
      )}
    </div>
  );
};
