import { ScreenerRow } from './screenerService';

export function exportScreenerCSV(data: ScreenerRow[], filename = 'screener-export.csv') {
  const headers = [
    'Symbol', 'Price', '24h Change %', '7d Change %', 'Volume 24h',
    'RSI', 'ADX', 'MACD Histogram', 'Supertrend',
    'EMA 20', 'EMA 50', 'EMA 200', 'SMA 20', 'SMA 50', 'SMA 200',
    'StochRSI K', 'StochRSI D', 'BB Upper', 'BB Lower', 'BB Bandwidth',
    'VWAP', 'ATR', 'Ichimoku Kumo', 'Ichimoku TK',
    'MS Highs', 'MS Lows', 'Pattern',
  ];

  const rows = data.map(r => [
    r.symbol,
    r.price,
    r.change24h.toFixed(2),
    r.change7d.toFixed(2),
    r.volume24h.toFixed(0),
    r.rsi?.toFixed(2) ?? '',
    r.adx?.toFixed(2) ?? '',
    r.macd?.histogram.toFixed(4) ?? '',
    r.supertrend ?? '',
    r.ema20?.toFixed(2) ?? '',
    r.ema50?.toFixed(2) ?? '',
    r.ema200?.toFixed(2) ?? '',
    r.sma20?.toFixed(2) ?? '',
    r.sma50?.toFixed(2) ?? '',
    r.sma200?.toFixed(2) ?? '',
    r.stochRsi?.k.toFixed(2) ?? '',
    r.stochRsi?.d.toFixed(2) ?? '',
    r.bb?.upper.toFixed(2) ?? '',
    r.bb?.lower.toFixed(2) ?? '',
    r.bb?.bandwidth.toFixed(2) ?? '',
    r.vwap?.toFixed(2) ?? '',
    r.atr?.toFixed(2) ?? '',
    r.ichiKumo ?? '',
    r.ichiTk ?? '',
    r.msHighs ?? '',
    r.msLows ?? '',
    r.pattern ?? '',
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
