import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useChartStore } from '@/stores/chartStore';
import { computeVolumeChannelFlow } from '@/lib/marketData';

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export const VCFOverlay: React.FC<Props> = ({ chartRef, seriesRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { candles, indicators } = useChartStore();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series || candles.length === 0) return;

    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const vcfInd = indicators.find((ind) => ind.type === 'VOLUME_CHANNEL_FLOW' && ind.visible);
    if (!vcfInd) return;
    if (vcfInd.profile === false) return; // if profile is hidden

    const vcfResult = computeVolumeChannelFlow(candles, vcfInd.channelWidth ?? 3, vcfInd.minLength ?? 10);
    if (!vcfResult.profiles.length) return;

    const profPOC = vcfInd.profPOC !== false;
    const transparency = vcfInd.transparency ?? 65;
    const alpha = (100 - transparency) / 100;
    const upColor = vcfInd.color || '#22c55e';
    const dnColor = vcfInd.color2 || '#ef4444';

    ctx.save();
    
    for (const prof of vcfResult.profiles) {
      try {
        if (prof.startIndex >= seriesData.length || prof.endIndex >= seriesData.length) continue;

        const startX = chart.timeScale().timeToCoordinate(seriesData[prof.startIndex].time as any);
        const endX = chart.timeScale().timeToCoordinate(seriesData[prof.endIndex].time as any);
        const topY = series.priceToCoordinate(prof.top);
        const botY = series.priceToCoordinate(prof.bot);
        
        if (startX === null || endX === null || topY === null || botY === null) continue;

        // Draw Channel Box & Lines if enabled (using truthy logic to default to true if unspecified)
        if (vcfInd.channel !== false) {
           // Faint Background Box
           ctx.fillStyle = `rgba(128, 128, 128, 0.08)`; 
           ctx.fillRect(startX, topY, endX - startX, botY - topY);

           // Step Boundaries (Top and Bottom Lines)
           // matching Tradingview pfColor at 20 transparency (opacity 0.8)
           ctx.strokeStyle = prof.isBear ? `rgba(239, 68, 68, 0.8)` : `rgba(34, 197, 94, 0.8)`;
           ctx.lineWidth = 1;
           ctx.beginPath();
           ctx.moveTo(startX, topY); ctx.lineTo(endX, topY);
           ctx.moveTo(startX, botY); ctx.lineTo(endX, botY);
           ctx.stroke();
        }

        // Draw Volume Profile Histogram
        if (vcfInd.profile !== false) {
          ctx.fillStyle = prof.isBear ? `rgba(239, 68, 68, ${alpha})` : `rgba(34, 197, 94, ${alpha})`;
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 1;
          const maxVol = Math.max(...prof.bins.map((b: any) => b.volume as number));
          
          if (maxVol > 0) {
            const totalBars = prof.endIndex - prof.startIndex;
            const maxVisualWidth = totalBars / 2;
            
            ctx.beginPath();
            ctx.moveTo(startX, botY);
            
            for (let i = 0; i < prof.bins.length; i++) {
              const bin = prof.bins[i];
              const yMid = series.priceToCoordinate(bin.price);
              if (yMid === null) continue;

              let barWidthPx = startX;
              if (bin.volume > 0) {
                const widthRatio = bin.volume / maxVol;
                const barWidthCandles = widthRatio * maxVisualWidth;
                
                const rightIdx = Math.min(seriesData.length - 1, prof.startIndex + Math.floor(barWidthCandles) + 1);
                const rightCandleCoord = chart.timeScale().timeToCoordinate(seriesData[rightIdx].time as any);
                if (rightCandleCoord !== null) {
                  barWidthPx = Math.max(startX, rightCandleCoord);
                }
              }
              
              ctx.lineTo(barWidthPx, yMid);
            }
            
            ctx.lineTo(startX, topY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }

        // Draw Point of Control Line
        if (profPOC && !isNaN(prof.pocPrice)) {
          const pocY = series.priceToCoordinate(prof.pocPrice);
          const pocStartX = chart.timeScale().timeToCoordinate(seriesData[Math.min(seriesData.length - 1, prof.pocStartIndex)].time as any);
          
          if (pocY !== null && pocStartX !== null) {
             ctx.beginPath();
             ctx.setLineDash([2, 5]);
             // In Tradingview profPOC draws from start of histogram or start of channel based on `profile` toggle
             ctx.moveTo(vcfInd.profile !== false ? pocStartX : startX, pocY);
             ctx.lineTo(endX, pocY);
             ctx.strokeStyle = prof.isBear ? dnColor : upColor;
             ctx.lineWidth = 2;
             ctx.stroke();
             ctx.setLineDash([]);
          }
        }
      } catch (e) {
        // ignore coordinate errors
      }
    }
    
    ctx.restore();
  }, [chartRef, seriesRef, candles, indicators]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    
    draw();
    chart.timeScale().subscribeVisibleTimeRangeChange(draw);
    chart.subscribeCrosshairMove(draw);

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(draw);
      chart.unsubscribeCrosshairMove(draw);
    };
  }, [chartRef, draw]);

  // Request animation frame loop for smooth resizing
  useEffect(() => {
    let animationFrameId: number;
    const renderLoop = () => {
      draw();
      animationFrameId = requestAnimationFrame(renderLoop);
    };
    renderLoop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 5,
        width: '100%',
        height: '100%',
      }}
    />
  );
};
