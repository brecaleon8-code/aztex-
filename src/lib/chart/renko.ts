import type { Candle } from '@/types';

/** Round a positive step to 1 / 2 / 2.5 / 5 × 10^k — box sizes and footprint ticks people expect. */
export function niceStep(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  const nice = m < 1.5 ? 1 : m < 2.25 ? 2 : m < 3.5 ? 2.5 : m < 7.5 ? 5 : 10;
  return +(nice * p).toPrecision(6);
}

/** ATR(period) of the series (Wilder smoothing), rounded to a nice box size. */
export function atrBox(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  let atr: number | null = null;
  let seed = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1].close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    if (i <= period) {
      seed += tr;
      if (i === period) atr = seed / period;
    } else atr = ((atr as number) * (period - 1) + tr) / period;
  }
  return niceStep(atr ?? seed / (candles.length - 1));
}

export interface RenkoResult {
  bricks: Candle[];
  box: number;
  /** Close at or beyond these prints the next brick up / down (traditional 2-box reversal). */
  nextUp: number | null;
  nextDown: number | null;
}

/**
 * Traditional close-based Renko. A brick prints when the close moves a full box beyond the last
 * brick; reversals therefore need two boxes. Bricks sit on a fixed price grid anchored at the first
 * close. With `wicks`, the first brick formed after a pause shows how far price travelled against it
 * meanwhile. Each brick carries the time and the volume of the candles that built it.
 */
export function renko(candles: Candle[], box: number, wicks = true): RenkoResult {
  if (!(box > 0) || candles.length === 0) return { bricks: [], box, nextUp: null, nextDown: null };
  const snap = (v: number) => +v.toPrecision(12);
  const base = snap(Math.floor(candles[0].close / box) * box);
  let hi = base;
  let lo = base;
  let wHi = candles[0].high;
  let wLo = candles[0].low;
  let vol = 0;
  const bricks: Candle[] = [];

  for (const c of candles) {
    wHi = Math.max(wHi, c.high);
    wLo = Math.min(wLo, c.low);
    vol += c.volume;
    const made: Candle[] = [];
    while (c.close >= hi + box - 1e-9 * box) {
      const o = hi;
      const cl = snap(hi + box);
      made.push({ time: c.time, open: o, close: cl, high: cl, low: wicks && made.length === 0 ? Math.min(o, wLo) : o, volume: 0 });
      lo = o;
      hi = cl;
    }
    while (c.close <= lo - box + 1e-9 * box) {
      const o = lo;
      const cl = snap(lo - box);
      made.push({ time: c.time, open: o, close: cl, low: cl, high: wicks && made.length === 0 ? Math.max(o, wHi) : o, volume: 0 });
      hi = o;
      lo = cl;
    }
    if (made.length) {
      for (const b of made) b.volume = vol / made.length;
      bricks.push(...made);
      vol = 0;
      wHi = c.close;
      wLo = c.close;
    }
  }
  return { bricks, box, nextUp: snap(hi + box), nextDown: snap(lo - box) };
}
