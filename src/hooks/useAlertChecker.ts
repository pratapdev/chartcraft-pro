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

// Request notification permission early
function requestNotificationPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendBrowserNotification(title: string, body: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'price-alert',
      } as NotificationOptions);
    } catch {
      // Notification API not available
    }
  }
}

if (typeof window !== 'undefined') {
  const events = ['click', 'touchstart', 'keydown'];
  const handler = () => {
    unlockAudio();
    requestNotificationPermission();
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
  const prevCloseRef = useRef<number | null>(null);
  const triggeredSetRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (candles.length < 2) return;

    const curr = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    // Skip if close price hasn't changed
    if (prevCloseRef.current === curr.close) return;
    prevCloseRef.current = curr.close;

    const activeAlerts = alerts.filter((a) => a.active && !a.triggered);
    if (activeAlerts.length === 0) return;

    // Get trendlines that have active alerts
    const alertedTrendlines = trendlines.filter((t) =>
      activeAlerts.some((a) => a.trendlineId === t.id)
    );
    if (alertedTrendlines.length === 0) return;

    // Check crossings between previous candle and current (live-updating) candle
    for (const line of alertedTrendlines) {
      const dir = detectCrossingDynamic(prev, curr, line);
      if (!dir) continue;

      const matchingAlerts = activeAlerts.filter((a) => {
        if (a.trendlineId !== line.id) return false;
        // Skip if already triggered in this session
        if (triggeredSetRef.current.has(a.id)) return false;
        if (a.condition === 'cross_any') return true;
        if (a.condition === 'cross_above' && dir === 'above') return true;
        if (a.condition === 'cross_below' && dir === 'below') return true;
        return false;
      });

      for (const alert of matchingAlerts) {
        triggeredSetRef.current.add(alert.id);

        const dirLabel = dir === 'above' ? '↑ Crossed Above' : '↓ Crossed Below';
        const message = `${alert.symbol} ${dirLabel} trendline at ${curr.close.toFixed(2)}`;

        // Play sound
        const soundDir = alert.condition === 'cross_any' ? 'any' : dir;
        playAlertSound(soundDir);

        // Show toast notification
        toast.warning(message, {
          duration: 5000,
          description: `Alert triggered at ${new Date(curr.time * 1000).toLocaleTimeString()}`,
        });

        // Send browser notification
        sendBrowserNotification(`⚠️ ${alert.symbol} Alert`, message);

        // Log the alert
        addAlertLog({
          id: crypto.randomUUID(),
          alertId: alert.id,
          symbol: alert.symbol,
          message,
          timestamp: Date.now(),
          price: curr.close,
        });

        // Mark alert as triggered
        useChartStore.getState().removeAlert(alert.id);
        useChartStore.getState().addAlert({ ...alert, triggered: true, triggeredAt: Date.now() });
      }
    }
  }, [candles, alerts, trendlines, addAlertLog]);
}

/**
 * Detect crossing between previous candle close and current candle close
 * relative to trendline price at those times.
 */
function detectCrossingDynamic(
  prev: { time: number; close: number },
  curr: { time: number; close: number },
  line: { startTime: number; endTime: number; startPrice: number; endPrice: number }
): 'above' | 'below' | null {
  const slope =
    line.endTime === line.startTime
      ? 0
      : (line.endPrice - line.startPrice) / (line.endTime - line.startTime);
  const prevLinePrice = line.startPrice + slope * (prev.time - line.startTime);
  const currLinePrice = line.startPrice + slope * (curr.time - line.startTime);

  const prevDiff = prev.close - prevLinePrice;
  const currDiff = curr.close - currLinePrice;

  if (prevDiff <= 0 && currDiff > 0) return 'above';
  if (prevDiff >= 0 && currDiff < 0) return 'below';
  return null;
}
