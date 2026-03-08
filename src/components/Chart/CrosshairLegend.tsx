import React from 'react';
import { useChartStore } from '@/stores/chartStore';
import { computeEMA, computeSMA, computeRSI, computeStochRSI, computeBollingerBands, computeVWAP } from '@/lib/marketData';
import { X } from 'lucide-react';

export const CrosshairLegend: React.FC = () => {
  const { crosshairData, candles, indicators, selectedIndicatorId, setSelectedIndicatorId, removeIndicator } = useChartStore();

  if (!crosshairData || candles.length === 0) return null;

  const { open, high, low, close, volume } = crosshairData;
  const isUp = close >= open;

  // Compute indicator values at the hovered time
  const indicatorValues: { id: string; label: string; value: string; color: string }[] = [];
  for (const ind of indicators) {
    if (!ind.visible) continue;

    if (ind.type === 'EMA' || ind.type === 'SMA') {
      const data = ind.type === 'EMA' ? computeEMA(candles, ind.period) : computeSMA(candles, ind.period);
      const point = data.find((d) => d.time === crosshairData.time);
      if (point) {
        indicatorValues.push({
          id: ind.id,
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
          id: ind.id,
          label: `RSI(${ind.period})`,
          value: point.value.toFixed(2),
          color: ind.color,
        });
      }
    }

    if (ind.type === 'STOCH_RSI') {
      const { k } = computeStochRSI(candles, ind.period, ind.period, ind.kPeriod ?? 3, ind.dPeriod ?? 3);
      const kPt = k.find((pt) => pt.time === crosshairData.time);
      if (kPt) {
        indicatorValues.push({
          id: ind.id,
          label: `StochRSI(${ind.period})`,
          value: kPt.value.toFixed(2),
          color: ind.color,
        });
      }
    }

    if (ind.type === 'BBANDS') {
      const { upper, middle, lower } = computeBollingerBands(candles, ind.period, ind.stdDev ?? 2);
      const mPt = middle.find((pt) => pt.time === crosshairData.time);
      const uPt = upper.find((pt) => pt.time === crosshairData.time);
      const lPt = lower.find((pt) => pt.time === crosshairData.time);
      if (mPt) {
        indicatorValues.push({ id: ind.id, label: `BB(${ind.period})`, value: `${uPt?.value.toFixed(2)} / ${mPt.value.toFixed(2)} / ${lPt?.value.toFixed(2)}`, color: ind.color });
      }
    }

    if (ind.type === 'VWAP') {
      const data = computeVWAP(candles);
      const point = data.find((d) => d.time === crosshairData.time);
      if (point) {
        indicatorValues.push({ id: ind.id, label: 'VWAP', value: point.value.toFixed(2), color: ind.color });
      }
    }
  }

  return (
    <div className="absolute top-1 left-1 z-30 flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 py-1 rounded bg-background/70 backdrop-blur-sm text-[11px] font-mono">
      {/* OHLCV - not interactive */}
      <span className="text-muted-foreground pointer-events-none">
        O <span className={isUp ? 'text-bull' : 'text-bear'}>{open.toFixed(2)}</span>
      </span>
      <span className="text-muted-foreground pointer-events-none">
        H <span className={isUp ? 'text-bull' : 'text-bear'}>{high.toFixed(2)}</span>
      </span>
      <span className="text-muted-foreground pointer-events-none">
        L <span className={isUp ? 'text-bull' : 'text-bear'}>{low.toFixed(2)}</span>
      </span>
      <span className="text-muted-foreground pointer-events-none">
        C <span className={isUp ? 'text-bull' : 'text-bear'}>{close.toFixed(2)}</span>
      </span>
      <span className="text-muted-foreground pointer-events-none">
        V <span className="text-foreground">{formatVolume(volume)}</span>
      </span>

      {/* Indicator values - clickable */}
      {indicatorValues.map((iv) => {
        const isSelected = selectedIndicatorId === iv.id;
        return (
          <span
            key={iv.id}
            className={`pointer-events-auto cursor-pointer rounded px-1 transition-colors flex items-center gap-0.5 ${
              isSelected ? 'bg-accent ring-1 ring-primary/30' : 'hover:bg-accent/50'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedIndicatorId(isSelected ? null : iv.id);
            }}
          >
            <span className="text-muted-foreground">{iv.label}</span>{' '}
            <span style={{ color: iv.color }}>{iv.value}</span>
            {isSelected && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Remove ${iv.label}?`)) {
                    removeIndicator(iv.id);
                  }
                }}
                className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete indicator"
              >
                <X size={10} />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
};

function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}
