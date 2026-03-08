import { Candle, Timeframe } from '@/types/trading';

// Upstox credential helpers (localStorage)
export function getUpstoxCredentials(): { apiKey: string; accessToken: string } {
  return {
    apiKey: localStorage.getItem('upstox-api-key') || '',
    accessToken: localStorage.getItem('upstox-access-token') || '',
  };
}

export function saveUpstoxCredentials(apiKey: string, accessToken: string) {
  localStorage.setItem('upstox-api-key', apiKey.trim());
  localStorage.setItem('upstox-access-token', accessToken.trim());
}

export interface IndianStock {
  name: string;
  label: string;
  instrumentKey: string;
}

export const INDIAN_STOCKS: IndianStock[] = [
  { name: 'RELIANCE', label: 'Reliance Industries', instrumentKey: 'NSE_EQ|INE002A01018' },
  { name: 'TCS', label: 'Tata Consultancy', instrumentKey: 'NSE_EQ|INE467B01029' },
  { name: 'INFY', label: 'Infosys', instrumentKey: 'NSE_EQ|INE009A01021' },
  { name: 'HDFCBANK', label: 'HDFC Bank', instrumentKey: 'NSE_EQ|INE040A01034' },
  { name: 'ICICIBANK', label: 'ICICI Bank', instrumentKey: 'NSE_EQ|INE090A01021' },
  { name: 'SBIN', label: 'State Bank of India', instrumentKey: 'NSE_EQ|INE062A01020' },
  { name: 'BHARTIARTL', label: 'Bharti Airtel', instrumentKey: 'NSE_EQ|INE397D01024' },
  { name: 'ITC', label: 'ITC Ltd', instrumentKey: 'NSE_EQ|INE154A01025' },
  { name: 'TATAMOTORS', label: 'Tata Motors', instrumentKey: 'NSE_EQ|INE155A01022' },
  { name: 'WIPRO', label: 'Wipro', instrumentKey: 'NSE_EQ|INE075A01022' },
  { name: 'HCLTECH', label: 'HCL Technologies', instrumentKey: 'NSE_EQ|INE860A01027' },
  { name: 'LT', label: 'Larsen & Toubro', instrumentKey: 'NSE_EQ|INE018A01030' },
];

// Map timeframes to Upstox intervals
const UPSTOX_INTERVAL_MAP: Record<string, string> = {
  '1m': '1minute',
  '5m': '5minute',
  '15m': '15minute',
  '1h': '30minute', // Upstox doesn't have 1h, use 30min
  '4h': '30minute', // Closest available
  '1D': 'day',
  '1W': 'week',
};

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function fetchUpstoxCandles(
  instrumentKey: string,
  timeframe: Timeframe,
  limit: number = 500
): Promise<Candle[]> {
  const interval = UPSTOX_INTERVAL_MAP[timeframe] || 'day';
  const toDate = new Date();
  const fromDate = new Date();

  // Calculate from date based on timeframe and limit
  switch (timeframe) {
    case '1m': fromDate.setHours(fromDate.getHours() - Math.ceil(limit / 60)); break;
    case '5m': fromDate.setHours(fromDate.getHours() - Math.ceil(limit * 5 / 60)); break;
    case '15m': fromDate.setDate(fromDate.getDate() - Math.ceil(limit * 15 / 1440)); break;
    case '1h': fromDate.setDate(fromDate.getDate() - Math.ceil(limit / 24)); break;
    case '4h': fromDate.setDate(fromDate.getDate() - Math.ceil(limit * 4 / 24)); break;
    case '1D': fromDate.setDate(fromDate.getDate() - limit); break;
    case '1W': fromDate.setDate(fromDate.getDate() - limit * 7); break;
  }

  const encodedKey = encodeURIComponent(instrumentKey);
  const url = `https://api.upstox.com/v2/historical-candle/${encodedKey}/${interval}/${formatDate(toDate)}/${formatDate(fromDate)}`;

  const { accessToken } = getUpstoxCredentials();

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch(url, { headers });

    if (!res.ok) throw new Error(`Upstox API error: ${res.status}`);
    const json = await res.json();

    if (json.status !== 'success' || !json.data?.candles) {
      throw new Error('Invalid response from Upstox');
    }

    // Upstox candle format: [timestamp, open, high, low, close, volume, oi]
    // Data comes in reverse chronological order
    const candles: Candle[] = json.data.candles
      .map((c: any[]) => ({
        time: Math.floor(new Date(c[0]).getTime() / 1000),
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
      }))
      .reverse();

    return candles;
  } catch (err) {
    console.error('Failed to fetch from Upstox:', err);
    return [];
  }
}

export function getInstrumentKey(symbolName: string): string | undefined {
  const stock = INDIAN_STOCKS.find((s) => s.name === symbolName);
  return stock?.instrumentKey;
}
