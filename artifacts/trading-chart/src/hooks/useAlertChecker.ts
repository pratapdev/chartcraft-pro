import { useEffect, useRef } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { toast } from 'sonner';
import { sendTelegramMessage } from '@/lib/telegram';
import { computeEMA, computeSMA, computeRSI, computeStochRSI, computeADX, computeATR, computeOBV, computePctDiffDonchian } from '@/lib/marketData';
import { Candle, IndicatorConfig, PctDiffDonLine } from '@/types/trading';
import { computeFVG, computeMarketStructure } from '@/lib/smartMoney';

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
  try {
    if (ind.type === 'EMA') return computeEMA(candles, ind.period);
    if (ind.type === 'SMA') return computeSMA(candles, ind.period);
    if (ind.type === 'RSI') return computeRSI(candles, ind.period);
    if (ind.type === 'ATR') return computeATR(candles, ind.period);
    if (ind.type === 'OBV') return computeOBV(candles);
    if (ind.type === 'ADX') return computeADX(candles, ind.period).adx;
    return [];
  } catch (err) {
    console.error(`[AlertChecker] Failed to compute ${ind.type}(${ind.period}):`, err);
    return [];
  }
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
  const pctDiffDonCrossAlerts = useChartStore((s) => s.pctDiffDonCrossAlerts);
  const smartMoneyAlerts = useChartStore((s) => s.smartMoneyAlerts);

  const triggeredSetRef = useRef<Set<string>>(new Set());
  const crossTriggeredRef = useRef<Set<string>>(new Set());
  const thresholdTriggeredRef = useRef<Set<string>>(new Set());
  const stochTriggeredRef = useRef<Set<string>>(new Set());
  const pctDiffTriggeredRef = useRef<Set<string>>(new Set());
  // Tracks last candle time each smart money alert fired (allows re-firing on new candles)
  const smartMoneyLastFiredRef = useRef<Map<string, number>>(new Map());
  // For FVG alerts: tracks which zone ids (type:bottom:top) price is currently inside
  // Allows edge detection (outside→inside transition only) to avoid noisy repeated alerts
  const fvgInZoneRef = useRef<Map<string, Set<string>>>(new Map());

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
      useChartStore.setState((s) => ({
        alerts: s.alerts.map((a) => a.id === alert.id ? { ...a, triggered: true, triggeredAt: Date.now() } : a),
      }));
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
      let stochData: { k: { time: number; value: number }[]; d: { time: number; value: number }[] };
      try {
        stochData = computeStochRSI(candles, ind.period, ind.period, ind.kPeriod ?? 3, ind.dPeriod ?? 3);
      } catch (err) {
        console.error(`[AlertChecker] Failed to compute StochRSI:`, err);
        continue;
      }
      const { k, d } = stochData;
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

  // Smart Money alerts: FVG entry, BOS/CHOCH cross, Liquidity sweep
  useEffect(() => {
    const active = (smartMoneyAlerts ?? []).filter((a) => a.active);
    if (active.length === 0) return;

    for (const alert of active) {
      const candles = getCandlesForAlert(alert.symbol, alert.timeframe);
      if (candles.length < 20) continue;

      const curr = candles[candles.length - 1];
      const lastFired = smartMoneyLastFiredRef.current.get(alert.id);
      if (lastFired === curr.time) continue;

      let fired = false;
      let message = '';

      if (alert.condition === 'fvg_bull_entry' || alert.condition === 'fvg_bear_entry') {
        const fvgType = alert.condition === 'fvg_bull_entry' ? 'bullish' : 'bearish';
        const fvgZones = computeFVG(candles, 0.1);
        const unmitigated = fvgZones.filter((z) => z.type === fvgType && !z.mitigated);

        // Edge detection: get the set of zones we're currently tracking as "in-zone"
        if (!fvgInZoneRef.current.has(alert.id)) fvgInZoneRef.current.set(alert.id, new Set());
        const inZoneSet = fvgInZoneRef.current.get(alert.id)!;

        // Build set of currently overlapping zones
        const nowInZone = new Set<string>();
        for (const zone of unmitigated) {
          const zoneId = `${zone.type}:${zone.bottom.toFixed(4)}:${zone.top.toFixed(4)}`;
          const inside = curr.low <= zone.top && curr.high >= zone.bottom;
          if (inside) {
            nowInZone.add(zoneId);
            // Only fire on transition: price was NOT in this zone last candle
            if (!inZoneSet.has(zoneId) && !fired) {
              const label = fvgType === 'bullish' ? 'Bullish' : 'Bearish';
              message = `${alert.symbol} price entered ${label} FVG zone [${zone.bottom.toFixed(2)}–${zone.top.toFixed(2)}]`;
              fired = true;
            }
          }
        }
        // Update in-zone tracking (reset zones price has exited)
        fvgInZoneRef.current.set(alert.id, nowInZone);
      } else if (alert.condition === 'bos_cross' || alert.condition === 'choch_cross') {
        const ms = computeMarketStructure(candles, 5);
        const targetKind = alert.condition === 'bos_cross' ? 'BOS' : 'CHOCH';
        const prev = candles[candles.length - 2];
        // Scope to the most recent 20 labels to avoid firing on old distant levels
        const recentLabels = ms.labels.filter((l) => l.kind === targetKind).slice(-20);
        for (const label of recentLabels) {
          const lvl = label.price;
          const crossedUp = prev.close < lvl && curr.close >= lvl;
          const crossedDown = prev.close > lvl && curr.close <= lvl;
          if (crossedUp || crossedDown) {
            const dir = crossedUp ? '↑' : '↓';
            message = `${alert.symbol} ${dir} crossed ${targetKind} level at ${lvl.toFixed(2)}`;
            fired = true;
            break;
          }
        }
      } else if (alert.condition === 'liquidity_sweep') {
        // A sweep at candle[ci] is confirmed by candle[ci+1].
        // When the confirmation candle is `curr` (the latest), the sweep wick
        // candle is `prev` (second-to-last). So we look for sweeps whose
        // sweepCandleTime matches prev.time — that sweep was just confirmed.
        const prev = candles[candles.length - 2];
        const ms = computeMarketStructure(candles, 5);
        const latestSweep = ms.sweeps.find((s) => s.sweepCandleTime === prev.time);
        if (latestSweep) {
          const dir = latestSweep.direction === 'bull_sweep' ? '⚡ Bull sweep' : '⚡ Bear sweep';
          message = `${alert.symbol} ${dir} at ${latestSweep.sweptPrice.toFixed(2)}`;
          fired = true;
        }
      }

      if (!fired) continue;

      smartMoneyLastFiredRef.current.set(alert.id, curr.time);
      useChartStore.getState().updateSmartMoneyAlert(alert.id, {
        triggered: true,
        triggeredAt: Date.now(),
        lastFiredCandleTime: curr.time,
      });
      fireAlert({
        message,
        symbol: alert.symbol,
        alertId: alert.id,
        price: curr.close,
        direction: 'any',
        telegramEnabled: alert.telegramEnabled,
        time: curr.time,
      });
    }
  }, [alertCandles, smartMoneyAlerts]);

  // PctDiffDon line crossover alerts
  useEffect(() => {
    const active = (pctDiffDonCrossAlerts ?? []).filter((a) => a.active && !a.triggered);
    if (active.length === 0) return;

    for (const alert of active) {
      if (pctDiffTriggeredRef.current.has(alert.id)) continue;
      const candles = getCandlesForAlert(alert.symbol, alert.timeframe);
      if (candles.length < 30) continue;

      const ind = indicators.find((i) => i.id === alert.indicatorId && i.type === 'PCT_DIFF_DON');
      if (!ind) continue;

      const result = computePctDiffDonchian(
        candles, ind.period, ind.lookbackWindow ?? 10,
        ind.emaSmoothing ?? 5, ind.donchianLength ?? 20, ind.donLineDiff ?? 0.2,
      );

      const getLineValues = (line: PctDiffDonLine) => {
        switch (line) {
          case 'main': return result.pctDiff.map(d => ({ time: d.time, value: d.value }));
          case 'ema': return result.emaLine;
          case 'basis': return result.basis;
          case 'upper': return result.upper;
          case 'lower': return result.lower;
          case 'upperNew': return result.upperNew;
          case 'lowerNew': return result.lowerNew;
        }
      };

      const vals1 = getLineValues(alert.line1);
      const vals2 = getLineValues(alert.line2);
      if (vals1.length < 2 || vals2.length < 2) continue;

      // Align by time — use last two common timestamps
      const time1 = vals1[vals1.length - 1].time;
      const time2 = vals2[vals2.length - 1].time;
      if (time1 !== time2) continue;

      const v1Curr = vals1[vals1.length - 1].value;
      const v1Prev = vals1[vals1.length - 2].value;
      const v2Curr = vals2[vals2.length - 1].value;
      const v2Prev = vals2[vals2.length - 2].value;

      const prevDiff = v1Prev - v2Prev;
      const currDiff = v1Curr - v2Curr;

      let dir: 'above' | 'below' | null = null;
      if (prevDiff <= 0 && currDiff > 0) dir = 'above';
      if (prevDiff >= 0 && currDiff < 0) dir = 'below';
      if (!dir) continue;

      const matches = alert.condition === 'cross_any' ||
        (alert.condition === 'cross_above' && dir === 'above') ||
        (alert.condition === 'cross_below' && dir === 'below');
      if (!matches) continue;

      pctDiffTriggeredRef.current.add(alert.id);
      const curr = candles[candles.length - 1];
      const LINE_LABELS: Record<PctDiffDonLine, string> = {
        main: 'Main', ema: 'EMA', basis: 'Basis', upper: 'Upper', lower: 'Lower', upperNew: 'Upper-Adj', lowerNew: 'Lower-Adj',
      };
      fireAlert({
        message: `${alert.symbol} %Diff ${LINE_LABELS[alert.line1]} ${dir === 'above' ? '↑ crossed above' : '↓ crossed below'} ${LINE_LABELS[alert.line2]}`,
        symbol: alert.symbol,
        alertId: alert.id,
        price: curr.close,
        direction: alert.condition === 'cross_any' ? 'any' : dir,
        telegramEnabled: alert.telegramEnabled,
        time: curr.time,
      });
      useChartStore.getState().removePctDiffDonCrossAlert(alert.id);
      useChartStore.getState().addPctDiffDonCrossAlert({ ...alert, triggered: true, triggeredAt: Date.now() });
    }
  }, [alertCandles, pctDiffDonCrossAlerts, indicators]);
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
