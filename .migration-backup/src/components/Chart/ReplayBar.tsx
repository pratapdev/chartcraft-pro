import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { Play, Pause, SkipForward, SkipBack, Square, FastForward } from 'lucide-react';

const SPEED_OPTIONS = [1, 2, 5, 10, 25];

export const ReplayBar: React.FC = () => {
  const { candles } = useChartStore();
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [barIndex, setBarIndex] = useState(50); // start from bar 50
  const [speed, setSpeed] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fullCandlesRef = useRef(candles);

  // Keep a snapshot of full candles when replay starts
  useEffect(() => {
    if (!active) {
      fullCandlesRef.current = candles;
    }
  }, [candles, active]);

  const visibleCandles = active ? fullCandlesRef.current.slice(0, barIndex) : null;

  // Push visible candles to the store when in replay mode
  useEffect(() => {
    if (active && visibleCandles) {
      useChartStore.setState({ candles: visibleCandles });
    }
  }, [active, barIndex]);

  // Restore full candles when exiting replay
  const handleStop = useCallback(() => {
    setActive(false);
    setPlaying(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    useChartStore.setState({ candles: fullCandlesRef.current });
  }, []);

  const handleStart = useCallback(() => {
    fullCandlesRef.current = useChartStore.getState().candles;
    setActive(true);
    setBarIndex(50);
    setPlaying(false);
  }, []);

  // Play/pause interval
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (playing && active) {
      const ms = Math.max(50, 500 / speed);
      intervalRef.current = setInterval(() => {
        setBarIndex((prev) => {
          if (prev >= fullCandlesRef.current.length) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, ms);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, active, speed]);

  const stepForward = () => setBarIndex((i) => Math.min(i + 1, fullCandlesRef.current.length));
  const stepBack = () => setBarIndex((i) => Math.max(i - 1, 1));

  if (!active) {
    return (
      <button
        onClick={handleStart}
        className="trading-btn flex items-center gap-1 text-[10px]"
        title="Enter replay mode"
      >
        <Play size={10} />
        Replay
      </button>
    );
  }

  const total = fullCandlesRef.current.length;
  const pct = total > 0 ? ((barIndex / total) * 100).toFixed(0) : 0;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-primary font-semibold uppercase tracking-wide">REPLAY</span>

      <button onClick={stepBack} className="trading-btn p-0.5" title="Step back">
        <SkipBack size={11} />
      </button>

      <button
        onClick={() => setPlaying(!playing)}
        className="trading-btn p-0.5"
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={11} /> : <Play size={11} />}
      </button>

      <button onClick={stepForward} className="trading-btn p-0.5" title="Step forward">
        <SkipForward size={11} />
      </button>

      <button onClick={handleStop} className="trading-btn p-0.5 text-destructive" title="Exit replay">
        <Square size={11} />
      </button>

      {/* Speed */}
      <div className="flex items-center gap-0.5">
        <FastForward size={9} className="text-muted-foreground" />
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`text-[9px] px-1 rounded ${speed === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-1 ml-1">
        <div className="w-16 h-1 bg-accent rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[9px] text-muted-foreground font-mono">{barIndex}/{total}</span>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={1}
        max={total}
        value={barIndex}
        onChange={(e) => { setBarIndex(parseInt(e.target.value)); setPlaying(false); }}
        className="w-20 h-1 accent-primary cursor-pointer"
      />
    </div>
  );
};
