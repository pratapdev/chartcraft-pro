import { useEffect, useRef } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { toast } from 'sonner';
import { sendTelegramMessage } from '@/lib/telegram';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

import { computeEMA, computeSMA, computeRSI, computeStochRSI, computeADX, computeATR, computeOBV, computePctDiffDonchian } from '@/lib/marketData';
import { Candle, IndicatorConfig, PctDiffDonLine, PctDiffStrategy } from '@/types/trading';
import { computeFVG, computeMarketStructure, computeSupplyDemand } from '@/lib/smartMoney';

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
  whatsappEnabled?: boolean;
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
  if (opts.whatsappEnabled !== false) {
    sendWhatsAppMessage(`⚠️ *${opts.symbol} Alert*\n${opts.message}\n🕐 ${new Date(opts.time * 1000).toLocaleTimeString()}`);
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
  const pctDiffStrategyAlerts = useChartStore((s) => s.pctDiffStrategyAlerts);
  const smartMoneyAlerts = useChartStore((s) => s.smartMoneyAlerts);
  const rectangleAlerts = useChartStore((s) => s.rectangleAlerts);
  const rectangleDrawings = useChartStore((s) => s.rectangleDrawings);

  const triggeredSetRef = useRef<Set<string>>(new Set());
  const crossTriggeredRef = useRef<Set<string>>(new Set());
  const thresholdTriggeredRef = useRef<Set<string>>(new Set());
  const stochTriggeredRef = useRef<Set<string>>(new Set());
  const pctDiffTriggeredRef = useRef<Set<string>>(new Set());
  const strategyLastFiredRef = useRef<Map<string, number>>(new Map());
  // Tracks last candle time each smart money alert fired (allows re-firing on new candles)
  const smartMoneyLastFiredRef = useRef<Map<string, number>>(new Map());
  // For FVG alerts: tracks which zone ids (type:bottom:top) price is currently inside
  // Allows edge detection (outside→inside transition only) to avoid noisy repeated alerts
  const fvgInZoneRef = useRef<Map<string, Set<string>>>(new Map());
  const sdInZoneRef = useRef<Map<string, Set<string>>>(new Map());

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
        whatsappEnabled: alert.whatsappEnabled,
        time: curr.time,

      });
      useChartStore.setState((s) => ({
        alerts: s.alerts.map((a) => a.id === alert.id ? { ...a, triggered: true, triggeredAt: Date.now() } : a),
      }));
    }
  }, [alertCandles, alerts, trendlines]);

  // Rectangle alerts
  useEffect(() => {
    const activeAlerts = (rectangleAlerts ?? []).filter((a) => a.active && !a.triggered);
    if (activeAlerts.length === 0) return;

    for (const alert of activeAlerts) {
      if (triggeredSetRef.current.has(alert.id)) continue;
      const candles = getCandlesForAlert(alert.symbol, alert.timeframe);
      if (candles.length < 1) continue;

      const rect = rectangleDrawings.find((r) => r.id === alert.rectangleId);
      if (!rect) continue;

      const curr = candles[candles.length - 1];

      // Check if current candle intersects with the rectangle
      // Time intersection (extending right indefinitely if we want, but standard is bounded by start and end)
      // Usually, a box is drawn from startTime to endTime. If we want it bounded:
      const minTime = Math.min(rect.startTime, rect.endTime);
      const maxTime = Math.max(rect.startTime, rect.endTime);
      
      // Allow for right-extension if they drew it very far, but strict time bounds logic:
      if (curr.time < minTime || curr.time > maxTime) continue;

      const minPrice = Math.min(rect.startPrice, rect.endPrice);
      const maxPrice = Math.max(rect.startPrice, rect.endPrice);

      // Check if price wick (high/low) intersects the price boundaries of the box
      const intersectsPrice = curr.low <= maxPrice && curr.high >= minPrice;

      if (!intersectsPrice) continue;

      triggeredSetRef.current.add(alert.id);
      
      fireAlert({
        message: `${alert.symbol} price touched rectangle at ${curr.close.toFixed(2)}`,
        symbol: alert.symbol,
        alertId: alert.id,
        price: curr.close,
        direction: 'any',
        telegramEnabled: alert.telegramEnabled,
        whatsappEnabled: alert.whatsappEnabled,
        time: curr.time,
      });
      
      useChartStore.setState((s) => ({
        rectangleAlerts: s.rectangleAlerts.map((a) => a.id === alert.id ? { ...a, triggered: true, triggeredAt: Date.now() } : a),
      }));
    }
  }, [alertCandles, rectangleAlerts, rectangleDrawings]);

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
        whatsappEnabled: alert.whatsappEnabled,
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
        whatsappEnabled: alert.whatsappEnabled,
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
        whatsappEnabled: alert.whatsappEnabled,
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
      } else if (alert.condition === 'supply_zone_entry' || alert.condition === 'demand_zone_entry') {
        const zoneType = alert.condition === 'supply_zone_entry' ? 'supply' : 'demand';
        // Compute zones using default params (period 5, ATR multiplier 0.5, strength threshold 0.4)
        const zones = computeSupplyDemand(candles, 5, 0.5, 0.4);
        let activeZones = zones.filter((z) => z.type === zoneType && !z.broken);

        // Sort by distance to current price
        if (zoneType === 'supply') {
          // Supply zones are above price, so the closest is the one with the lowest bottom
          activeZones.sort((a, b) => a.bottom - b.bottom);
        } else {
          // Demand zones are below price, so the closest is the one with the highest top
          activeZones.sort((a, b) => b.top - a.top);
        }

        // Filter by user's selected nth zone (if specified)
        if (alert.zoneIndex && alert.zoneIndex !== 'any') {
          const index = alert.zoneIndex - 1; // 1st -> index 0
          activeZones = activeZones.length > index ? [activeZones[index]] : [];
        }

        if (!sdInZoneRef.current.has(alert.id)) sdInZoneRef.current.set(alert.id, new Set());
        const inZoneSet = sdInZoneRef.current.get(alert.id)!;

        const nowInZone = new Set<string>();
        for (const zone of activeZones) {
          const zoneId = `${zone.type}:${zone.bottom.toFixed(4)}:${zone.top.toFixed(4)}`;
          const inside = curr.low <= zone.top && curr.high >= zone.bottom;
          if (inside) {
            nowInZone.add(zoneId);
            if (!inZoneSet.has(zoneId) && !fired) {
              const label = zoneType === 'supply' ? 'Supply' : 'Demand';
              const rankStr = alert.zoneIndex && alert.zoneIndex !== 'any' ? ` (${alert.zoneIndex}${alert.zoneIndex === 1 ? 'st' : alert.zoneIndex === 2 ? 'nd' : 'rd'})` : '';
              message = `${alert.symbol} price entered ${label} zone${rankStr} [${zone.bottom.toFixed(2)}–${zone.top.toFixed(2)}]`;
              fired = true;
            }
          }
        }
        sdInZoneRef.current.set(alert.id, nowInZone);
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
        whatsappEnabled: alert.whatsappEnabled,
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
        whatsappEnabled: alert.whatsappEnabled,
        time: curr.time,

      });
      useChartStore.getState().removePctDiffDonCrossAlert(alert.id);
      useChartStore.getState().addPctDiffDonCrossAlert({ ...alert, triggered: true, triggeredAt: Date.now() });
    }
  }, [alertCandles, pctDiffDonCrossAlerts, indicators]);

  // PctDiff Strategy Alerts — 5 strategies
  useEffect(() => {
    const active = (pctDiffStrategyAlerts ?? []).filter((a) => a.active);
    if (active.length === 0) return;

    for (const alert of active) {
      const candles = getCandlesForAlert(alert.symbol, alert.timeframe);
      if (candles.length < 60) continue;

      const curr = candles[candles.length - 1];
      const lastFired = strategyLastFiredRef.current.get(alert.id);
      if (lastFired === curr.time) continue;

      const ind = indicators.find((i) => i.id === alert.indicatorId && i.type === 'PCT_DIFF_DON');
      if (!ind) continue;

      const result = computePctDiffDonchian(
        candles, ind.period, ind.lookbackWindow ?? 10,
        ind.emaSmoothing ?? 5, ind.donchianLength ?? 20, ind.donLineDiff ?? 0.2,
      );

      const main = result.pctDiff.map(d => ({ time: d.time, value: d.value }));
      const ema = result.emaLine;
      const upper = result.upper;
      const lower = result.lower;
      const basis = result.basis;
      const upperNew = result.upperNew;
      const lowerNew = result.lowerNew;

      if (main.length < 10 || upper.length < 5 || lower.length < 5) continue;

      let fired = false;
      let message = '';
      let direction: 'above' | 'below' | 'any' = 'any';

      if (alert.strategy === 'fail_first') {
        fired = detectFailFirst(main, ema, upper, lower, alert.direction);
        if (fired) {
          const lastMain = main[main.length - 1].value;
          const isBullish = lastMain > 0;
          direction = isBullish ? 'above' : 'below';
          message = `${alert.symbol} %Diff FAIL FIRST ${isBullish ? '↑ Bullish' : '↓ Bearish'} — pullback failed, trend resuming (${lastMain.toFixed(3)})`;
        }
      }

      if (alert.strategy === 'squeeze_breakout') {
        const sq = detectSqueezeBreakout(main, upper, lower, upperNew, lowerNew, alert.direction);
        if (sq) {
          fired = true;
          direction = sq === 'long' ? 'above' : 'below';
          const lastMain = main[main.length - 1].value;
          message = `${alert.symbol} %Diff SQUEEZE BREAKOUT ${sq === 'long' ? '↑ Bullish' : '↓ Bearish'} — Donchian squeeze broken (${lastMain.toFixed(3)})`;
        }
      }

      if (alert.strategy === 'momentum_divergence') {
        const div = detectMomentumDivergence(candles, main, alert.direction);
        if (div) {
          fired = true;
          direction = div === 'bearish' ? 'below' : 'above';
          message = `${alert.symbol} %Diff DIVERGENCE ${div === 'bearish' ? '↓ Bearish' : '↑ Bullish'} — price/momentum diverging`;
        }
      }

      if (alert.strategy === 'regime_mean_reversion') {
        const reg = detectRegimeMeanReversion(main, ema, upper, lower, alert.direction);
        if (reg) {
          fired = true;
          direction = reg === 'long' ? 'above' : 'below';
          const lastMain = main[main.length - 1].value;
          message = `${alert.symbol} %Diff REGIME ${reg === 'long' ? '↑ Long' : '↓ Short'} — mean reversion signal (${lastMain.toFixed(3)})`;
        }
      }

      if (alert.strategy === 'inner_band_warning') {
        const ib = detectInnerBandWarning(main, ema, upper, lower, upperNew, lowerNew, alert.direction);
        if (ib) {
          fired = true;
          direction = ib.dir;
          message = `${alert.symbol} %Diff INNER BAND ${ib.type === 'early_entry' ? 'Early Entry' : ib.type === 'profit_target' ? 'Profit Target' : 'Stop Warning'} ${ib.dir === 'above' ? '↑' : '↓'} (${main[main.length - 1].value.toFixed(3)})`;
        }
      }

      if (fired) {
        strategyLastFiredRef.current.set(alert.id, curr.time);
        fireAlert({
          message,
          symbol: alert.symbol,
          alertId: alert.id,
          price: curr.close,
          direction,
          telegramEnabled: alert.telegramEnabled,
          whatsappEnabled: alert.whatsappEnabled,
          time: curr.time,
        });
        useChartStore.getState().updatePctDiffStrategyAlert(alert.id, { lastFiredCandleTime: curr.time });
      }
    }
  }, [alertCandles, pctDiffStrategyAlerts, indicators]);
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

type TV = { time: number; value: number };

// Strategy 1: Fail First — brief pullback toward zero that fails, trend resumes
function detectFailFirst(
  main: TV[], ema: TV[], upper: TV[], lower: TV[],
  dir: 'long' | 'short' | 'both',
): boolean {
  if (main.length < 8 || ema.length < 8) return false;
  const n = main.length;

  // Look at last 8 bars: need a dip toward zero then snap back
  const curr = main[n - 1].value;
  const prev = main[n - 2].value;

  // Bullish fail first: was positive, dipped near/below zero (within last 2-6 bars), now crossing back above EMA
  if (dir === 'long' || dir === 'both') {
    let wasPositive = false;
    let dippedNearZero = false;
    for (let i = n - 8; i < n - 2; i++) {
      if (i >= 0 && main[i].value > 0.05) wasPositive = true;
      if (i >= 0 && wasPositive && main[i].value < 0.02 && main[i].value > -0.3) dippedNearZero = true;
    }
    if (wasPositive && dippedNearZero && curr > 0 && prev <= 0) return true;
    // Also: main crossed above EMA after being below it briefly
    if (wasPositive && dippedNearZero && ema.length >= 2) {
      const emaIdx = ema.length - 1;
      const mainAboveEma = curr > ema[emaIdx].value;
      const mainWasBelowEma = main[n - 3]?.value < ema[emaIdx - 1]?.value;
      if (mainAboveEma && mainWasBelowEma) return true;
    }
  }

  // Bearish fail first: was negative, bounced near/above zero, now crossing back below EMA
  if (dir === 'short' || dir === 'both') {
    let wasNegative = false;
    let bouncedNearZero = false;
    for (let i = n - 8; i < n - 2; i++) {
      if (i >= 0 && main[i].value < -0.05) wasNegative = true;
      if (i >= 0 && wasNegative && main[i].value > -0.02 && main[i].value < 0.3) bouncedNearZero = true;
    }
    if (wasNegative && bouncedNearZero && curr < 0 && prev >= 0) return true;
    if (wasNegative && bouncedNearZero && ema.length >= 2) {
      const emaIdx = ema.length - 1;
      const mainBelowEma = curr < ema[emaIdx].value;
      const mainWasAboveEma = main[n - 3]?.value > ema[emaIdx - 1]?.value;
      if (mainBelowEma && mainWasAboveEma) return true;
    }
  }

  return false;
}

// Strategy 2: Squeeze Breakout — narrow Donchian then breakout
function detectSqueezeBreakout(
  main: TV[], upper: TV[], lower: TV[],
  upperNew: TV[], lowerNew: TV[],
  dir: 'long' | 'short' | 'both',
): 'long' | 'short' | null {
  if (upper.length < 6 || lower.length < 6) return null;
  const n = upper.length;

  // Measure channel width over last 5 bars (excluding current)
  const widths: number[] = [];
  for (let i = n - 6; i < n - 1; i++) {
    if (i >= 0) widths.push(upper[i].value - lower[i].value);
  }
  if (widths.length < 3) return null;

  const avgWidth = widths.reduce((s, w) => s + w, 0) / widths.length;
  const currWidth = upper[n - 1].value - lower[n - 1].value;

  // Squeeze: recent avg width was narrow (< 0.5) or current width expanding > 1.5x avg
  const isSqueeze = avgWidth < 0.5 || (currWidth > avgWidth * 1.4 && avgWidth < 1.0);
  if (!isSqueeze) return null;

  // Check for breakout: main line breaks outside the previous Donchian bands
  const mIdx = main.length - 1;
  const currMain = main[mIdx].value;
  const prevMain = main[mIdx - 1]?.value ?? 0;

  // Use inner bands for earlier detection
  const uNewIdx = upperNew.length - 2;
  const lNewIdx = lowerNew.length - 2;

  if (uNewIdx >= 0 && (dir === 'long' || dir === 'both')) {
    if (currMain > upper[n - 2].value && prevMain <= upper[n - 2].value) return 'long';
    if (currMain > upperNew[uNewIdx].value && prevMain <= upperNew[uNewIdx].value) return 'long';
  }
  if (lNewIdx >= 0 && (dir === 'short' || dir === 'both')) {
    if (currMain < lower[n - 2].value && prevMain >= lower[n - 2].value) return 'short';
    if (currMain < lowerNew[lNewIdx].value && prevMain >= lowerNew[lNewIdx].value) return 'short';
  }

  return null;
}

// Strategy 3: Momentum Divergence — price makes new high/low but pctDiff doesn't
function detectMomentumDivergence(
  candles: Candle[], main: TV[],
  dir: 'long' | 'short' | 'both',
): 'bearish' | 'bullish' | null {
  if (candles.length < 20 || main.length < 20) return null;

  const lookback = 20;
  const n = candles.length;
  const mn = main.length;

  // Find two recent swing highs in price and compare with pctDiff peaks
  if (dir === 'short' || dir === 'both') {
    // Bearish divergence: higher high in price, lower high in pctDiff
    let priceHigh1 = -Infinity, priceHigh1Idx = -1;
    let pctHigh1 = -Infinity;

    // First peak: look in bars [n-lookback .. n-lookback/2]
    const mid = Math.floor(lookback / 2);
    for (let i = n - lookback; i < n - mid; i++) {
      if (i >= 0 && candles[i].high > priceHigh1) {
        priceHigh1 = candles[i].high;
        priceHigh1Idx = i;
      }
    }
    // Corresponding pctDiff value at that index
    const mainOffset = mn - n;
    if (priceHigh1Idx >= 0 && priceHigh1Idx + mainOffset >= 0) {
      pctHigh1 = main[priceHigh1Idx + mainOffset]?.value ?? -Infinity;
    }

    // Second peak: look in bars [n-mid .. n-1]
    let priceHigh2 = -Infinity, priceHigh2Idx = -1;
    let pctHigh2 = -Infinity;
    for (let i = n - mid; i < n; i++) {
      if (candles[i].high > priceHigh2) {
        priceHigh2 = candles[i].high;
        priceHigh2Idx = i;
      }
    }
    if (priceHigh2Idx >= 0 && priceHigh2Idx + mainOffset >= 0) {
      pctHigh2 = main[priceHigh2Idx + mainOffset]?.value ?? -Infinity;
    }

    if (priceHigh2 > priceHigh1 && pctHigh2 < pctHigh1 && pctHigh1 !== -Infinity) {
      return 'bearish';
    }
  }

  if (dir === 'long' || dir === 'both') {
    // Bullish divergence: lower low in price, higher low in pctDiff
    let priceLow1 = Infinity, priceLow1Idx = -1;
    let pctLow1 = Infinity;

    const mid = Math.floor(lookback / 2);
    for (let i = n - lookback; i < n - mid; i++) {
      if (i >= 0 && candles[i].low < priceLow1) {
        priceLow1 = candles[i].low;
        priceLow1Idx = i;
      }
    }
    const mainOffset = mn - n;
    if (priceLow1Idx >= 0 && priceLow1Idx + mainOffset >= 0) {
      pctLow1 = main[priceLow1Idx + mainOffset]?.value ?? Infinity;
    }

    let priceLow2 = Infinity, priceLow2Idx = -1;
    let pctLow2 = Infinity;
    for (let i = n - mid; i < n; i++) {
      if (candles[i].low < priceLow2) {
        priceLow2 = candles[i].low;
        priceLow2Idx = i;
      }
    }
    if (priceLow2Idx >= 0 && priceLow2Idx + mainOffset >= 0) {
      pctLow2 = main[priceLow2Idx + mainOffset]?.value ?? Infinity;
    }

    if (priceLow2 < priceLow1 && pctLow2 > pctLow1 && pctLow1 !== Infinity) {
      return 'bullish';
    }
  }

  return null;
}

// Strategy 4: Regime Mean Reversion — zero-line regime + Donchian band touch
function detectRegimeMeanReversion(
  main: TV[], ema: TV[], upper: TV[], lower: TV[],
  dir: 'long' | 'short' | 'both',
): 'long' | 'short' | null {
  if (main.length < 6 || upper.length < 3 || lower.length < 3) return null;
  const n = main.length;
  const un = upper.length;
  const ln = lower.length;

  // Determine regime: is Donchian channel narrow (range/squeeze)?
  const chanWidth = upper[un - 1].value - lower[ln - 1].value;
  const isRanging = chanWidth < 0.8;

  if (!isRanging) {
    // Trending regime: pullback to EMA in direction of trend
    if (ema.length < 3) return null;
    const en = ema.length;
    const currMain = main[n - 1].value;
    const prevMain = main[n - 2].value;
    const currEma = ema[en - 1].value;

    // Bullish trend pullback: main > 0 trend, touched EMA from above, now bouncing
    if ((dir === 'long' || dir === 'both') && currMain > 0) {
      if (prevMain <= currEma && currMain > currEma) return 'long';
    }
    // Bearish trend pullback: main < 0 trend, touched EMA from below, now dropping
    if ((dir === 'short' || dir === 'both') && currMain < 0) {
      if (prevMain >= currEma && currMain < currEma) return 'short';
    }
  } else {
    // Range regime: fade the Donchian band touches
    const currMain = main[n - 1].value;
    const prevMain = main[n - 2].value;

    // Long: main touched lower band and is turning up
    if ((dir === 'long' || dir === 'both')) {
      if (prevMain <= lower[ln - 2]?.value && currMain > lower[ln - 1].value) return 'long';
    }
    // Short: main touched upper band and is turning down
    if ((dir === 'short' || dir === 'both')) {
      if (prevMain >= upper[un - 2]?.value && currMain < upper[un - 1].value) return 'short';
    }
  }

  return null;
}

// Strategy 5: Inner Band Warning — early entry, profit target, or stop signals from upperNew/lowerNew
function detectInnerBandWarning(
  main: TV[], ema: TV[], upper: TV[], lower: TV[],
  upperNew: TV[], lowerNew: TV[],
  dir: 'long' | 'short' | 'both',
): { type: 'early_entry' | 'profit_target' | 'stop_warning'; dir: 'above' | 'below' } | null {
  if (main.length < 3 || upperNew.length < 3 || lowerNew.length < 3) return null;
  const n = main.length;
  const unN = upperNew.length;
  const lnN = lowerNew.length;

  const currMain = main[n - 1].value;
  const prevMain = main[n - 2].value;

  // Early entry: main breaks inner band before outer band
  if (dir === 'long' || dir === 'both') {
    const innerUpper = upperNew[unN - 2]?.value;
    const outerUpper = upper.length >= 2 ? upper[upper.length - 1].value : Infinity;
    if (innerUpper !== undefined && prevMain <= innerUpper && currMain > innerUpper && currMain < outerUpper) {
      return { type: 'early_entry', dir: 'above' };
    }
  }
  if (dir === 'short' || dir === 'both') {
    const innerLower = lowerNew[lnN - 2]?.value;
    const outerLower = lower.length >= 2 ? lower[lower.length - 1].value : -Infinity;
    if (innerLower !== undefined && prevMain >= innerLower && currMain < innerLower && currMain > outerLower) {
      return { type: 'early_entry', dir: 'below' };
    }
  }

  // Stop warning: main breaks back inside inner band after outer band breakout
  if (dir === 'long' || dir === 'both') {
    const innerUpper = upperNew[unN - 1]?.value;
    const outerUpper = upper.length >= 2 ? upper[upper.length - 2].value : Infinity;
    if (innerUpper !== undefined && prevMain > outerUpper && currMain < innerUpper) {
      return { type: 'stop_warning', dir: 'below' };
    }
  }
  if (dir === 'short' || dir === 'both') {
    const innerLower = lowerNew[lnN - 1]?.value;
    const outerLower = lower.length >= 2 ? lower[lower.length - 2].value : -Infinity;
    if (innerLower !== undefined && prevMain < outerLower && currMain > innerLower) {
      return { type: 'stop_warning', dir: 'above' };
    }
  }

  // Profit target: main reaches opposite inner band (mean reversion target)
  if (dir === 'long' || dir === 'both') {
    const targetUpper = upperNew[unN - 1]?.value;
    if (targetUpper !== undefined && prevMain < targetUpper && currMain >= targetUpper) {
      return { type: 'profit_target', dir: 'above' };
    }
  }
  if (dir === 'short' || dir === 'both') {
    const targetLower = lowerNew[lnN - 1]?.value;
    if (targetLower !== undefined && prevMain > targetLower && currMain <= targetLower) {
      return { type: 'profit_target', dir: 'below' };
    }
  }

  return null;
}
