import { Candle, Timeframe } from '@/types/trading';

const BINANCE_REST = 'https://api.binance.com/api/v3/klines';

// Map our symbols to Binance symbols
const SYMBOL_MAP: Record<string, string> = {
  'BTC/USD': 'BTCUSDT',
  'ETH/USD': 'ETHUSDT',
  'SOL/USD': 'SOLUSDT',
  'BNB/USD': 'BNBUSDT',
  'XRP/USD': 'XRPUSDT',
  'ADA/USD': 'ADAUSDT',
  'DOGE/USD': 'DOGEUSDT',
  'AVAX/USD': 'AVAXUSDT',
};

// Dynamically resolve any symbol to Binance format
function toBinanceSymbol(symbol: string): string {
  if (SYMBOL_MAP[symbol]) return SYMBOL_MAP[symbol];
  // Convert "XXX/USD" → "XXXUSDT"
  return symbol.replace('/', '').replace('USD', 'USDT');
}
const INTERVAL_MAP: Record<Timeframe, string> = {
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
};

export async function fetchCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number = 500
): Promise<Candle[]> {
  const binanceSymbol = toBinanceSymbol(symbol);
  const interval = INTERVAL_MAP[timeframe];

  try {
    const res = await fetch(
      `${BINANCE_REST}?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`
    );
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    return data.map((k: any[]) => ({
      time: Math.floor(k[0] / 1000), // Convert ms to seconds
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (err) {
    console.error('Failed to fetch candles from Binance:', err);
    return generateFallbackData(500);
  }
}

// WebSocket for live candle updates
export function subscribeToCandles(
  symbol: string,
  timeframe: Timeframe,
  onUpdate: (candle: Candle) => void
): () => void {
  const binanceSymbol = toBinanceSymbol(symbol).toLowerCase();
  const interval = INTERVAL_MAP[timeframe];
  const wsUrl = `wss://stream.binance.com:9443/ws/${binanceSymbol}@kline_${interval}`;

  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout>;
  let alive = true;

  function connect() {
    if (!alive) return;
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.e === 'kline') {
          const k = msg.k;
          onUpdate({
            time: Math.floor(k.t / 1000),
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
          });
        }
      } catch {}
    };

    ws.onclose = () => {
      if (alive) {
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  connect();

  return () => {
    alive = false;
    clearTimeout(reconnectTimeout);
    ws?.close();
  };
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookDepth {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
}

export function subscribeToOrderBook(
  symbol: string,
  onUpdate: (depth: OrderBookDepth) => void
): () => void {
  const binanceSymbol = toBinanceSymbol(symbol).toLowerCase();
  const wsUrl = `wss://stream.binance.com:9443/ws/${binanceSymbol}@depth20@100ms`;

  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout>;
  let alive = true;

  function connect() {
    if (!alive) return;
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.lastUpdateId && msg.bids && msg.asks) {
          onUpdate({
            lastUpdateId: msg.lastUpdateId,
            bids: msg.bids.map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
            asks: msg.asks.map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) })),
          });
        }
      } catch {}
    };

    ws.onclose = () => {
      if (alive) {
        reconnectTimeout = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  connect();

  return () => {
    alive = false;
    clearTimeout(reconnectTimeout);
    ws?.close();
  };
}

// Fallback data generator
function generateFallbackData(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 42000;
  const now = Math.floor(Date.now() / 1000);
  const interval = 3600;

  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * interval;
    const volatility = price * 0.008;
    const change = (Math.random() - 0.48) * volatility;
    const open = price;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.floor(50 + Math.random() * 500);

    candles.push({
      time,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });
    price = close;
  }
  return candles;
}

// Compute EMA
export function computeEMA(candles: Candle[], period: number): { time: number; value: number }[] {
  const result: { time: number; value: number }[] = [];
  if (candles.length === 0) return result;
  const k = 2 / (period + 1);
  let ema = candles[0].close;

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) ema = candles[i].close;
    else ema = candles[i].close * k + ema * (1 - k);
    if (i >= period - 1) {
      result.push({ time: candles[i].time, value: Math.round(ema * 100) / 100 });
    }
  }
  return result;
}

// Compute SMA
export function computeSMA(candles: Candle[], period: number): { time: number; value: number }[] {
  const result: { time: number; value: number }[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    result.push({ time: candles[i].time, value: Math.round((sum / period) * 100) / 100 });
  }
  return result;
}

// Compute RSI
export function computeRSI(candles: Candle[], period: number): { time: number; value: number }[] {
  if (candles.length < period + 1) return [];
  const result: { time: number; value: number }[] = [];
  let avgGain = 0, avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push({ time: candles[period].time, value: Math.round((100 - 100 / (1 + rs)) * 100) / 100 });

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: candles[i].time, value: Math.round(rsi * 100) / 100 });
  }
  return result;
}

// Compute Stochastic RSI
export function computeStochRSI(
  candles: Candle[],
  rsiPeriod: number,
  stochPeriod: number,
  kSmooth: number,
  dSmooth: number
): { k: { time: number; value: number }[]; d: { time: number; value: number }[] } {
  const rsiValues = computeRSI(candles, rsiPeriod);
  if (rsiValues.length < stochPeriod) return { k: [], d: [] };

  // Raw StochRSI
  const rawStoch: { time: number; value: number }[] = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    let minRsi = Infinity, maxRsi = -Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      minRsi = Math.min(minRsi, rsiValues[j].value);
      maxRsi = Math.max(maxRsi, rsiValues[j].value);
    }
    const range = maxRsi - minRsi;
    const stochVal = range === 0 ? 50 : ((rsiValues[i].value - minRsi) / range) * 100;
    rawStoch.push({ time: rsiValues[i].time, value: stochVal });
  }

  // Smooth K (SMA of rawStoch)
  const kLine: { time: number; value: number }[] = [];
  for (let i = kSmooth - 1; i < rawStoch.length; i++) {
    let sum = 0;
    for (let j = i - kSmooth + 1; j <= i; j++) sum += rawStoch[j].value;
    kLine.push({ time: rawStoch[i].time, value: Math.round((sum / kSmooth) * 100) / 100 });
  }

  // D line (SMA of K)
  const dLine: { time: number; value: number }[] = [];
  for (let i = dSmooth - 1; i < kLine.length; i++) {
    let sum = 0;
    for (let j = i - dSmooth + 1; j <= i; j++) sum += kLine[j].value;
    dLine.push({ time: kLine[i].time, value: Math.round((sum / dSmooth) * 100) / 100 });
  }

  return { k: kLine, d: dLine };
}

// Compute Bollinger Bands
export function computeBollingerBands(
  candles: Candle[],
  period: number,
  stdDev: number = 2
): { upper: { time: number; value: number }[]; middle: { time: number; value: number }[]; lower: { time: number; value: number }[] } {
  const upper: { time: number; value: number }[] = [];
  const middle: { time: number; value: number }[] = [];
  const lower: { time: number; value: number }[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const sma = sum / period;

    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) sqSum += (candles[j].close - sma) ** 2;
    const sd = Math.sqrt(sqSum / period);

    const t = candles[i].time;
    middle.push({ time: t, value: Math.round(sma * 100) / 100 });
    upper.push({ time: t, value: Math.round((sma + stdDev * sd) * 100) / 100 });
    lower.push({ time: t, value: Math.round((sma - stdDev * sd) * 100) / 100 });
  }

  return { upper, middle, lower };
}

// Compute MACD
export function computeMACD(
  candles: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macdLine: { time: number; value: number }[]; signalLine: { time: number; value: number }[]; histogram: { time: number; value: number }[] } {
  if (candles.length < slowPeriod) return { macdLine: [], signalLine: [], histogram: [] };

  const fastK = 2 / (fastPeriod + 1);
  const slowK = 2 / (slowPeriod + 1);

  let fastEma = candles[0].close;
  let slowEma = candles[0].close;
  const rawMacd: { time: number; value: number }[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i].close;
    if (i === 0) { fastEma = c; slowEma = c; }
    else { fastEma = c * fastK + fastEma * (1 - fastK); slowEma = c * slowK + slowEma * (1 - slowK); }
    if (i >= slowPeriod - 1) {
      rawMacd.push({ time: candles[i].time, value: Math.round((fastEma - slowEma) * 100) / 100 });
    }
  }

  // Signal line (EMA of MACD)
  const sigK = 2 / (signalPeriod + 1);
  let sigEma = rawMacd.length > 0 ? rawMacd[0].value : 0;
  const signalLine: { time: number; value: number }[] = [];
  const histogram: { time: number; value: number }[] = [];

  for (let i = 0; i < rawMacd.length; i++) {
    if (i === 0) sigEma = rawMacd[i].value;
    else sigEma = rawMacd[i].value * sigK + sigEma * (1 - sigK);
    if (i >= signalPeriod - 1) {
      signalLine.push({ time: rawMacd[i].time, value: Math.round(sigEma * 100) / 100 });
      histogram.push({ time: rawMacd[i].time, value: Math.round((rawMacd[i].value - sigEma) * 100) / 100 });
    }
  }

  // Trim macdLine to match signal start
  const startTime = signalLine.length > 0 ? signalLine[0].time : Infinity;
  const macdLine = rawMacd.filter((d) => d.time >= startTime);

  return { macdLine, signalLine, histogram };
}

// Compute VWAP
export function computeVWAP(candles: Candle[]): { time: number; value: number }[] {
  const result: { time: number; value: number }[] = [];
  let cumVolPrice = 0;
  let cumVol = 0;

  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumVolPrice += tp * c.volume;
    cumVol += c.volume;
    if (cumVol > 0) {
      result.push({ time: c.time, value: Math.round((cumVolPrice / cumVol) * 100) / 100 });
    }
  }
  return result;
}

// Compute Supertrend
export function computeSupertrend(
  candles: Candle[],
  period: number = 10,
  multiplier: number = 3
): { line: { time: number; value: number; color: string }[]; signals: { time: number; price: number; direction: 'buy' | 'sell' }[] } {
  if (candles.length < period + 1) return { line: [], signals: [] };

  // Compute ATR
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      tr.push(Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      ));
    }
  }

  const atr: number[] = new Array(candles.length).fill(0);
  let atrSum = 0;
  for (let i = 0; i < period; i++) atrSum += tr[i];
  atr[period - 1] = atrSum / period;
  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }

  const upperBand: number[] = new Array(candles.length).fill(0);
  const lowerBand: number[] = new Array(candles.length).fill(0);
  const supertrend: number[] = new Array(candles.length).fill(0);
  const direction: number[] = new Array(candles.length).fill(1); // 1 = up (bullish), -1 = down (bearish)

  for (let i = period - 1; i < candles.length; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    let basicUpper = hl2 + multiplier * atr[i];
    let basicLower = hl2 - multiplier * atr[i];

    if (i === period - 1) {
      upperBand[i] = basicUpper;
      lowerBand[i] = basicLower;
      supertrend[i] = candles[i].close > basicUpper ? basicLower : basicUpper;
      direction[i] = candles[i].close > basicUpper ? 1 : -1;
    } else {
      upperBand[i] = basicUpper < upperBand[i - 1] || candles[i - 1].close > upperBand[i - 1] ? basicUpper : upperBand[i - 1];
      lowerBand[i] = basicLower > lowerBand[i - 1] || candles[i - 1].close < lowerBand[i - 1] ? basicLower : lowerBand[i - 1];

      if (direction[i - 1] === 1) {
        direction[i] = candles[i].close < lowerBand[i] ? -1 : 1;
      } else {
        direction[i] = candles[i].close > upperBand[i] ? 1 : -1;
      }

      supertrend[i] = direction[i] === 1 ? lowerBand[i] : upperBand[i];
    }
  }

  const line: { time: number; value: number; color: string }[] = [];
  const signals: { time: number; price: number; direction: 'buy' | 'sell' }[] = [];

  for (let i = period; i < candles.length; i++) {
    line.push({
      time: candles[i].time,
      value: Math.round(supertrend[i] * 100) / 100,
      color: direction[i] === 1 ? '#22c55e' : '#ef4444',
    });

    // Detect direction changes for buy/sell signals
    if (i > period && direction[i] !== direction[i - 1]) {
      signals.push({
        time: candles[i].time,
        price: candles[i].close,
        direction: direction[i] === 1 ? 'buy' : 'sell',
      });
    }
  }

  return { line, signals };
}

// Compute ADX (Average Directional Index)
export function computeADX(
  candles: Candle[],
  period: number = 14
): { adx: { time: number; value: number }[]; plusDI: { time: number; value: number }[]; minusDI: { time: number; value: number }[] } {
  if (candles.length < period * 2 + 1) return { adx: [], plusDI: [], minusDI: [] };

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high, low = candles[i].low;
    const prevHigh = candles[i - 1].high, prevLow = candles[i - 1].low, prevClose = candles[i - 1].close;

    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Smoothed TR, +DM, -DM using Wilder's smoothing
  const smooth = (arr: number[], p: number): number[] => {
    const result: number[] = [];
    let sum = 0;
    for (let i = 0; i < p; i++) sum += arr[i];
    result.push(sum);
    for (let i = p; i < arr.length; i++) {
      result.push(result[result.length - 1] - result[result.length - 1] / p + arr[i]);
    }
    return result;
  };

  const smoothTR = smooth(tr, period);
  const smoothPlusDM = smooth(plusDM, period);
  const smoothMinusDM = smooth(minusDM, period);

  const plusDIArr: number[] = [];
  const minusDIArr: number[] = [];
  const dxArr: number[] = [];

  for (let i = 0; i < smoothTR.length; i++) {
    const pdi = smoothTR[i] === 0 ? 0 : (smoothPlusDM[i] / smoothTR[i]) * 100;
    const mdi = smoothTR[i] === 0 ? 0 : (smoothMinusDM[i] / smoothTR[i]) * 100;
    plusDIArr.push(pdi);
    minusDIArr.push(mdi);
    const sum = pdi + mdi;
    dxArr.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }

  // ADX = smoothed DX
  const adxValues: number[] = [];
  if (dxArr.length >= period) {
    let adxSum = 0;
    for (let i = 0; i < period; i++) adxSum += dxArr[i];
    adxValues.push(adxSum / period);
    for (let i = period; i < dxArr.length; i++) {
      adxValues.push((adxValues[adxValues.length - 1] * (period - 1) + dxArr[i]) / period);
    }
  }

  // Map to time-based output. The smoothed arrays start at index (period-1) of the diff arrays,
  // which start at index 1 of candles. So smoothed[0] corresponds to candle[period].
  const adx: { time: number; value: number }[] = [];
  const plusDI: { time: number; value: number }[] = [];
  const minusDI: { time: number; value: number }[] = [];

  const baseIdx = period; // candle index where smoothed data starts
  for (let i = 0; i < plusDIArr.length; i++) {
    const candleIdx = baseIdx + i;
    if (candleIdx >= candles.length) break;
    const t = candles[candleIdx].time;
    plusDI.push({ time: t, value: Math.round(plusDIArr[i] * 100) / 100 });
    minusDI.push({ time: t, value: Math.round(minusDIArr[i] * 100) / 100 });
  }

  // ADX starts period bars after +DI/-DI
  const adxBaseIdx = baseIdx + period - 1;
  for (let i = 0; i < adxValues.length; i++) {
    const candleIdx = adxBaseIdx + i;
    if (candleIdx >= candles.length) break;
    adx.push({ time: candles[candleIdx].time, value: Math.round(adxValues[i] * 100) / 100 });
  }

  return { adx, plusDI, minusDI };
}

// Compute ATR (Average True Range)
export function computeATR(candles: Candle[], period: number = 14): { time: number; value: number }[] {
  if (candles.length < period + 1) return [];
  const result: { time: number; value: number }[] = [];

  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) tr.push(candles[i].high - candles[i].low);
    else tr.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close)));
  }

  let atr = 0;
  for (let i = 0; i < period; i++) atr += tr[i];
  atr /= period;
  result.push({ time: candles[period - 1].time, value: Math.round(atr * 100) / 100 });

  for (let i = period; i < candles.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    result.push({ time: candles[i].time, value: Math.round(atr * 100) / 100 });
  }

  return result;
}

// Compute OBV (On-Balance Volume)
export function computeOBV(candles: Candle[]): { time: number; value: number }[] {
  if (candles.length === 0) return [];
  const result: { time: number; value: number }[] = [];
  let obv = 0;
  result.push({ time: candles[0].time, value: obv });
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) obv += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) obv -= candles[i].volume;
    result.push({ time: candles[i].time, value: obv });
  }
  return result;
}

// Compute Pivot Points High/Low
// A pivot high: candle whose high is >= highs of `leftBars` candles to the left AND `rightBars` candles to the right
// A pivot low: candle whose low is <= lows of `leftBars` candles to the left AND `rightBars` candles to the right
export function computePivotHighLow(
  candles: Candle[],
  leftBars: number = 5,
  rightBars: number = 5
): { highs: { time: number; price: number }[]; lows: { time: number; price: number }[] } {
  const highs: { time: number; price: number }[] = [];
  const lows: { time: number; price: number }[] = [];

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const candle = candles[i];

    // Check pivot high
    let isHigh = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].high > candle.high) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) highs.push({ time: candle.time, price: candle.high });

    // Check pivot low
    let isLow = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].low < candle.low) {
        isLow = false;
        break;
      }
    }
    if (isLow) lows.push({ time: candle.time, price: candle.low });
  }

  return { highs, lows };
}

// Compute Percentage Diff with Donchian Channels
export function computePctDiffDonchian(
  candles: Candle[],
  emaPeriod: number,
  lookbackWindow: number,
  emaSmoothing: number,
  donchianLength: number,
  donLineDiff: number,
): {
  pctDiff: { time: number; value: number; color: string }[];
  emaLine: { time: number; value: number }[];
  basis: { time: number; value: number }[];
  upper: { time: number; value: number }[];
  lower: { time: number; value: number }[];
  upperNew: { time: number; value: number }[];
  lowerNew: { time: number; value: number }[];
} {
  const empty = { pctDiff: [], emaLine: [], basis: [], upper: [], lower: [], upperNew: [], lowerNew: [] };
  if (candles.length < emaPeriod + lookbackWindow) return empty;

  // Step 1: Compute EMA of close
  const emaValues: number[] = [];
  const k = 2 / (emaPeriod + 1);
  let emaVal = candles[0].close;
  emaValues.push(emaVal);
  for (let i = 1; i < candles.length; i++) {
    emaVal = candles[i].close * k + emaVal * (1 - k);
    emaValues.push(emaVal);
  }

  // Step 2: Compute lookback average of EMA and percentage diff
  const pctDiffValues: number[] = new Array(candles.length).fill(NaN);
  for (let i = lookbackWindow - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - lookbackWindow + 1; j <= i; j++) {
      sum += emaValues[j];
    }
    const avg = sum / lookbackWindow;
    pctDiffValues[i] = avg === 0 ? 0 : ((emaValues[i] - avg) / avg) * 100;
  }

  // Step 3: Build pctDiff output with colors
  const pctDiff: { time: number; value: number; color: string }[] = [];
  const validPctDiff: { time: number; value: number }[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (!isNaN(pctDiffValues[i])) {
      const v = Math.round(pctDiffValues[i] * 1000) / 1000;
      pctDiff.push({
        time: candles[i].time,
        value: v,
        color: v > 0 ? '#22c55e' : '#ef4444',
      });
      validPctDiff.push({ time: candles[i].time, value: v });
    }
  }

  // Step 4: EMA of percentage diff (smoothing line)
  const emaLine: { time: number; value: number }[] = [];
  if (validPctDiff.length > emaSmoothing) {
    const k2 = 2 / (emaSmoothing + 1);
    let smoothEma = validPctDiff[0].value;
    emaLine.push({ time: validPctDiff[0].time, value: Math.round(smoothEma * 1000) / 1000 });
    for (let i = 1; i < validPctDiff.length; i++) {
      smoothEma = validPctDiff[i].value * k2 + smoothEma * (1 - k2);
      emaLine.push({ time: validPctDiff[i].time, value: Math.round(smoothEma * 1000) / 1000 });
    }
  }

  // Step 5: Donchian channels on pctDiff
  const basis: { time: number; value: number }[] = [];
  const upper: { time: number; value: number }[] = [];
  const lower: { time: number; value: number }[] = [];
  const upperNew: { time: number; value: number }[] = [];
  const lowerNew: { time: number; value: number }[] = [];

  for (let i = donchianLength - 1; i < validPctDiff.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - donchianLength + 1; j <= i; j++) {
      hi = Math.max(hi, validPctDiff[j].value);
      lo = Math.min(lo, validPctDiff[j].value);
    }
    const t = validPctDiff[i].time;
    const mid = (hi + lo) / 2;
    basis.push({ time: t, value: Math.round(mid * 1000) / 1000 });
    upper.push({ time: t, value: Math.round(hi * 1000) / 1000 });
    lower.push({ time: t, value: Math.round(lo * 1000) / 1000 });
    upperNew.push({ time: t, value: Math.round((hi - hi * donLineDiff) * 1000) / 1000 });
    lowerNew.push({ time: t, value: Math.round((lo - lo * donLineDiff) * 1000) / 1000 });
  }

  return { pctDiff, emaLine, basis, upper, lower, upperNew, lowerNew };
}

// ============= Market Structure Break & Order Block (MSB-OB) =============

export interface MsbObZone {
  type: 'Bu-OB' | 'Be-OB' | 'Bu-BB' | 'Bu-MB' | 'Be-BB' | 'Be-MB';
  top: number;
  bottom: number;
  startTime: number;
  broken: boolean;
}

export interface MsbObResult {
  zigzag: { time: number; price: number }[];
  msbMarkers: { time: number; price: number; direction: 'bull' | 'bear'; label: string }[];
  msbLines: { time1: number; time2: number; price: number; direction: 'bull' | 'bear' }[];
  zones: MsbObZone[];
}

export function computeMsbOb(candles: Candle[], zigzagLen: number, fibFactor: number): MsbObResult {
  const result: MsbObResult = { zigzag: [], msbMarkers: [], msbLines: [], zones: [] };
  if (candles.length < zigzagLen * 3) return result;

  // Compute highest/lowest over zigzagLen
  const highestArr: number[] = new Array(candles.length).fill(0);
  const lowestArr: number[] = new Array(candles.length).fill(Infinity);
  for (let i = 0; i < candles.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = Math.max(0, i - zigzagLen + 1); j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    highestArr[i] = hi;
    lowestArr[i] = lo;
  }

  // ZigZag trend detection
  const trend: number[] = new Array(candles.length).fill(0);
  trend[0] = 1;
  
  const highPoints: { price: number; index: number }[] = [];
  const lowPoints: { price: number; index: number }[] = [];

  for (let i = 1; i < candles.length; i++) {
    const toUp = candles[i].high >= highestArr[i];
    const toDown = candles[i].low <= lowestArr[i];
    
    const prevTrend = trend[i - 1] || 1;
    if (prevTrend === 1 && toDown) trend[i] = -1;
    else if (prevTrend === -1 && toUp) trend[i] = 1;
    else trend[i] = prevTrend;

    // On trend change, find swing point
    if (trend[i] !== trend[i - 1]) {
      if (trend[i] === 1) {
        // Trend changed to up - find the lowest low since last up
        let minLow = Infinity, minIdx = i;
        for (let j = i; j >= Math.max(0, i - 50); j--) {
          if (candles[j].low < minLow) { minLow = candles[j].low; minIdx = j; }
          if (j < i && trend[j] !== trend[j + 1]) break;
        }
        lowPoints.push({ price: minLow, index: minIdx });
      }
      if (trend[i] === -1) {
        // Trend changed to down - find the highest high since last down
        let maxHigh = -Infinity, maxIdx = i;
        for (let j = i; j >= Math.max(0, i - 50); j--) {
          if (candles[j].high > maxHigh) { maxHigh = candles[j].high; maxIdx = j; }
          if (j < i && trend[j] !== trend[j + 1]) break;
        }
        highPoints.push({ price: maxHigh, index: maxIdx });
      }
    }
  }

  // Build zigzag from interleaved high/low points
  const allPoints: { price: number; index: number; type: 'high' | 'low' }[] = [];
  for (const p of highPoints) allPoints.push({ ...p, type: 'high' });
  for (const p of lowPoints) allPoints.push({ ...p, type: 'low' });
  allPoints.sort((a, b) => a.index - b.index);
  
  // Remove consecutive same-type points (keep extremes)
  const zigzag: { price: number; index: number; type: 'high' | 'low' }[] = [];
  for (const p of allPoints) {
    if (zigzag.length === 0) { zigzag.push(p); continue; }
    const last = zigzag[zigzag.length - 1];
    if (last.type === p.type) {
      if (p.type === 'high' && p.price > last.price) zigzag[zigzag.length - 1] = p;
      if (p.type === 'low' && p.price < last.price) zigzag[zigzag.length - 1] = p;
    } else {
      zigzag.push(p);
    }
  }

  result.zigzag = zigzag.map(p => ({ time: candles[p.index].time, price: p.price }));

  // Market structure detection
  let market = 1;
  const zones: MsbObZone[] = [];

  for (let zi = 3; zi < zigzag.length; zi++) {
    const curr = zigzag[zi];
    const prev = zigzag[zi - 1];
    const prev2 = zigzag[zi - 2];
    const prev3 = zigzag[zi - 3];

    if (curr.type === 'low' && prev2.type === 'low') {
      // Check for bearish MSB: lower low
      const l0 = curr, l1 = prev2, h0 = prev;
      const fibRange = Math.abs(h0.price - l1.price) * fibFactor;
      if (l0.price < l1.price - fibRange && market === 1) {
        market = -1;
        // MSB marker and line
        const midTime = candles[Math.floor((l1.index + h0.index) / 2)]?.time ?? candles[l0.index].time;
        result.msbMarkers.push({ time: midTime, price: l1.price, direction: 'bear', label: 'MSB' });
        result.msbLines.push({ time1: candles[l1.index].time, time2: candles[l0.index].time, price: l1.price, direction: 'bear' });

        // Bearish Order Block: last bullish candle between l1i and h0i
        let beObIdx = -1;
        for (let k = l1.index; k <= h0.index; k++) {
          if (candles[k].open < candles[k].close) beObIdx = k; // bullish candle = bearish OB
        }
        if (beObIdx >= 0) {
          zones.push({ type: 'Be-OB', top: candles[beObIdx].high, bottom: candles[beObIdx].low, startTime: candles[beObIdx].time, broken: false });
        }

        // Bearish Breaker Block: last bearish candle between h1i and l1i
        if (zi >= 3 && prev3.type === 'high') {
          const h1 = prev3;
          let beBbIdx = -1;
          for (let k = h1.index; k <= l1.index; k++) {
            if (candles[k].open > candles[k].close) beBbIdx = k; // bearish candle = Be-BB
          }
          if (beBbIdx >= 0) {
            const label = h0.price > prev3.price ? 'Be-BB' : 'Be-MB';
            zones.push({ type: label as any, top: candles[beBbIdx].high, bottom: candles[beBbIdx].low, startTime: candles[beBbIdx].time, broken: false });
          }
        }
      }
    }

    if (curr.type === 'high' && prev2.type === 'high') {
      // Check for bullish MSB: higher high
      const h0 = curr, h1 = prev2, l0 = prev;
      const fibRange = Math.abs(h1.price - l0.price) * fibFactor;
      if (h0.price > h1.price + fibRange && market === -1) {
        market = 1;
        const midTime = candles[Math.floor((h1.index + l0.index) / 2)]?.time ?? candles[h0.index].time;
        result.msbMarkers.push({ time: midTime, price: h1.price, direction: 'bull', label: 'MSB' });
        result.msbLines.push({ time1: candles[h1.index].time, time2: candles[h0.index].time, price: h1.price, direction: 'bull' });

        // Bullish Order Block: last bearish candle between h1i and l0i
        let buObIdx = -1;
        for (let k = h1.index; k <= l0.index; k++) {
          if (candles[k].open > candles[k].close) buObIdx = k; // bearish candle = bullish OB
        }
        if (buObIdx >= 0) {
          zones.push({ type: 'Bu-OB', top: candles[buObIdx].high, bottom: candles[buObIdx].low, startTime: candles[buObIdx].time, broken: false });
        }

        // Bullish Breaker Block: last bullish candle between l1i and h1i
        if (zi >= 3 && prev3.type === 'low') {
          const l1 = prev3;
          let buBbIdx = -1;
          for (let k = l1.index; k <= h1.index; k++) {
            if (candles[k].open < candles[k].close) buBbIdx = k; // bullish candle = Bu-BB
          }
          if (buBbIdx >= 0) {
            const label = l0.price < prev3.price ? 'Bu-BB' : 'Bu-MB';
            zones.push({ type: label as any, top: candles[buBbIdx].high, bottom: candles[buBbIdx].low, startTime: candles[buBbIdx].time, broken: false });
          }
        }
      }
    }
  }

  // Check if zones are broken by current price
  if (candles.length > 0) {
    const lastClose = candles[candles.length - 1].close;
    for (const zone of zones) {
      if (zone.type.startsWith('Bu') && lastClose < zone.bottom) zone.broken = true;
      if (zone.type.startsWith('Be') && lastClose > zone.top) zone.broken = true;
    }
  }

  result.zones = zones.filter(z => !z.broken);
  return result;
}

// ============= Volume Channel Flow (VCF) =============

export interface VCFProfileBin {
  price: number;
  volume: number;
}

export interface VCFProfile {
  startTime: number;
  endTime: number;
  startIndex: number;
  endIndex: number;
  top: number;
  bot: number;
  isBear: boolean;
  pocPrice: number;
  pocStartIndex: number;
  bins: VCFProfileBin[];
}

export interface VolumeChannelFlowResult {
  avgLine: { time: number; value: number; color: string }[];
  topLine: { time: number; value: number; color: string }[];
  botLine: { time: number; value: number; color: string }[];
  breakouts: { time: number; price: number; direction: 'up' | 'down' }[];
  profiles: VCFProfile[];
}

export function computeVolumeChannelFlow(
  candles: Candle[],
  channelWidth: number = 3,
  minLength: number = 10
): VolumeChannelFlowResult {
  const result: VolumeChannelFlowResult = {
    avgLine: [],
    topLine: [],
    botLine: [],
    breakouts: [],
    profiles: []
  };

  if (candles.length < 2) return result;

  // Compute ATR 200
  const tr: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }

  const atr: number[] = new Array(candles.length).fill(0);
  let atrSum = 0;
  for (let i = 1; i < candles.length; i++) {
    if (i <= 200) {
      atrSum += tr[i];
      atr[i] = atrSum / i;
    } else {
      atr[i] = (atr[i - 1] * 199 + tr[i]) / 200;
    }
  }

  let top = NaN;
  let bot = NaN;
  let trend = true;
  let count = 0;
  let startIdx = 1;

  const topArr: number[] = new Array(candles.length).fill(NaN);
  const botArr: number[] = new Array(candles.length).fill(NaN);
  const avgArr: number[] = new Array(candles.length).fill(NaN);

  for (let i = 1; i < candles.length; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const currentAtr = atr[i] * channelWidth;

    if (i === 1) {
      top = hl2 + currentAtr;
      bot = hl2 - currentAtr;
    } else {
      if (candles[i].close > top) {
        top = hl2 + currentAtr;
        bot = hl2 - currentAtr;
        trend = true;
      } else if (candles[i].close < bot) {
        top = hl2 + currentAtr;
        bot = hl2 - currentAtr;
        trend = false;
      }
    }

    topArr[i] = top;
    botArr[i] = bot;
    const avg = (top + bot) / 2;
    avgArr[i] = avg;

    const prevAvg = avgArr[i - 1];

    if (i > 1) {
      if (avg === prevAvg) {
        count++;
      } else {
        // Breakout!
        const isUpBreakout = avg > prevAvg;
        result.breakouts.push({
          time: candles[i].time,
          price: isUpBreakout ? botArr[i - 1] : topArr[i - 1],
          direction: isUpBreakout ? 'up' : 'down'
        });

        // Check if we need to build a Volume Profile for the ended segment
        if (count > minLength) {
          buildProfile(candles, startIdx, i - 1, topArr[i - 1], botArr[i - 1], result.profiles);
        }

        // Reset
        startIdx = i;
        count = 0;
      }
    }

    const color = trend ? '#22c55e' : '#ef4444'; // lime/red
    result.avgLine.push({
      time: candles[i].time,
      value: Math.round(avg * 100) / 100,
      color
    });
    result.topLine.push({
      time: candles[i].time,
      value: Math.round(top * 100) / 100,
      color
    });
    result.botLine.push({
      time: candles[i].time,
      value: Math.round(bot * 100) / 100,
      color
    });
  }

  // Handle the active (unfinished) profile at the end
  if (count > minLength) {
    buildProfile(candles, startIdx, candles.length - 1, top, bot, result.profiles);
  }

  return result;
}

function buildProfile(
  candles: Candle[],
  startIdx: number,
  endIdx: number,
  top: number,
  bot: number,
  profiles: VCFProfile[]
) {
  const BINS = 30;
  const step = (top - bot) / BINS;
  if (step <= 0) return;

  const vols = new Array(BINS).fill(0);
  const deltas = new Array(BINS).fill(0);

  for (let k = startIdx; k <= endIdx; k++) {
    const c = candles[k];
    for (let i = 0; i < BINS; i++) {
      const mid = bot + step * i + step / 2;
      if (Math.abs(c.close - mid) <= step) {
        vols[i] += c.volume;
        deltas[i] += c.close > c.open ? c.volume : -c.volume;
      }
    }
  }

  let totalDelta = 0;
  let maxVol = 0;
  let pocIdx = -1;

  for (let i = 0; i < BINS; i++) {
    totalDelta += deltas[i];
    if (vols[i] > maxVol) {
      maxVol = vols[i];
      pocIdx = i;
    }
  }

  const isBear = totalDelta <= 0;
  const pocPrice = pocIdx >= 0 ? bot + step * pocIdx + step / 2 : NaN;

  const maxVisualLength = Math.floor((endIdx - startIdx) / 2);
  const pocStartIndex = maxVol > 0 ? startIdx + Math.floor((vols[pocIdx] / maxVol) * maxVisualLength) + 1 : startIdx;

  const bins: VCFProfileBin[] = [];
  for (let i = 0; i < BINS; i++) {
    bins.push({
      price: bot + step * i + step / 2,
      volume: vols[i]
    });
  }

  profiles.push({
    startTime: candles[startIdx].time,
    endTime: candles[endIdx].time,
    startIndex: startIdx,
    endIndex: endIdx,
    top,
    bot,
    isBear,
    pocPrice,
    pocStartIndex,
    bins
  });
}
