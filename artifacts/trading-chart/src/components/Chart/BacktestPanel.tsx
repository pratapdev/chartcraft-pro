import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useChartStore } from '@/stores/chartStore';
import {
  Play, Pause, SkipForward, SkipBack, Square, FastForward,
  Upload, X, ChevronUp, ChevronDown, Calendar, BookOpen
} from 'lucide-react';
import { formatShortDate, findIndexByTimestamp } from '@/lib/csvDataLoader';

const SPEED_OPTIONS = [1, 2, 5, 10, 25, 100, 500, 1000];

// Bars advanced per requestAnimationFrame tick at each speed
// Target ~60fps display; at 1x we want 1 bar/500ms = advance 1 bar every ~30 frames
// At high speeds we advance multiple bars per frame
function barsPerFrame(speed: number): number {
  // 1 bar per 500ms at 1x; at 60fps = 16.67ms per frame
  // barsPerFrame = speed / (500 / 16.67) ≈ speed / 30
  return Math.max(1, Math.round(speed / 30));
}

// Frame interval in ms: how many frames to SKIP between advances (for slow speeds)
function msPerAdvance(speed: number): number {
  // At 1x: 1 bar every 500ms. At 25x: 1 every 20ms. At 100x+: batch instead.
  return Math.max(16, Math.round(500 / speed));
}

/**
 * BacktestPanel — uses requestAnimationFrame loop instead of setInterval to avoid
 * blocking the main thread. At high speeds, advances multiple bars per frame.
 * Uses direct store.getState() in the RAF loop to avoid React re-renders during playback.
 */
export const BacktestPanel: React.FC = () => {
  // ── Only subscribe to the fields this panel ACTUALLY renders ──────────
  // This prevents re-renders from unrelated store changes (e.g. crosshairData, alerts)
  const dataSource = useChartStore((s) => s.dataSource);
  const csvLoading = useChartStore((s) => s.csvLoading);
  const csvLoadProgress = useChartStore((s) => s.csvLoadProgress);
  const backtestMeta = useChartStore((s) => s.backtestMeta);
  const backtestTotal = useChartStore((s) => s.backtestCandles.length);

  // These two change every tick during playback — read via getState() in the RAF loop
  // but still subscribe here for UI display (throttled by RAF)
  const backtestIndex = useChartStore((s) => s.backtestIndex);
  const lastCandleTime = useChartStore((s) => {
    const c = s.candles;
    return c.length > 0 ? c[c.length - 1].time : 0;
  });

  const { setBacktestIndex, loadCsvData, clearCsvData, setRightPanelTab } = useChartStore.getState();

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [jumpDate, setJumpDate] = useState('');
  const [jumpError, setJumpError] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const rafRef = useRef<number | null>(null);
  const lastAdvanceTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── RAF-based playback loop ────────────────────────────────────────────
  // Using RAF instead of setInterval keeps the browser responsive because
  // RAF yields to the browser's render pipeline between frames.
  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    lastAdvanceTimeRef.current = performance.now();

    const tick = (now: number) => {
      const store = useChartStore.getState();
      if (store.dataSource !== 'csv') return; // safety guard

      const elapsed = now - lastAdvanceTimeRef.current;
      const interval = msPerAdvance(speed);

      if (elapsed >= interval) {
        const advance = barsPerFrame(speed);
        const current = store.backtestIndex;
        const total = store.backtestCandles.length;

        if (current >= total) {
          setPlaying(false);
          return; // reached end
        }

        store.setBacktestIndex(Math.min(current + advance, total));
        lastAdvanceTimeRef.current = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [speed, stopLoop]);

  useEffect(() => {
    if (playing && dataSource === 'csv') {
      startLoop();
    } else {
      stopLoop();
    }
    return stopLoop;
  }, [playing, dataSource, speed, startLoop, stopLoop]);

  // Stop playing if CSV is unloaded
  useEffect(() => {
    if (dataSource !== 'csv') {
      setPlaying(false);
    }
  }, [dataSource]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPlaying(false);
    const store = useChartStore.getState();
    await store.loadCsvData(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleJumpToDate = useCallback(() => {
    const ts = new Date(jumpDate).getTime() / 1000;
    if (isNaN(ts)) { setJumpError('Invalid date'); return; }
    setJumpError('');
    setPlaying(false);
    const store = useChartStore.getState();
    const idx = findIndexByTimestamp(store.backtestCandles, ts) + 1;
    store.setBacktestIndex(Math.max(1, Math.min(idx, store.backtestCandles.length)));
  }, [jumpDate]);

  // These use getState() so they don't need backtestIndex from the subscription above
  const stepBack = useCallback(() => {
    setPlaying(false);
    const store = useChartStore.getState();
    store.setBacktestIndex(Math.max(1, store.backtestIndex - 1));
  }, []);

  const stepForward = useCallback(() => {
    setPlaying(false);
    const store = useChartStore.getState();
    store.setBacktestIndex(Math.min(store.backtestIndex + 1, store.backtestCandles.length));
  }, []);

  const handleStop = useCallback(() => {
    setPlaying(false);
    useChartStore.getState().setBacktestIndex(1);
  }, []);

  const jumpToEnd = useCallback(() => {
    setPlaying(false);
    const store = useChartStore.getState();
    store.setBacktestIndex(store.backtestCandles.length);
  }, []);

  const handleUnload = useCallback(() => {
    setPlaying(false);
    useChartStore.getState().clearCsvData();
  }, []);

  const pct = backtestTotal > 0 ? (backtestIndex / backtestTotal) * 100 : 0;
  const currentDateStr = lastCandleTime > 0 ? formatShortDate(lastCandleTime) : '—';

  // ── Loading progress ──────────────────────────────────────────────────
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

  // ── No CSV — upload prompt ─────────────────────────────────────────────
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

        <button
          onClick={() => setRightPanelTab('trades')}
          className="trading-btn flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300"
          title="Open Trade Book"
        >
          <BookOpen size={11} />
          Trades
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="trading-btn p-0.5"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>

        <button
          onClick={handleUnload}
          className="trading-btn p-0.5 text-destructive hover:bg-destructive/10"
          title="Unload CSV"
        >
          <X size={11} />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pb-2 space-y-1.5">
          {/* Date + progress bar */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-amber-300 font-semibold">{currentDateStr}</span>
            <div className="flex-1 h-1.5 bg-accent rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
              {backtestIndex.toLocaleString()}/{backtestTotal.toLocaleString()}
            </span>
          </div>

          {/* Seek slider — uncontrolled during play to avoid per-tick React reconciliation */}
          <input
            type="range"
            min={1}
            max={backtestTotal}
            value={backtestIndex}
            onChange={(e) => {
              setPlaying(false);
              useChartStore.getState().setBacktestIndex(parseInt(e.target.value));
            }}
            className="w-full h-1 accent-amber-500 cursor-pointer"
          />

          {/* Controls row */}
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={handleStop} className="trading-btn p-1" title="Reset">
              <Square size={11} />
            </button>
            <button onClick={stepBack} className="trading-btn p-1" title="Step back">
              <SkipBack size={11} />
            </button>
            <button
              onClick={() => setPlaying((p) => !p)}
              className={`trading-btn p-1 ${playing ? 'text-amber-400' : ''}`}
              title={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause size={11} /> : <Play size={11} />}
            </button>
            <button onClick={stepForward} className="trading-btn p-1" title="Step forward">
              <SkipForward size={11} />
            </button>
            <button onClick={jumpToEnd} className="trading-btn p-1" title="Jump to end">
              <FastForward size={11} />
            </button>

            <div className="w-px h-4 bg-border mx-0.5" />

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
