import { useEffect, useRef, MutableRefObject, useCallback } from 'react';
import { IChartApi, ISeriesApi, LineData, Time, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { computeEMA, computeSMA, computeBollingerBands, computeVWAP, computeSupertrend, computePivotHighLow, computeMsbOb } from '@/lib/marketData';
import { LineStyleType } from '@/types/trading';

const toLWLineStyle = (s?: LineStyleType) => s === 'dashed' ? 2 : s === 'dotted' ? 1 : 0;

export function useIndicatorRenderer(
  chartRef: MutableRefObject<IChartApi | null>,
  candleSeriesRef: MutableRefObject<ISeriesApi<'Candlestick'> | null>,
  candles: any[],
  indicators: any[]
) {
  const lineSeriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());

  const clearLineSeries = useCallback(() => {
    lineSeriesRefs.current.clear();
  }, []);

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    lineSeriesRefs.current.forEach((series) => {
      try { chartRef.current?.removeSeries(series); } catch {}
    });
    lineSeriesRefs.current.clear();

    let allMarkers: { time: Time; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown' | 'circle'; text: string }[] = [];

    for (const ind of indicators) {
      if (!ind.visible) continue;

      if (ind.type === 'EMA' || ind.type === 'SMA') {
        const data = ind.type === 'EMA' ? computeEMA(candles, ind.period) : computeSMA(candles, ind.period);
        if (data.length === 0) continue;
        const series = chartRef.current.addSeries(LineSeries, {
          color: ind.color,
          lineWidth: (ind.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          lineStyle: toLWLineStyle(ind.lineStyle),
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        series.setData(data.map((d: any) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        lineSeriesRefs.current.set(ind.id, series);
      }

      if (ind.type === 'BBANDS') {
        const { upper, middle, lower } = computeBollingerBands(candles, ind.period, ind.stdDev ?? 2);
        if (middle.length === 0) continue;

        const middleSeries = chartRef.current.addSeries(LineSeries, {
          color: ind.color,
          lineWidth: (ind.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          lineStyle: toLWLineStyle(ind.lineStyle),
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        middleSeries.setData(middle.map((d: any) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        lineSeriesRefs.current.set(ind.id + '-mid', middleSeries);

        const upperSeries = chartRef.current.addSeries(LineSeries, {
          color: ind.color,
          lineWidth: (ind.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          lineStyle: toLWLineStyle(ind.lineStyle) || 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        upperSeries.setData(upper.map((d: any) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        lineSeriesRefs.current.set(ind.id + '-upper', upperSeries);

        const lowerSeries = chartRef.current.addSeries(LineSeries, {
          color: ind.color,
          lineWidth: (ind.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          lineStyle: toLWLineStyle(ind.lineStyle) || 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        lowerSeries.setData(lower.map((d: any) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        lineSeriesRefs.current.set(ind.id + '-lower', lowerSeries);
      }

      if (ind.type === 'VWAP') {
        const data = computeVWAP(candles);
        if (data.length === 0) continue;
        const series = chartRef.current.addSeries(LineSeries, {
          color: ind.color,
          lineWidth: (ind.lineWidth ?? 2) as 1 | 2 | 3 | 4,
          lineStyle: toLWLineStyle(ind.lineStyle),
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
        });
        series.setData(data.map((d: any) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        lineSeriesRefs.current.set(ind.id, series);
      }

      if (ind.type === 'SUPERTREND') {
        const { line, signals } = computeSupertrend(candles, ind.period, ind.multiplier ?? 3);
        if (line.length === 0) continue;

        const greenData: (LineData | { time: Time; value: number })[] = [];
        const redData: (LineData | { time: Time; value: number })[] = [];

        for (let i = 0; i < line.length; i++) {
          const pt = { time: line[i].time as Time, value: line[i].value };
          if (line[i].color === '#22c55e') {
            greenData.push(pt);
            if (i > 0 && line[i - 1].color === '#ef4444') {
              greenData.splice(greenData.length - 1, 0, { time: line[i - 1].time as Time, value: line[i - 1].value });
            }
          } else {
            redData.push(pt);
            if (i > 0 && line[i - 1].color === '#22c55e') {
              redData.splice(redData.length - 1, 0, { time: line[i - 1].time as Time, value: line[i - 1].value });
            }
          }
        }

        if (greenData.length > 0) {
          const greenSeries = chartRef.current.addSeries(LineSeries, {
            color: ind.color || '#22c55e',
            lineWidth: (ind.lineWidth ?? 2) as 1 | 2 | 3 | 4,
            lineStyle: toLWLineStyle(ind.lineStyle),
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          greenSeries.setData(greenData as LineData[]);
          lineSeriesRefs.current.set(ind.id + '-green', greenSeries);
        }

        if (redData.length > 0) {
          const redSeries = chartRef.current.addSeries(LineSeries, {
            color: ind.color2 || '#ef4444',
            lineWidth: (ind.lineWidth ?? 2) as 1 | 2 | 3 | 4,
            lineStyle: toLWLineStyle(ind.lineStyle),
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          redSeries.setData(redData as LineData[]);
          lineSeriesRefs.current.set(ind.id + '-red', redSeries);
        }

        if (signals.length > 0) {
          allMarkers.push(...signals.map((s: any) => ({
            time: s.time as Time,
            position: s.direction === 'buy' ? 'belowBar' as const : 'aboveBar' as const,
            color: s.direction === 'buy' ? '#22c55e' : '#ef4444',
            shape: s.direction === 'buy' ? 'arrowUp' as const : 'arrowDown' as const,
            text: s.direction === 'buy' ? 'BUY' : 'SELL',
          })));
        }
      }

      if (ind.type === 'PIVOT_HL') {
        const { highs, lows } = computePivotHighLow(candles, ind.period, ind.period);

        allMarkers.push(...highs.map((p: any) => ({
          time: p.time as Time,
          position: 'aboveBar' as const,
          color: ind.color || '#22c55e',
          shape: 'circle' as const,
          text: `H ${p.price.toFixed(2)}`,
        })));

        allMarkers.push(...lows.map((p: any) => ({
          time: p.time as Time,
          position: 'belowBar' as const,
          color: ind.color2 || '#ef4444',
          shape: 'circle' as const,
          text: `L ${p.price.toFixed(2)}`,
        })));
      }

      // FVG and MARKET_STRUCTURE are rendered by SmartMoneyOverlay (canvas), skip here
      if (ind.type === 'FVG' || ind.type === 'MARKET_STRUCTURE') continue;

      if (ind.type === 'MSB_OB') {
        const msbResult = computeMsbOb(candles, ind.zigzagLength ?? 9, ind.fibFactor ?? 0.33);

        if (msbResult.zigzag.length > 1) {
          const zigzagSeries = chartRef.current.addSeries(LineSeries, {
            color: '#6b7280',
            lineWidth: 1 as 1 | 2 | 3 | 4,
            lineStyle: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          zigzagSeries.setData(msbResult.zigzag.map((p: any) => ({ time: p.time as Time, value: p.price })) as LineData[]);
          lineSeriesRefs.current.set(ind.id + '-zigzag', zigzagSeries);
        }

        for (let mi = 0; mi < msbResult.msbLines.length; mi++) {
          const msb = msbResult.msbLines[mi];
          const color = msb.direction === 'bull' ? '#22c55e' : '#ef4444';
          const msbSeries = chartRef.current.addSeries(LineSeries, {
            color,
            lineWidth: 2 as 1 | 2 | 3 | 4,
            lineStyle: 0,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          msbSeries.setData([
            { time: msb.time1 as Time, value: msb.price },
            { time: msb.time2 as Time, value: msb.price },
          ] as LineData[]);
          lineSeriesRefs.current.set(ind.id + `-msb-${mi}`, msbSeries);
        }

        allMarkers.push(...msbResult.msbMarkers.map((m: any) => ({
          time: m.time as Time,
          position: (m.direction === 'bull' ? 'aboveBar' : 'belowBar') as 'aboveBar' | 'belowBar',
          color: m.direction === 'bull' ? '#22c55e' : '#ef4444',
          shape: (m.direction === 'bull' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
          text: m.label,
        })));

        const lastTime = candles[candles.length - 1].time;
        for (let zi = 0; zi < msbResult.zones.length; zi++) {
          const zone = msbResult.zones[zi];
          const isBull = zone.type.startsWith('Bu');
          const zoneColor = isBull ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)';
          const zoneBorderColor = isBull ? '#22c55e' : '#ef4444';

          const topSeries = chartRef.current.addSeries(LineSeries, {
            color: zoneBorderColor,
            lineWidth: 1 as 1 | 2 | 3 | 4,
            lineStyle: 0,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          topSeries.setData([
            { time: zone.startTime as Time, value: zone.top },
            { time: lastTime as Time, value: zone.top },
          ] as LineData[]);
          lineSeriesRefs.current.set(ind.id + `-zone-top-${zi}`, topSeries);

          const bottomSeries = chartRef.current.addSeries(LineSeries, {
            color: zoneBorderColor,
            lineWidth: 1 as 1 | 2 | 3 | 4,
            lineStyle: 0,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          bottomSeries.setData([
            { time: zone.startTime as Time, value: zone.bottom },
            { time: lastTime as Time, value: zone.bottom },
          ] as LineData[]);
          lineSeriesRefs.current.set(ind.id + `-zone-bot-${zi}`, bottomSeries);

          const midSeries = chartRef.current.addSeries(LineSeries, {
            color: zoneColor,
            lineWidth: 1 as 1 | 2 | 3 | 4,
            lineStyle: 1,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: false,
          });
          const midPrice = (zone.top + zone.bottom) / 2;
          midSeries.setData([
            { time: zone.startTime as Time, value: midPrice },
            { time: lastTime as Time, value: midPrice },
          ] as LineData[]);
          midSeries.applyOptions({ title: zone.type });
          lineSeriesRefs.current.set(ind.id + `-zone-mid-${zi}`, midSeries);
        }
      }
    }

    if (candleSeriesRef.current) {
      allMarkers.sort((a, b) => (a.time as number) - (b.time as number));
      createSeriesMarkers(candleSeriesRef.current, allMarkers);
    }
  }, [candles, indicators, chartRef, candleSeriesRef]);

  return { lineSeriesRefs, clearLineSeries };
}
