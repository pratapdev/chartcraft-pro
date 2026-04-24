import { useEffect, useRef, MutableRefObject, useCallback } from 'react';
import { IChartApi, ISeriesApi, LineData, Time } from 'lightweight-charts';
import { computeEMA, computeSMA, computeBollingerBands, computeVWAP, computeSupertrend, computePivotHighLow, computeMsbOb, computeVolumeChannelFlow } from '@/lib/marketData';
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

    // Collect all markers to merge Supertrend + Pivot HL
    let allMarkers: { time: Time; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown' | 'circle'; text: string }[] = [];

    for (const ind of indicators) {
      if (!ind.visible) continue;

      if (ind.type === 'EMA' || ind.type === 'SMA') {
        const data = ind.type === 'EMA' ? computeEMA(candles, ind.period) : computeSMA(candles, ind.period);
        if (data.length === 0) continue;
        const series = chartRef.current.addLineSeries({
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

        const middleSeries = chartRef.current.addLineSeries({
          color: ind.color,
          lineWidth: (ind.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          lineStyle: toLWLineStyle(ind.lineStyle),
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        middleSeries.setData(middle.map((d: any) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        lineSeriesRefs.current.set(ind.id + '-mid', middleSeries);

        const upperSeries = chartRef.current.addLineSeries({
          color: ind.color,
          lineWidth: (ind.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          lineStyle: toLWLineStyle(ind.lineStyle) || 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        upperSeries.setData(upper.map((d: any) => ({ time: d.time as Time, value: d.value })) as LineData[]);
        lineSeriesRefs.current.set(ind.id + '-upper', upperSeries);

        const lowerSeries = chartRef.current.addLineSeries({
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
        const series = chartRef.current.addLineSeries({
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
          const greenSeries = chartRef.current.addLineSeries({
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
          const redSeries = chartRef.current.addLineSeries({
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

        // Add pivot high markers
        allMarkers.push(...highs.map((p: any) => ({
          time: p.time as Time,
          position: 'aboveBar' as const,
          color: ind.color || '#22c55e',
          shape: 'circle' as const,
          text: `H ${p.price.toFixed(2)}`,
        })));

        // Add pivot low markers
        allMarkers.push(...lows.map((p: any) => ({
          time: p.time as Time,
          position: 'belowBar' as const,
          color: ind.color2 || '#ef4444',
          shape: 'circle' as const,
          text: `L ${p.price.toFixed(2)}`,
        })));
      }

      if (ind.type === 'MSB_OB') {
        const msbResult = computeMsbOb(candles, ind.zigzagLength ?? 9, ind.fibFactor ?? 0.33);

        // ZigZag line
        if (msbResult.zigzag.length > 1) {
          const zigzagSeries = chartRef.current.addLineSeries({
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

        // MSB horizontal lines
        for (let mi = 0; mi < msbResult.msbLines.length; mi++) {
          const msb = msbResult.msbLines[mi];
          const color = msb.direction === 'bull' ? '#22c55e' : '#ef4444';
          const msbSeries = chartRef.current.addLineSeries({
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

        // MSB markers
        allMarkers.push(...msbResult.msbMarkers.map((m: any) => ({
          time: m.time as Time,
          position: (m.direction === 'bull' ? 'aboveBar' : 'belowBar') as 'aboveBar' | 'belowBar',
          color: m.direction === 'bull' ? '#22c55e' : '#ef4444',
          shape: (m.direction === 'bull' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
          text: m.label,
        })));

        // Order Block & Breaker Block zones (top + bottom lines)
        const lastTime = candles[candles.length - 1].time;
        for (let zi = 0; zi < msbResult.zones.length; zi++) {
          const zone = msbResult.zones[zi];
          const isBull = zone.type.startsWith('Bu');
          const zoneColor = isBull ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)';
          const zoneBorderColor = isBull ? '#22c55e' : '#ef4444';

          // Top line
          const topSeries = chartRef.current.addLineSeries({
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

          // Bottom line
          const bottomSeries = chartRef.current.addLineSeries({
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

          // Mid label line (faint, for zone fill effect)
          const midSeries = chartRef.current.addLineSeries({
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
          // Set the last value label to show zone type
          midSeries.applyOptions({ title: zone.type });
          lineSeriesRefs.current.set(ind.id + `-zone-mid-${zi}`, midSeries);
        }
      }

      if (ind.type === 'VOLUME_CHANNEL_FLOW') {
        const vcf = computeVolumeChannelFlow(candles, ind.channelWidth ?? 3, ind.minLength ?? 10);
        if (vcf.avgLine.length === 0) continue;

        const plotColoredLine = (
          lineData: { time: number; value: number; color: string }[],
          lineWidth: number,
          lineStyle: number,
          idSuffix: string
        ) => {
          const greenPts: (LineData | { time: Time; value: number })[] = [];
          const redPts: (LineData | { time: Time; value: number })[] = [];

          for (let i = 0; i < lineData.length; i++) {
            const pt = { time: lineData[i].time as Time, value: lineData[i].value };
            if (lineData[i].color === '#22c55e') {
              greenPts.push(pt);
              if (i > 0 && lineData[i - 1].color === '#ef4444') {
                greenPts.splice(greenPts.length - 1, 0, { time: lineData[i - 1].time as Time, value: lineData[i - 1].value });
              }
            } else {
              redPts.push(pt);
              if (i > 0 && lineData[i - 1].color === '#22c55e') {
                redPts.splice(redPts.length - 1, 0, { time: lineData[i - 1].time as Time, value: lineData[i - 1].value });
              }
            }
          }

          if (greenPts.length > 0) {
            const series = chartRef.current.addLineSeries({
              color: ind.color || '#22c55e',
              lineWidth: lineWidth as 1 | 2 | 3 | 4,
              lineStyle: lineStyle,
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false,
            });
            series.setData(greenPts as LineData[]);
            lineSeriesRefs.current.set(`${ind.id}-vcf-${idSuffix}-g`, series);
          }

          if (redPts.length > 0) {
            const series = chartRef.current.addLineSeries({
              color: ind.color2 || '#ef4444',
              lineWidth: lineWidth as 1 | 2 | 3 | 4,
              lineStyle: lineStyle,
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false,
            });
            series.setData(redPts as LineData[]);
            lineSeriesRefs.current.set(`${ind.id}-vcf-${idSuffix}-r`, series);
          }
        };

        plotColoredLine(vcf.avgLine, ind.lineWidth ?? 3, toLWLineStyle(ind.lineStyle), 'avg');

        if (ind.breakouts !== false && vcf.breakouts.length > 0) {
          allMarkers.push(...vcf.breakouts.map((b: any) => ({
            time: b.time,
            position: b.direction === 'down' ? 'aboveBar' : 'belowBar',
            color: b.direction === 'down' ? (ind.color2 || '#ef4444') : (ind.color || '#22c55e'),
            shape: b.direction === 'down' ? 'arrowDown' : 'arrowUp',
            size: 1
          })));
        }
      }
    }

    // Sort markers by time (required by lightweight-charts) and set on candle series
    if (candleSeriesRef.current) {
      allMarkers.sort((a, b) => (a.time as number) - (b.time as number));
      candleSeriesRef.current.setMarkers(allMarkers);
    }
  }, [candles, indicators, chartRef, candleSeriesRef]);

  return { lineSeriesRefs, clearLineSeries };
}
