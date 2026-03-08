import { useEffect, useRef } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { toast } from 'sonner';
import { sendTelegramMessage } from '@/lib/telegram';
import { computeEMA, computeSMA, computeRSI, computeStochRSI, computeADX, computeATR, computeOBV } from '@/lib/marketData';
import { IndicatorConfig } from '@/types/trading';

// Shared AudioContext, unlocked on first user gesture
let sharedCtx: AudioContext | null = null;
let unlocked = false;

function getAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

function unlockAudio() {
  if (unlocked) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    unlocked = true;
  } catch {}
}

function requestNotificationPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendBrowserNotification(title: string, body: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/favicon.ico', tag: 'price-alert' });
    } catch {}
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

function playAlertSound(direction: 'above' | 'below' | 'any') {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

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
  } catch {}
}

function getIndicatorValues(ind: IndicatorConfig, candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[]): { time: number; value: number }[] {
  if (ind.type === 'EMA') return computeEMA(candles, ind.period);
  if (ind.type === 'SMA') return computeSMA(candles, ind.period);
  return [];
}

function getIndicatorLabel(ind: IndicatorConfig): string {
  return `${ind.type}(${ind.period})`;
}

export function useAlertChecker() {
  const { candles, alerts, trendlines, addAlertLog, indicators, indicatorCrossAlerts } = useChartStore();
  const prevCloseRef = useRef<number | null>(null);
  const triggeredSetRef = useRef<Set<string>>(new Set());
  const crossTriggeredRef = useRef<Set<string>>(new Set());

  // Trendline alerts
  useEffect(() => {
    if (candles.length < 2) return;

    const curr = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    if (prevCloseRef.current === curr.close) return;
    prevCloseRef.current = curr.close;

    const activeAlerts = alerts.filter((a) => a.active && !a.triggered);
    if (activeAlerts.length === 0) return;

    const alertedTrendlines = trendlines.filter((t) =>
      activeAlerts.some((a) => a.trendlineId === t.id)
    );
    if (alertedTrendlines.length === 0) return;

    for (const line of alertedTrendlines) {
      const dir = detectCrossingDynamic(prev, curr, line);
      if (!dir) continue;

      const matchingAlerts = activeAlerts.filter((a) => {
        if (a.trendlineId !== line.id) return false;
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
        const soundDir = alert.condition === 'cross_any' ? 'any' : dir;
        playAlertSound(soundDir);
        toast.warning(message, { duration: 5000, description: `Alert triggered at ${new Date(curr.time * 1000).toLocaleTimeString()}` });
        sendBrowserNotification(`⚠️ ${alert.symbol} Alert`, message);
        if (alert.telegramEnabled !== false) {
          sendTelegramMessage(`⚠️ <b>${alert.symbol} Alert</b>\n${message}\n🕐 ${new Date(curr.time * 1000).toLocaleTimeString()}`);
        }
        addAlertLog({ id: crypto.randomUUID(), alertId: alert.id, symbol: alert.symbol, message, timestamp: Date.now(), price: curr.close });
        useChartStore.getState().removeAlert(alert.id);
        useChartStore.getState().addAlert({ ...alert, triggered: true, triggeredAt: Date.now() });
      }
    }
  }, [candles, alerts, trendlines, addAlertLog]);

  // Indicator crossover alerts
  useEffect(() => {
    if (candles.length < 2) return;

    const activeCrossAlerts = indicatorCrossAlerts.filter((a) => a.active && !a.triggered);
    if (activeCrossAlerts.length === 0) return;

    const curr = candles[candles.length - 1];

    for (const alert of activeCrossAlerts) {
      if (crossTriggeredRef.current.has(alert.id)) continue;

      const ind1 = indicators.find((i) => i.id === alert.indicatorId1);
      const ind2 = indicators.find((i) => i.id === alert.indicatorId2);
      if (!ind1 || !ind2) continue;

      const vals1 = getIndicatorValues(ind1, candles);
      const vals2 = getIndicatorValues(ind2, candles);
      if (vals1.length < 2 || vals2.length < 2) continue;

      // Get last two values for each indicator (by matching times)
      const last1 = vals1[vals1.length - 1];
      const prev1 = vals1[vals1.length - 2];
      const last2 = vals2[vals2.length - 1];
      const prev2 = vals2[vals2.length - 2];

      if (!last1 || !prev1 || !last2 || !prev2) continue;

      const prevDiff = prev1.value - prev2.value;
      const currDiff = last1.value - last2.value;

      let dir: 'above' | 'below' | null = null;
      if (prevDiff <= 0 && currDiff > 0) dir = 'above';
      if (prevDiff >= 0 && currDiff < 0) dir = 'below';

      if (!dir) continue;

      const matches =
        alert.condition === 'cross_any' ||
        (alert.condition === 'cross_above' && dir === 'above') ||
        (alert.condition === 'cross_below' && dir === 'below');

      if (!matches) continue;

      crossTriggeredRef.current.add(alert.id);
      const label1 = getIndicatorLabel(ind1);
      const label2 = getIndicatorLabel(ind2);
      const dirLabel = dir === 'above' ? '↑ crossed above' : '↓ crossed below';
      const message = `${alert.symbol} ${label1} ${dirLabel} ${label2} at ${curr.close.toFixed(2)}`;
      const soundDir = alert.condition === 'cross_any' ? 'any' : dir;
      playAlertSound(soundDir);
      toast.warning(message, { duration: 5000, description: `Crossover at ${new Date(curr.time * 1000).toLocaleTimeString()}` });
      sendBrowserNotification(`⚠️ ${alert.symbol} Crossover`, message);
      if (alert.telegramEnabled !== false) {
        sendTelegramMessage(`⚠️ <b>${alert.symbol} Crossover</b>\n${message}\n🕐 ${new Date(curr.time * 1000).toLocaleTimeString()}`);
      }
      addAlertLog({ id: crypto.randomUUID(), alertId: alert.id, symbol: alert.symbol, message, timestamp: Date.now(), price: curr.close });
      useChartStore.getState().removeIndicatorCrossAlert(alert.id);
      useChartStore.getState().addIndicatorCrossAlert({ ...alert, triggered: true, triggeredAt: Date.now() });
    }
  }, [candles, indicatorCrossAlerts, indicators, addAlertLog]);
}

function detectCrossingDynamic(
  prev: { time: number; close: number },
  curr: { time: number; close: number },
  line: { startTime: number; endTime: number; startPrice: number; endPrice: number }
): 'above' | 'below' | null {
  const slope = line.endTime === line.startTime ? 0 : (line.endPrice - line.startPrice) / (line.endTime - line.startTime);
  const prevLinePrice = line.startPrice + slope * (prev.time - line.startTime);
  const currLinePrice = line.startPrice + slope * (curr.time - line.startTime);
  const prevDiff = prev.close - prevLinePrice;
  const currDiff = curr.close - currLinePrice;
  if (prevDiff <= 0 && currDiff > 0) return 'above';
  if (prevDiff >= 0 && currDiff < 0) return 'below';
  return null;
}
