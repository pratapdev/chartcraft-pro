import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Section {
  title: string;
  icon: string;
  color: string;
  items: { name: string; how: string; tip: string }[];
}

const GUIDE_SECTIONS: Section[] = [
  {
    title: 'Pattern Detection',
    icon: '📐',
    color: 'text-yellow-400',
    items: [
      {
        name: 'Triangles (Ascending / Descending / Symmetrical)',
        how: 'Add → Smart Money → "Pattern Detection". The overlay auto-scans swing pivots and draws converging trendlines. An apex dot marks the expected breakout point.',
        tip: 'Ascending triangles (flat top, rising bottom) are bullish; descending are bearish; symmetrical need confirmation.',
      },
      {
        name: 'Wedges (Rising / Falling)',
        how: 'Same "Pattern Detection" indicator. Rising wedges form when both trendlines slope upward but the lower one is steeper — bearish. Falling wedges are the inverse.',
        tip: 'The shaded fill color tells you the bias: green = bullish breakout expected, red = bearish, yellow = neutral.',
      },
      {
        name: 'Channels (Ascending / Descending)',
        how: 'Parallel trendlines auto-detected. Label badge shows the pattern name and a strength bar below it.',
        tip: 'Adjust "Pivot Length" in settings (gear icon) — shorter = more sensitive, longer = only major structures.',
      },
    ],
  },
  {
    title: 'Anchored VWAP & Session VWAP',
    icon: '⚓',
    color: 'text-purple-400',
    items: [
      {
        name: 'Anchored VWAP (AVWAP)',
        how: 'Add → Smart Money → "Anchored VWAP". The indicator starts accumulating volume-weighted average price from the first visible candle. Use the gear icon to paste a custom anchor timestamp (Unix seconds) — e.g. anchor to an earnings gap, a major high/low, or a session open.',
        tip: 'Price above AVWAP = accumulation bias. Price below = distribution. The ±1σ and ±2σ bands act as dynamic support/resistance.',
      },
      {
        name: 'Session VWAP (Daily Reset)',
        how: 'Add → Smart Money → "Session VWAP". Resets every UTC day. Ideal for intraday timeframes (1m–15m). Bands show the day\'s standard deviation spread.',
        tip: 'On 1h–4h charts, combine Session VWAP with Market Structure BOS/CHOCH labels for confluence entries.',
      },
      {
        name: 'Show / Hide Bands',
        how: 'Click the gear icon on the AVWAP or Session VWAP row in the indicators list. Toggle "Show Bands" to hide or show ±1σ/±2σ envelopes.',
        tip: 'Disable bands for a cleaner chart; enable them when looking for mean-reversion setups.',
      },
    ],
  },
  {
    title: 'Supply & Demand Zones',
    icon: '🏛️',
    color: 'text-orange-400',
    items: [
      {
        name: 'Auto Supply Zones (red)',
        how: 'Add → Smart Money → "Supply & Demand". Supply zones appear at swing highs where price rejected sharply downward. The zone height is ATR-based.',
        tip: 'Brighter fill = stronger zone (price moved further away). A ◇ tag means price has since retested the zone. An ✗ tag means the zone is broken.',
      },
      {
        name: 'Auto Demand Zones (green)',
        how: 'Same indicator. Demand zones form at swing lows where price bounced sharply upward.',
        tip: 'Broken zones (✗) often flip — former support becomes resistance and vice versa. Watch for reactions on retests.',
      },
      {
        name: 'Settings: Pivot Length, ATR Multiplier, Strength',
        how: 'Gear icon → adjust Pivot Length (larger = fewer, more significant zones), Zone Height ATR× (zone thickness), and Min Strength (0–1 slider, higher = only high-conviction zones).',
        tip: 'On 1h+ timeframes, use Strength ≥ 0.6 to filter for only the cleanest S/D zones.',
      },
    ],
  },
  {
    title: 'Multi-Timeframe Overlays (HTF)',
    icon: '🔭',
    color: 'text-blue-400',
    items: [
      {
        name: 'Enabling HTF Overlay',
        how: 'Click the Layers icon (stack icon) on the left toolbar to open the HTF Overlay panel. Toggle individual timeframe layers on/off.',
        tip: 'With "Auto Mode" on, the app automatically selects two higher timeframes based on your current chart interval (e.g. 1h chart → shows 4h and 1D).',
      },
      {
        name: 'Display Modes',
        how: 'Each layer can show: Candles (mini HTF candles overlaid), Zones (high–low range fill), or High/Low lines (horizontal dashed lines at HTF extremes).',
        tip: '"Zones" mode is the least intrusive and great for seeing HTF context without cluttering the chart.',
      },
      {
        name: 'Trend Alignment Highlighting',
        how: 'Enable "Trend Align" in the HTF panel. When your current timeframe trend matches the HTF trend, candles/zones are highlighted brighter. Conflicting trends show a yellow dashed warning border.',
        tip: 'Only take trades in the direction where current + HTF trends are aligned for higher probability setups.',
      },
    ],
  },
  {
    title: 'Smart Money Concepts (FVG & Market Structure)',
    icon: '🧠',
    color: 'text-emerald-400',
    items: [
      {
        name: 'Fair Value Gaps (FVG)',
        how: 'Add → Smart Money → "Fair Value Gap". Green zones = bullish FVGs (price gap upward); Red zones = bearish FVGs. Active zones extend to the right edge until price fills them.',
        tip: 'Enable "Show Mitigated" in settings to see filled zones (faded). Watch for price returning to fill a gap — this is a common entry trigger.',
      },
      {
        name: 'BOS / CHOCH (Market Structure)',
        how: 'Add → Smart Money → "Market Structure". BOS (Break of Structure) dashed lines show when price breaks a prior swing. CHOCH (Change of Character) in purple signals a potential trend reversal.',
        tip: 'A CHOCH after a series of BOS signals is the classic smart money reversal setup. Combine with FVG entry zones.',
      },
      {
        name: 'Liquidity Sweeps (⚡)',
        how: 'Lightning bolt markers appear when price wicks through a swing high/low and immediately reverses — a "stop hunt". Enable/disable via Market Structure settings.',
        tip: 'A sweep followed by a CHOCH is one of the strongest entry signals in smart money trading.',
      },
    ],
  },
  {
    title: 'Delta Divergence',
    icon: '📊',
    color: 'text-amber-400',
    items: [
      {
        name: 'What it shows',
        how: 'Add → Smart Money → "Delta Divergence". A sub-pane plots a per-bar delta proxy: (close−open)/(high−low) × volume. Gold histogram bars highlight confirmed pivots; red/green lines connect divergent pivot pairs on price.',
        tip: 'Bearish divergence = price prints a Higher High while delta prints a Lower High (weakening buyers). Bullish = price Lower Low + delta Higher Low (weakening sellers).',
      },
      {
        name: 'How to read signals',
        how: 'Red lines on the price chart connect two highs where price rose but delta fell — potential reversal down. Green lines connect two lows where price fell but delta rose — potential reversal up. Up/down arrow markers show the delta value at each pivot.',
        tip: 'Wait for a confirmation candle after the second pivot before entering. Combine with FVG, Supply/Demand, or CHOCH for higher-probability reversals.',
      },
      {
        name: 'Settings (gear icon)',
        how: 'Pivot Left = bars to the left required to qualify a pivot (default 5). Pivot Right = bars to the right required to confirm (default 5, signal lags by this many bars). Min Delta Diff = minimum absolute delta separation between two pivots to count as a divergence.',
        tip: 'Increase Pivot Left/Right on higher timeframes (e.g. 8/8 on 4h) for fewer, cleaner signals. Raise Min Delta Diff to filter out weak divergences in low-volume periods.',
      },
    ],
  },
  {
    title: 'Fibonacci & Drawing Tools',
    icon: '📏',
    color: 'text-cyan-400',
    items: [
      {
        name: 'Manual Fibonacci Retracement',
        how: 'Select the Fibonacci tool from the left toolbar (Φ icon). Click the swing low, then drag to the swing high (or vice versa). Key levels (0.236, 0.382, 0.5, 0.618, 0.786) are drawn automatically.',
        tip: 'The 0.618 "golden ratio" level combined with a demand zone or FVG is a high-confluence entry point.',
      },
      {
        name: 'Trendlines & Horizontal Levels',
        how: 'Use the trendline or horizontal line tools from the left toolbar. Right-click any line to set a price alert on it.',
        tip: 'Press Delete or Backspace to remove a selected line. Ctrl+Z undoes the last deletion.',
      },
    ],
  },
];

interface GuideItemProps {
  item: { name: string; how: string; tip: string };
}

const GuideItem: React.FC<GuideItemProps> = ({ item }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/40 rounded mb-1 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-2 text-left hover:bg-accent/40 transition-colors"
      >
        <span className="text-[11px] font-medium text-foreground">{item.name}</span>
        {open
          ? <ChevronDown size={10} className="text-muted-foreground shrink-0" />
          : <ChevronRight size={10} className="text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-border/30 bg-black/10">
          <div className="mt-2">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">How to use</p>
            <p className="text-[10px] text-foreground/80 leading-relaxed">{item.how}</p>
          </div>
          <div className="rounded bg-primary/8 border border-primary/20 px-2 py-1.5">
            <p className="text-[9px] font-semibold text-primary/70 uppercase tracking-wide mb-0.5">Pro tip</p>
            <p className="text-[10px] text-foreground/70 leading-relaxed">{item.tip}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export const FeatureGuide: React.FC = () => {
  const [openSection, setOpenSection] = useState<string | null>('Pattern Detection');

  return (
    <div className="space-y-1.5">
      <div className="px-1 pb-1">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Advanced features guide — click any section to expand.
        </p>
      </div>
      {GUIDE_SECTIONS.map((section) => (
        <div key={section.title} className="panel-section rounded overflow-hidden">
          <button
            onClick={() => setOpenSection(openSection === section.title ? null : section.title)}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-accent/30 transition-colors"
          >
            <span className="text-base leading-none">{section.icon}</span>
            <span className={`text-[11px] font-semibold flex-1 ${section.color}`}>{section.title}</span>
            <span className="text-[9px] text-muted-foreground">{section.items.length} topics</span>
            {openSection === section.title
              ? <ChevronDown size={11} className="text-muted-foreground shrink-0" />
              : <ChevronRight size={11} className="text-muted-foreground shrink-0" />}
          </button>
          {openSection === section.title && (
            <div className="px-2 pb-2 border-t border-border/30">
              <div className="mt-2 space-y-0.5">
                {section.items.map((item) => (
                  <GuideItem key={item.name} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
