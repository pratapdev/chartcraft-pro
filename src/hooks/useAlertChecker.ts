import { useEffect, useRef } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { checkAllCrossings } from '@/lib/crossingDetection';
import { toast } from 'sonner';

// Shared AudioContext, unlocked on first user gesture
let sharedCtx: AudioContext | null = null;
let unlocked = false;

function getAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

// Unlock audio on first user interaction
function unlockAudio() {
  if (unlocked) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    // Create a silent buffer to unlock
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    unlocked = true;
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  const events = ['click', 'touchstart', 'keydown'];
  const handler = () => {
    unlockAudio();
    events.forEach((e) => document.removeEventListener(e, handler));
  };
  events.forEach((e) => document.addEventListener(e, handler, { once: false }));
}

// Generate alert beep sound using Web Audio API
function playAlertSound(direction: 'above' | 'below' | 'any') {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Different tones for different directions
    if (direction === 'above') {
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    } else if (direction === 'below') {
      oscillator.frequency.setValueAtTime(440, ctx.currentTime);
      oscillator.frequency.setValueAtTime(330, ctx.currentTime + 0.1);
    } else {
      oscillator.frequency.setValueAtTime(660, ctx.currentTime);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.2);
    }

    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  } catch {
    // Audio not available
  }
}

export function useAlertChecker() {
  const { candles, alerts, trendlines, addAlertLog } = useChartStore();
  const prevCandleCountRef = useRef(0);

  useEffect(() => {
    // Only check when we get new candle data
    if (candles.length < 2 || candles.length === prevCandleCountRef.current) return;
    prevCandleCountRef.current = candles.length;

    const activeAlerts = alerts.filter((a) => a.active && !a.triggered);
    if (activeAlerts.length === 0) return;

    // Get trendlines that have active alerts
    const alertedTrendlines = trendlines.filter((t) =>
      activeAlerts.some((a) => a.trendlineId === t.id)
    );
    if (alertedTrendlines.length === 0) return;

    const crossings = checkAllCrossings(candles, alertedTrendlines);

    for (const crossing of crossings) {
      const matchingAlerts = activeAlerts.filter((a) => {
        if (a.trendlineId !== crossing.trendline.id) return false;
        if (a.condition === 'cross_any') return true;
        if (a.condition === 'cross_above' && crossing.direction === 'above') return true;
        if (a.condition === 'cross_below' && crossing.direction === 'below') return true;
        return false;
      });

      for (const alert of matchingAlerts) {
        const dirLabel = crossing.direction === 'above' ? '↑ Crossed Above' : '↓ Crossed Below';
        const message = `${alert.symbol} ${dirLabel} trendline at ${crossing.candle.close.toFixed(2)}`;

        // Play sound
        const soundDir = alert.condition === 'cross_any' ? 'any' : crossing.direction!;
        playAlertSound(soundDir);

        // Show toast notification
        toast.warning(message, {
          duration: 5000,
          description: `Alert triggered at ${new Date(crossing.candle.time * 1000).toLocaleTimeString()}`,
        });

        // Log the alert
        addAlertLog({
          id: crypto.randomUUID(),
          alertId: alert.id,
          symbol: alert.symbol,
          message,
          timestamp: Date.now(),
          price: crossing.candle.close,
        });

        // Mark alert as triggered
        useChartStore.getState().removeAlert(alert.id);
        useChartStore.getState().addAlert({ ...alert, triggered: true, triggeredAt: Date.now() });
      }
    }
  }, [candles, alerts, trendlines, addAlertLog]);
}
