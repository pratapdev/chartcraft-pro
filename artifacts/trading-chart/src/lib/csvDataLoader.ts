import { Candle } from '@/types/trading';

export interface CsvMeta {
  fileName: string;
  rowCount: number;
  from: number; // unix seconds
  to: number;   // unix seconds
  detectedTimeframe: string;
}

export interface CsvLoadResult {
  candles: Candle[];
  meta: CsvMeta;
}

/**
 * Parse a datetime string into unix seconds.
 * Handles: ISO 8601, "YYYY-MM-DD HH:MM:SS", unix ms, unix s
 */
function parseTimestamp(raw: string): number {
  const trimmed = raw.trim();

  // Pure numeric — could be unix ms or seconds
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    // If > 1e12 it's milliseconds, otherwise seconds
    return n > 1e12 ? Math.floor(n / 1000) : n;
  }

  // Try standard Date parsing (handles ISO 8601 and "YYYY-MM-DD HH:MM:SS")
  const d = new Date(trimmed.replace(' ', 'T'));
  if (!isNaN(d.getTime())) {
    return Math.floor(d.getTime() / 1000);
  }

  throw new Error(`Unparseable timestamp: "${raw}"`);
}

/**
 * Detect the dominant timeframe from the candle intervals.
 */
function detectTimeframe(candles: Candle[]): string {
  if (candles.length < 2) return 'unknown';
  const sample = candles.slice(0, Math.min(20, candles.length - 1));
  const diffs = sample.map((c, i) => candles[i + 1].time - c.time);
  const median = diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)];
  if (median <= 65) return '1m';
  if (median <= 200) return '3m';
  if (median <= 320) return '5m';
  if (median <= 960) return '15m';
  if (median <= 3700) return '1h';
  if (median <= 14500) return '4h';
  return '1D';
}

/**
 * Parse a single CSV row. Columns can be tab or comma separated.
 * Expected columns: datetime, open, high, low, close, volume
 * Optionally: any extra columns after volume are ignored.
 */
function parseRow(line: string, lineNum: number): Candle | null {
  // Support both tab and comma as delimiter
  const sep = line.includes('\t') ? '\t' : ',';
  const parts = line.split(sep).map((p) => p.trim().replace(/^"|"$/g, ''));

  if (parts.length < 6) return null;

  try {
    const time = parseTimestamp(parts[0]);
    const open = parseFloat(parts[1]);
    const high = parseFloat(parts[2]);
    const low = parseFloat(parts[3]);
    const close = parseFloat(parts[4]);
    const volume = parseFloat(parts[5]);

    if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(time)) return null;
    if (high < low) return null; // sanity

    return { time, open, high, low, close, volume: isNaN(volume) ? 0 : volume };
  } catch {
    if (lineNum < 5) return null; // silently skip header rows
    console.warn(`CSV row ${lineNum} parse error:`, line);
    return null;
  }
}

/**
 * Load and parse a CSV file into candles.
 * Uses chunked reading to avoid blocking the UI for large files (300k+ rows).
 *
 * @param file  The File object from an <input type="file"> element
 * @param onProgress  Called periodically with { parsed, total } counts
 */
export async function loadCsvFile(
  file: File,
  onProgress?: (parsed: number, total: number) => void
): Promise<CsvLoadResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/);
        const total = lines.length;
        const candles: Candle[] = [];
        const seenTimes = new Set<number>();

        let headerSkipped = false;
        let progressCounter = 0;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Skip header row (first non-empty line that starts with a letter)
          if (!headerSkipped && /^[a-zA-Z"']/.test(line)) {
            headerSkipped = true;
            continue;
          }
          headerSkipped = true;

          const candle = parseRow(line, i);
          if (!candle) continue;

          // Deduplicate by timestamp
          if (seenTimes.has(candle.time)) continue;
          seenTimes.add(candle.time);
          candles.push(candle);

          progressCounter++;
          if (onProgress && progressCounter % 10000 === 0) {
            onProgress(progressCounter, total);
          }
        }

        if (candles.length === 0) {
          reject(new Error('No valid candle rows found in CSV. Check the file format.'));
          return;
        }

        // Sort ascending by time
        candles.sort((a, b) => a.time - b.time);

        const meta: CsvMeta = {
          fileName: file.name,
          rowCount: candles.length,
          from: candles[0].time,
          to: candles[candles.length - 1].time,
          detectedTimeframe: detectTimeframe(candles),
        };

        resolve({ candles, meta });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file, 'UTF-8');
  });
}

/** Format a unix timestamp as a human-readable date string */
export function formatBarDate(unixSecs: number, tz = 'UTC'): string {
  return new Date(unixSecs * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  });
}

/** Format unix seconds as a short date string (for the slider) */
export function formatShortDate(unixSecs: number): string {
  const d = new Date(unixSecs * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

/**
 * Binary search to find the index in a sorted candles array closest to a given timestamp.
 */
export function findIndexByTimestamp(candles: Candle[], targetTime: number): number {
  let lo = 0, hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time < targetTime) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
