import React from 'react';
import { useChartStore } from '@/stores/chartStore';
import { computeEMA, computeSMA, computeRSI, computeStochRSI, computeBollingerBands } from '@/lib/marketData';

export const CrosshairLegend: React.FC = () => {
  const { crosshairData, candles, indicators } = useChartStore();

  if (!crosshairData || candles.length === 0) return null;

  const { open, high, low, close, volume } = crosshairData;
  const isUp = close >= open;

  // Compute indicator values at the hovered time
  const indicatorValues: { label: string; value: string; color: string }[] = [];
  for (const ind of indicators) {
    if (!ind.visible) continue;

    if (ind.type === 'EMA' || ind.type === 'SMA') {
      const data = ind.type === 'EMA' ? computeEMA(candles, ind.period) : computeSMA(candles, ind.period);
      const point = data.find((d) => d.time === crosshairData.time);
      if (point) {
        indicatorValues.push({
          label: `${ind.type}(${ind.period})`,
          value: point.value.toFixed(2),
          color: ind.color,
        });
      }
    }

    if (ind.type === 'RSI') {
      const data = computeRSI(candles, ind.period);
      const point = data.find((d) => d.time === crosshairData.time);
      if (point) {
        indicatorValues.push({
          label: `RSI(${ind.period})`,
          value: point.value.toFixed(2),
          color: ind.color,
        });
      }
    }

    if (ind.type === 'STOCH_RSI') {
      const { k, d } = computeStochRSI(candles, ind.period, ind.period, ind.kPeriod ?? 3, ind.dPeriod ?? 3);
      const kPt = k.find((pt) => pt.time === crosshairData.time);
      const dPt = d.find((pt) => pt.time === crosshairData.time);
      if (kPt) {
        indicatorValues.push({
          label: `StochRSI K`,
          value: kPt.value.toFixed(2),
          color: ind.color,
        });
      }
      if (dPt) {
        indicatorValues.push({
          label: `StochRSI D`,
          value: dPt.value.toFixed(2),
          color: ind.color2 ?? '#FF5722',
        });
      }
    }

    if (ind.type === 'BBANDS') {
      const { upper, middle, lower } = computeBollingerBands(candles, ind.period, ind.stdDev ?? 2);
      const uPt = upper.find((pt) => pt.time === crosshairData.time);
      const mPt = middle.find((pt) => pt.time === crosshairData.time);
      const lPt = lower.find((pt) => pt.time === crosshairData.time);
      if (mPt) {
        indicatorValues.push({ label: `BB(${ind.period})`, value: `${uPt?.value.toFixed(2)} / ${mPt.value.toFixed(2)} / ${lPt?.value.toFixed(2)}`, color: ind.color });
      }
    }
  }

  return (
    <div className="absolute top-1 left-1 z-30 pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 py-1 rounded bg-background/70 backdrop-blur-sm text-[11px] font-mono">
      {/* OHLCV */}
      <span className="text-muted-foreground">
        O <span className={isUp ? 'text-bull' : 'text-bear'}>{open.toFixed(2)}</span>
      </span>
      <span className="text-muted-foreground">
        H <span className={isUp ? 'text-bull' : 'text-bear'}>{high.toFixed(2)}</span>
      </span>
      <span className="text-muted-foreground">
        L <span className={isUp ? 'text-bull' : 'text-bear'}>{low.toFixed(2)}</span>
      </span>
      <span className="text-muted-foreground">
        C <span className={isUp ? 'text-bull' : 'text-bear'}>{close.toFixed(2)}</span>
      </span>
      <span className="text-muted-foreground">
        V <span className="text-foreground">{formatVolume(volume)}</span>
      </span>

      {/* Indicator values */}
      {indicatorValues.map((iv, i) => (
        <span key={i} className="text-muted-foreground">
          {iv.label}{' '}
          <span style={{ color: iv.color }}>{iv.value}</span>
        </span>
      ))}
    </div>
  );
};

function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}
