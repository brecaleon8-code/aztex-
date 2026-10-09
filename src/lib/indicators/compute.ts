import type { Candle, IndicatorInstance, PriceSource } from '@/types';
import { compile, evaluate } from './formula';
import { bollinger, ema, macd, rsi, sma, type Series } from './series';
import { cvd, vwap } from '@/lib/orderflow/orderflow';
import type { ScriptResult } from '@/lib/script/engine';

/** A finished sandbox run plus the first candle time it was computed on (for re-alignment). */
export interface ScriptRun {
  result: ScriptResult;
  t0: number;
}
const SCRIPT_PALETTE = ['#7FA7CF', '#B39CDB', '#D2AE72', '#DDA1BC', '#93A8BF', '#CFD3D8'];

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
  /** Script result not available yet (first run in flight). */
  pending?: boolean;
}

/** Price series an indicator reads (close by default). */
export function sourceSeries(candles: Candle[], src: PriceSource = 'close'): number[] {
  switch (src) {
    case 'open':
      return candles.map((c) => c.open);
    case 'high':
      return candles.map((c) => c.high);
    case 'low':
      return candles.map((c) => c.low);
    case 'hl2':
      return candles.map((c) => (c.high + c.low) / 2);
    case 'hlc3':
      return candles.map((c) => (c.high + c.low + c.close) / 3);
    case 'ohlc4':
      return candles.map((c) => (c.open + c.high + c.low + c.close) / 4);
    default:
      return candles.map((c) => c.close);
  }
}

export function indicatorLabel(i: IndicatorInstance): string {
  const src = i.source && i.source !== 'close' ? ` · ${i.source}` : '';
  switch (i.kind) {
    case 'sma':
      return `SMA ${i.period}${src}`;
    case 'ema':
      return `EMA ${i.period}${src}`;
    case 'bollinger':
      return `BB ${i.period}, ${i.mult}${src}`;
    case 'rsi':
      return `RSI ${i.period}${src}`;
    case 'macd':
      return `MACD ${i.fast}, ${i.slow}, ${i.signal}`;
    case 'volume':
      return 'Volume';
    case 'vwap':
      return 'VWAP (session)';
    case 'cvd':
      return 'CVD';
    case 'custom':
      return i.name || 'Custom';
    case 'script':
      return i.name || 'Script';
  }
}

/**
 * Indicators are always computed on the FULL real-OHLC history (never the visible slice, never
 * Heikin-Ashi) so values stay accurate right up to the left edge of whatever window is shown.
 */
export function computeIndicator(i: IndicatorInstance, candles: Candle[], colors: { bull: string; bear: string }, realDelta: Record<number, number> = {}, scriptRun?: ScriptRun): ComputedIndicator {
  const src = sourceSeries(candles, i.source);
  const w = i.width;
  switch (i.kind) {
    case 'sma':
      return { instance: i, lines: [{ key: 'sma', values: sma(src, i.period ?? 20), color: i.color, width: w }] };
    case 'ema':
      return { instance: i, lines: [{ key: 'ema', values: ema(src, i.period ?? 21), color: i.color, width: w }] };
    case 'bollinger': {
      const b = bollinger(src, i.period ?? 20, i.mult ?? 2);
      return {
        instance: i,
        band: { upper: b.upper, lower: b.lower },
        lines: [
          { key: 'mid', values: b.middle, color: i.color, dashed: true, opacity: 0.8, width: w },
          { key: 'up', values: b.upper, color: i.color, opacity: 0.9, width: w },
          { key: 'lo', values: b.lower, color: i.color, opacity: 0.9, width: w },
        ],
      };
    }
    case 'rsi':
      return { instance: i, lines: [{ key: 'rsi', values: rsi(src, i.period ?? 14), color: i.color, width: w }], guides: i.levels ? [...i.levels].sort((a, b) => a - b) : [30, 70], domain: [0, 100] };
    case 'macd': {
      const m = macd(src, i.fast ?? 12, i.slow ?? 26, i.signal ?? 9);
      return {
        instance: i,
        lines: [
          { key: 'macd', values: m.macd, color: i.color, width: w },
          { key: 'signal', values: m.signal, color: '#D2AE72', opacity: 0.9 },
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
    case 'vwap':
      return { instance: i, lines: [{ key: 'vwap', values: vwap(candles), color: i.color, width: w ?? 1.4 }] };
    case 'cvd':
      return { instance: i, lines: [{ key: 'cvd', values: cvd(candles, realDelta), color: i.color, width: w }], guides: [0] };
    case 'custom': {
      const r = compile(i.formula ?? '');
      if (!r.ok) return { instance: i, lines: [], error: r.error };
      return { instance: i, lines: [{ key: 'custom', values: evaluate(r.ast, candles), color: i.color, width: w }] };
    }
    case 'script':
      return fromScript(i, candles, colors, scriptRun);
  }
}

/** Map a sandbox result onto the current candle array (it may have scrolled or grown since the run). */
function fromScript(i: IndicatorInstance, candles: Candle[], colors: { bull: string; bear: string }, run?: ScriptRun): ComputedIndicator {
  if (!run) return { instance: i, lines: [], pending: true };
  const r = run.result;
  if (!r.ok) return { instance: i, lines: [], error: r.line ? `${r.error} (line ${r.line})` : r.error };
  const off = candles.findIndex((c) => c.time === run.t0);
  if (off < 0 && candles.length && candles[0].time !== run.t0) return { instance: i, lines: [], pending: true };
  const align = (v: (number | null)[]): Series => candles.map((_, k) => v[k - off] ?? null);
  const lines: ComputedLine[] = [];
  let bars: ComputedIndicator['bars'];
  r.plots.forEach((p, k) => {
    const color = p.color ?? (k === 0 ? i.color : SCRIPT_PALETTE[(k - 1) % SCRIPT_PALETTE.length]);
    const values = align(p.values);
    if (p.style === 'histogram' && i.type === 'oscillator' && !bars) {
      bars = { values, colors: values.map((v) => (v == null ? null : p.color ? p.color : v >= 0 ? colors.bull : colors.bear)) };
    } else {
      lines.push({ key: `p${k}`, values, color, dashed: p.style === 'dashed', opacity: p.style === 'dashed' ? 0.85 : 1, width: i.width });
    }
  });
  return { instance: i, lines, bars, guides: r.hlines.length ? r.hlines.map((h) => h.value) : undefined };
}
