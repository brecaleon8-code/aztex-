/** An indicator output aligned 1:1 with the candle series; null where not yet defined (warm-up). */
export type Series = (number | null)[];

/** Simple moving average. Nulls in the input reset the window (keeps chained formulas honest). */
export function sma(values: Series, period: number): Series {
  const p = Math.max(1, Math.floor(period));
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count++;
    if (count > p) {
      sum -= values[i - p] as number;
      count = p;
    }
    if (count === p) out[i] = sum / p;
  }
  return out;
}

/** Exponential moving average, seeded with the SMA of the first `period` valid values. */
export function ema(values: Series, period: number): Series {
  const p = Math.max(1, Math.floor(period));
  const k = 2 / (p + 1);
  const out: Series = new Array(values.length).fill(null);
  let prev: number | null = null;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      prev = null;
      seedSum = 0;
      seedCount = 0;
      continue;
    }
    if (prev == null) {
      seedSum += v;
      seedCount++;
      if (seedCount === p) {
        prev = seedSum / p;
        out[i] = prev;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

export interface BollingerResult {
  middle: Series;
  upper: Series;
  lower: Series;
}

/** Bollinger Bands: SMA middle band ± mult population standard deviations. */
export function bollinger(values: Series, period: number, mult: number): BollingerResult {
  const p = Math.max(1, Math.floor(period));
  const middle = sma(values, p);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const m = middle[i];
    if (m == null) continue;
    let sq = 0;
    for (let j = i - p + 1; j <= i; j++) sq += ((values[j] as number) - m) ** 2;
    const sd = Math.sqrt(sq / p);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { middle, upper, lower };
}

/** RSI with Wilder's smoothing (alpha = 1/period). */
export function rsi(values: number[], period: number): Series {
  const p = Math.max(1, Math.floor(period));
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= p) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= p; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / p;
  let avgLoss = loss / p;
  const calc = () => (avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
  out[p] = calc();
  for (let i = p + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (p - 1) + Math.max(d, 0)) / p;
    avgLoss = (avgLoss * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = calc();
  }
  return out;
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  histogram: Series;
}

/** MACD: EMA(fast) − EMA(slow), signal = EMA(macd, signal), histogram = macd − signal. */
export function macd(values: number[], fast: number, slow: number, signalPeriod: number): MacdResult {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const line: Series = values.map((_, i) => (ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null));
  const signal = ema(line, signalPeriod);
  const histogram: Series = line.map((m, i) => (m != null && signal[i] != null ? m - (signal[i] as number) : null));
  return { macd: line, signal, histogram };
}

/** Min/max over a window of several series, ignoring nulls. */
export function extent(series: Series[], start: number, end: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (let i = Math.max(0, start); i < Math.min(s.length, end); i++) {
      const v = s[i];
      if (v == null || !Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return lo === Infinity ? null : [lo, hi];
}
