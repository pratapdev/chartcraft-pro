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
