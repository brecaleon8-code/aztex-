/**
 * Footprint (bid × ask volume at price, per bar). Live bars are built from the trade tape: each
 * print is bucketed by candle open-time and by price tick, split by aggressor side. Bars from before
 * the session started have no tape, so they are *estimated* from OHLCV and flagged as such.
 */
import type { Candle, Trade } from '@/types';
import { hashSeed, mulberry32 } from '@/lib/mock/rng';
import { niceStep } from '@/lib/chart/renko';

/** [buy (ask-side aggressor) volume, sell (bid-side aggressor) volume] */
export type Cell = [number, number];
/** tick index → cell, for one bar */
export type RawBar = Record<number, Cell>;
export type RawFootprint = Record<number, RawBar>;

/** Fine bucket for accumulation (~1 bp of price); display rows are whole multiples of it. */
export function footprintTick(price: number): number {
  return niceStep(Math.abs(price) * 1e-4) || 1e-8;
}

/** Returns a new object; only the bars touched by `trades` are copied. */
export function accumulateTrades(fp: RawFootprint, trades: Trade[], tfMs: number, tick: number): RawFootprint {
  if (!trades.length) return fp;
  const out: RawFootprint = { ...fp };
  const touched = new Set<number>();
  for (const t of trades) {
    const bar = Math.floor(t.time / tfMs) * tfMs;
    if (!touched.has(bar)) {
      out[bar] = { ...(fp[bar] ?? {}) };
      touched.add(bar);
    }
    const k = Math.floor(t.price / tick + 1e-9);
    const prev = out[bar][k] ?? [0, 0];
    out[bar][k] = t.side === 'buy' ? [prev[0] + t.size, prev[1]] : [prev[0], prev[1] + t.size];
  }
  return out;
}

const ROW_MULTS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10_000, 20_000, 25_000, 50_000, 100_000];

/** Smallest "nice" whole multiple of `tick` (1, 2, 5, 10, 20, 25, 50 … ticks) that is ≥ `target`. */
export function rowSizeFor(tick: number, target: number): number {
  for (const m of ROW_MULTS) if (m * tick >= target) return m * tick;
  return ROW_MULTS[ROW_MULTS.length - 1] * tick;
}

export interface FootprintRows {
  /** row index (floor(price / rowSize)) → cell */
  rows: Record<number, Cell>;
  total: number;
  delta: number;
  /** row index of the point of control (most traded row). */
  poc: number | null;
  maxCell: number;
}

export function summarize(rows: Record<number, Cell>): FootprintRows {
  let total = 0;
  let delta = 0;
  let poc: number | null = null;
  let best = -1;
  let maxCell = 0;
  for (const [k, [b, s]] of Object.entries(rows)) {
    const v = b + s;
    total += v;
    delta += b - s;
    if (v > best) {
      best = v;
      poc = +k;
    }
    maxCell = Math.max(maxCell, b, s);
  }
  return { rows, total, delta, poc, maxCell };
}

/** Re-bucket a live bar (tick buckets) into display rows. */
export function rebin(raw: RawBar, tick: number, rowSize: number): FootprintRows {
  const k = Math.max(1, Math.round(rowSize / tick));
  const rows: Record<number, Cell> = {};
  for (const [key, [b, s]] of Object.entries(raw)) {
    const r = Math.floor(+key / k);
    const prev = rows[r] ?? [0, 0];
    rows[r] = [prev[0] + b, prev[1] + s];
  }
  return summarize(rows);
}

/**
 * Model a bar's footprint from OHLCV alone (no tape): volume concentrates around the body, and the
 * buy share leans with the bar's direction and with where in the range each row sits. Deterministic
 * per bar so it doesn't flicker. This is an estimate and must be labelled as one.
 */
export function estimateBar(c: Candle, rowSize: number): FootprintRows {
  const lo = Math.floor(c.low / rowSize + 1e-9);
  const hi = Math.floor(c.high / rowSize + 1e-9);
  const range = Math.max(c.high - c.low, rowSize);
  const mid = (c.open + c.close) / 2;
  const dir = Math.sign(c.close - c.open);
  const body = (c.close - c.open) / range;
  const r = mulberry32(hashSeed(`fp:${c.time}:${rowSize}`));
  const weights: number[] = [];
  for (let k = lo; k <= hi; k++) {
    const p = (k + 0.5) * rowSize;
    const z = (p - mid) / (range * 0.38);
    weights.push((0.3 + Math.exp(-z * z)) * (0.75 + r() * 0.5));
  }
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const rows: Record<number, Cell> = {};
  weights.forEach((w, i) => {
    const k = lo + i;
    const p = (k + 0.5) * rowSize;
    const pos = (p - mid) / range; // −0.5 … 0.5
    const share = Math.min(0.92, Math.max(0.08, 0.5 + body * 0.35 + pos * dir * 0.3 + (r() - 0.5) * 0.16));
    const v = (c.volume * w) / sum;
    rows[k] = [v * share, v * (1 - share)];
  });
  return summarize(rows);
}

/**
 * Diagonal imbalances, as on most footprint tools: buy volume at a row vs sell volume one row below
 * (and sell vs the buy one row above) beyond `ratio`. Returns row indexes.
 */
export function imbalances(rows: Record<number, Cell>, ratio = 3, minVol = 0): { buy: Set<number>; sell: Set<number> } {
  const buy = new Set<number>();
  const sell = new Set<number>();
  for (const key of Object.keys(rows)) {
    const k = +key;
    const [b, s] = rows[k];
    const below = rows[k - 1]?.[1] ?? 0;
    const above = rows[k + 1]?.[0] ?? 0;
    if (b > minVol && b >= ratio * Math.max(below, 1e-12) && below > 0) buy.add(k);
    if (s > minVol && s >= ratio * Math.max(above, 1e-12) && above > 0) sell.add(k);
  }
  return { buy, sell };
}
