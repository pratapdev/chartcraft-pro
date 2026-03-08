import { useEffect, useRef } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { toast } from 'sonner';
import { sendTelegramMessage } from '@/lib/telegram';
import { computeEMA, computeSMA, computeRSI, computeStochRSI, computeADX, computeATR, computeOBV } from '@/lib/marketData';
import { Candle, IndicatorConfig } from '@/types/trading';

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

function getIndicatorValues(ind: IndicatorConfig, candles: Candle[]): { time: number; value: number }[] {
  if (ind.type === 'EMA') return computeEMA(candles, ind.period);
  if (ind.type === 'SMA') return computeSMA(candles, ind.period);
  if (ind.type === 'RSI') return computeRSI(candles, ind.period);
  if (ind.type === 'ATR') return computeATR(candles, ind.period);
  if (ind.type === 'OBV') return computeOBV(candles);
  if (ind.type === 'ADX') return computeADX(candles, ind.period).adx;
  return [];
}

function getIndicatorLabel(ind: IndicatorConfig): string {
  return `${ind.type}(${ind.period})`;
}

/** Helper: get candles for a specific alert's symbol:timeframe from the alertCandles map */
function getCandlesForAlert(symbol: string, timeframe: string): Candle[] {
  const key = `${symbol}:${timeframe}`;
  return useChartStore.getState().alertCandles[key] ?? [];
}

function fireAlert(opts: {
  message: string;
  symbol: string;
  alertId: string;
  price: number;
  direction: 'above' | 'below' | 'any';
  telegramEnabled?: boolean;
  time: number;
}) {
  playAlertSound(opts.direction);
  toast.warning(opts.message, {
    duration: 5000,
    description: `At ${new Date(opts.time * 1000).toLocaleTimeString()}`,
  });
  sendBrowserNotification(`⚠️ ${opts.symbol} Alert`, opts.message);
  if (opts.telegramEnabled !== false) {
    sendTelegramMessage(`⚠️ <b>${opts.symbol} Alert</b>\n${opts.message}\n🕐 ${new Date(opts.time * 1000).toLocaleTimeString()}`);
  }
  useChartStore.getState().addAlertLog({
    id: crypto.randomUUID(),
    alertId: opts.alertId,
    symbol: opts.symbol,
    message: opts.message,
    timestamp: Date.now(),
    price: opts.price,
  });
}

export function useAlertChecker() {
  const alertCandles = useChartStore((s) => s.alertCandles);
  const alerts = useChartStore((s) => s.alerts);
  const trendlines = useChartStore((s) => s.trendlines);
  const indicators = useChartStore((s) => s.indicators);
  const indicatorCrossAlerts = useChartStore((s) => s.indicatorCrossAlerts);
  const indicatorThresholdAlerts = useChartStore((s) => s.indicatorThresholdAlerts);
  const stochRSICrossAlerts = useChartStore((s) => s.stochRSICrossAlerts);

  const triggeredSetRef = useRef<Set<string>>(new Set());
  const crossTriggeredRef = useRef<Set<string>>(new Set());
  const thresholdTriggeredRef = useRef<Set<string>>(new Set());
  const stochTriggeredRef = useRef<Set<string>>(new Set());

  // Trendline alerts — check per-symbol candles
  useEffect(() => {
    const activeAlerts = alerts.filter((a) => a.active && !a.triggered);
    if (activeAlerts.length === 0) return;

    for (const alert of activeAlerts) {
      if (triggeredSetRef.current.has(alert.id)) continue;
      const candles = getCandlesForAlert(alert.symbol, alert.timeframe);
      if (candles.length < 2) continue;

      const line = trendlines.find((t) => t.id === alert.trendlineId);
      if (!line) continue;

      const prev = candles[candles.length - 2];
      const curr = candles[candles.length - 1];
      const dir = detectCrossingDynamic(prev, curr, line);
      if (!dir) continue;

      const matches =
        alert.condition === 'cross_any' ||
        (alert.condition === 'cross_above' && dir === 'above') ||
        (alert.condition === 'cross_below' && dir === 'below');
      if (!matches) continue;

      triggeredSetRef.current.add(alert.id);
      const dirLabel = dir === 'above' ? '↑ Crossed Above' : '↓ Crossed Below';
      fireAlert({
        message: `${alert.symbol} ${dirLabel} trendline at ${curr.close.toFixed(2)}`,
        symbol: alert.symbol,
        alertId: alert.id,
        price: curr.close,
        direction: alert.condition === 'cross_any' ? 'any' : dir,
        telegramEnabled: alert.telegramEnabled,
        time: curr.time,
      });
      useChartStore.getState().removeAlert(alert.id);
      useChartStore.getState().addAlert({ ...alert, triggered: true, triggeredAt: Date.now() });
    }
  }, [alertCandles, alerts, trendlines]);

  // Indicator crossover alerts
  useEffect(() => {
    const active = indicatorCrossAlerts.filter((a) => a.active && !a.triggered);
    if (active.length === 0) return;

    for (const alert of active) {
      if (crossTriggeredRef.current.has(alert.id)) continue;
      const candles = getCandlesForAlert(alert.symbol, alert.timeframe);
      if (candles.length < 2) continue;

      const ind1 = indicators.find((i) => i.id === alert.indicatorId1);
      const ind2 = indicators.find((i) => i.id === alert.indicatorId2);
      if (!ind1 || !ind2) continue;

      const vals1 = getIndicatorValues(ind1, candles);
      const vals2 = getIndicatorValues(ind2, candles);
      if (vals1.length < 2 || vals2.length < 2) continue;

      const prevDiff = vals1[vals1.length - 2].value - vals2[vals2.length - 2].value;
      const currDiff = vals1[vals1.length - 1].value - vals2[vals2.length - 1].value;

      let dir: 'above' | 'below' | null = null;
      if (prevDiff <= 0 && currDiff > 0) dir = 'above';
      if (prevDiff >= 0 && currDiff < 0) dir = 'below';
      if (!dir) continue;

      const matches = alert.condition === 'cross_any' ||
        (alert.condition === 'cross_above' && dir === 'above') ||
        (alert.condition === 'cross_below' && dir === 'below');
      if (!matches) continue;

      crossTriggeredRef.current.add(alert.id);
      const curr = candles[candles.length - 1];
      fireAlert({
        message: `${alert.symbol} ${getIndicatorLabel(ind1)} ${dir === 'above' ? '↑ crossed above' : '↓ crossed below'} ${getIndicatorLabel(ind2)} at ${curr.close.toFixed(2)}`,
        symbol: alert.symbol,
        alertId: alert.id,
        price: curr.close,
        direction: alert.condition === 'cross_any' ? 'any' : dir,
        telegramEnabled: alert.telegramEnabled,
        time: curr.time,
      });
      useChartStore.getState().removeIndicatorCrossAlert(alert.id);
      useChartStore.getState().addIndicatorCrossAlert({ ...alert, triggered: true, triggeredAt: Date.now() });
    }
  }, [alertCandles, indicatorCrossAlerts, indicators]);

  // Indicator threshold alerts (RSI above/below, ADX above/below)
  useEffect(() => {
    const active = (indicatorThresholdAlerts ?? []).filter((a) => a.active && !a.triggered);
    if (active.length === 0) return;

    for (const alert of active) {
      if (thresholdTriggeredRef.current.has(alert.id)) continue;
      const candles = getCandlesForAlert(alert.symbol, alert.timeframe);
      if (candles.length < 2) continue;

      const ind = indicators.find((i) => i.id === alert.indicatorId);
      if (!ind) continue;
      const vals = getIndicatorValues(ind, candles);
      if (vals.length < 2) continue;

      const lastVal = vals[vals.length - 1].value;
      const prevVal = vals[vals.length - 2].value;

      let triggered = false;
      if (alert.condition === 'above' && prevVal <= alert.threshold && lastVal > alert.threshold) triggered = true;
      if (alert.condition === 'below' && prevVal >= alert.threshold && lastVal < alert.threshold) triggered = true;
      if (!triggered) continue;

      thresholdTriggeredRef.current.add(alert.id);
      const curr = candles[candles.length - 1];
      const label = getIndicatorLabel(ind);
      fireAlert({
        message: `${alert.symbol} ${label} ${alert.condition === 'above' ? `↑ above ${alert.threshold}` : `↓ below ${alert.threshold}`} (${lastVal.toFixed(2)}) at ${curr.close.toFixed(2)}`,
        symbol: alert.symbol,
        alertId: alert.id,
        price: curr.close,
        direction: alert.condition === 'above' ? 'above' : 'below',
        telegramEnabled: alert.telegramEnabled,
        time: curr.time,
      });
      useChartStore.getState().removeIndicatorThresholdAlert(alert.id);
      useChartStore.getState().addIndicatorThresholdAlert({ ...alert, triggered: true, triggeredAt: Date.now() });
    }
  }, [alertCandles, indicatorThresholdAlerts, indicators]);

  // StochRSI K/D crossover alerts
  useEffect(() => {
    const active = (stochRSICrossAlerts ?? []).filter((a) => a.active && !a.triggered);
    if (active.length === 0) return;

    for (const alert of active) {
      if (stochTriggeredRef.current.has(alert.id)) continue;
      const candles = getCandlesForAlert(alert.symbol, alert.timeframe);
      if (candles.length < 2) continue;

      const ind = indicators.find((i) => i.id === alert.indicatorId && i.type === 'STOCH_RSI');
      if (!ind) continue;
      const { k, d } = computeStochRSI(candles, ind.period, ind.period, ind.kPeriod ?? 3, ind.dPeriod ?? 3);
      if (k.length < 2 || d.length < 2) continue;

      const prevDiff = k[k.length - 2].value - d[d.length - 2].value;
      const currDiff = k[k.length - 1].value - d[d.length - 1].value;

      let dir: 'above' | 'below' | null = null;
      if (prevDiff <= 0 && currDiff > 0) dir = 'above';
      if (prevDiff >= 0 && currDiff < 0) dir = 'below';
      if (!dir) continue;

      const matches = alert.condition === 'cross_any' ||
        (alert.condition === 'cross_above' && dir === 'above') ||
        (alert.condition === 'cross_below' && dir === 'below');
      if (!matches) continue;

      stochTriggeredRef.current.add(alert.id);
      const curr = candles[candles.length - 1];
      const lastK = k[k.length - 1].value;
      const lastD = d[d.length - 1].value;
      fireAlert({
        message: `${alert.symbol} StochRSI(${ind.period}) ${dir === 'above' ? '↑ K above D' : '↓ K below D'} (K:${lastK.toFixed(1)} D:${lastD.toFixed(1)}) at ${curr.close.toFixed(2)}`,
        symbol: alert.symbol,
        alertId: alert.id,
        price: curr.close,
        direction: alert.condition === 'cross_any' ? 'any' : dir,
        telegramEnabled: alert.telegramEnabled,
        time: curr.time,
      });
      useChartStore.getState().removeStochRSICrossAlert(alert.id);
      useChartStore.getState().addStochRSICrossAlert({ ...alert, triggered: true, triggeredAt: Date.now() });
    }
  }, [alertCandles, stochRSICrossAlerts, indicators]);
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
