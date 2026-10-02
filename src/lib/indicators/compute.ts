import type { Candle, IndicatorInstance } from '@/types';
import { compile, evaluate } from './formula';
import { bollinger, ema, macd, rsi, sma, type Series } from './series';

export interface ComputedLine {
  key: string;
  values: Series;
  color: string;
  dashed?: boolean;
  width?: number;
  opacity?: number;
}

export interface ComputedIndicator {
  instance: IndicatorInstance;
  lines: ComputedLine[];
  /** Histogram bars (MACD histogram, volume). */
  bars?: { values: Series; colors: (string | null)[] };
  /** Fill between two lines (Bollinger). */
  band?: { upper: Series; lower: Series };
  /** Fixed horizontal guides (RSI 30/70). */
  guides?: number[];
  /** Fixed y domain for bounded oscillators. */
  domain?: [number, number];
  error?: string;
}

export function indicatorLabel(i: IndicatorInstance): string {
  switch (i.kind) {
    case 'sma':
      return `SMA ${i.period}`;
    case 'ema':
      return `EMA ${i.period}`;
    case 'bollinger':
      return `BB ${i.period}, ${i.mult}`;
    case 'rsi':
      return `RSI ${i.period}`;
    case 'macd':
      return `MACD ${i.fast}, ${i.slow}, ${i.signal}`;
    case 'volume':
      return 'Volume';
    case 'custom':
      return i.name || 'Custom';
  }
}

/**
 * Indicators are always computed on the FULL real-OHLC history (never the visible slice, never
 * Heikin-Ashi) so values stay accurate right up to the left edge of whatever window is shown.
 */
export function computeIndicator(i: IndicatorInstance, candles: Candle[], colors: { bull: string; bear: string }): ComputedIndicator {
  const close = candles.map((c) => c.close);
  switch (i.kind) {
    case 'sma':
      return { instance: i, lines: [{ key: 'sma', values: sma(close, i.period ?? 20), color: i.color }] };
    case 'ema':
      return { instance: i, lines: [{ key: 'ema', values: ema(close, i.period ?? 21), color: i.color }] };
    case 'bollinger': {
      const b = bollinger(close, i.period ?? 20, i.mult ?? 2);
      return {
        instance: i,
        band: { upper: b.upper, lower: b.lower },
        lines: [
          { key: 'mid', values: b.middle, color: i.color, dashed: true, opacity: 0.8 },
          { key: 'up', values: b.upper, color: i.color, opacity: 0.9 },
          { key: 'lo', values: b.lower, color: i.color, opacity: 0.9 },
        ],
      };
    }
    case 'rsi':
      return { instance: i, lines: [{ key: 'rsi', values: rsi(close, i.period ?? 14), color: i.color }], guides: [30, 70], domain: [0, 100] };
    case 'macd': {
      const m = macd(close, i.fast ?? 12, i.slow ?? 26, i.signal ?? 9);
      return {
        instance: i,
        lines: [
          { key: 'macd', values: m.macd, color: i.color },
          { key: 'signal', values: m.signal, color: '#F5B84B', opacity: 0.9 },
        ],
        bars: { values: m.histogram, colors: m.histogram.map((h) => (h == null ? null : h >= 0 ? colors.bull : colors.bear)) },
        guides: [0],
      };
    }
    case 'volume':
      return {
        instance: i,
        lines: [],
        bars: { values: candles.map((c) => c.volume), colors: candles.map((c) => (c.close >= c.open ? colors.bull : colors.bear)) },
      };
    case 'custom': {
      const r = compile(i.formula ?? '');
      if (!r.ok) return { instance: i, lines: [], error: r.error };
      return { instance: i, lines: [{ key: 'custom', values: evaluate(r.ast, candles), color: i.color }] };
    }
  }
}
