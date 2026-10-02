/** Order-flow analytics: pure functions over candles / trades so they're unit-testable. */
import type { Candle, Trade } from '@/types';
import type { Series } from '@/lib/indicators/series';

export interface ProfileBin {
  lo: number;
  hi: number;
  volume: number;
}
export interface VolumeProfile {
  bins: ProfileBin[];
  /** Index of the point of control (highest-volume bin). */
  poc: number;
  /** Value area: bin index range holding `vaPct` of volume around the POC. */
  vaLo: number;
  vaHi: number;
  max: number;
}

/**
 * Volume-by-price over a window. Each candle's volume is spread uniformly over its high–low
 * range (the standard approximation without tick data). Value area grows outward from the POC,
 * always taking the larger neighbour, until it holds `vaPct` of total volume.
 */
export function volumeProfile(candles: Candle[], start: number, end: number, nBins = 48, vaPct = 0.7): VolumeProfile | null {
  const win = candles.slice(Math.max(0, start), Math.min(candles.length, end));
  if (win.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of win) {
    lo = Math.min(lo, c.low);
    hi = Math.max(hi, c.high);
  }
  if (!(hi > lo)) hi = lo + Math.abs(lo) * 1e-6 + 1e-9;
  const step = (hi - lo) / nBins;
  const bins: ProfileBin[] = Array.from({ length: nBins }, (_, i) => ({ lo: lo + i * step, hi: lo + (i + 1) * step, volume: 0 }));
  for (const c of win) {
    const range = c.high - c.low;
    if (range <= 0) {
      bins[Math.min(nBins - 1, Math.floor((c.close - lo) / step))].volume += c.volume;
      continue;
    }
    const b0 = Math.max(0, Math.floor((c.low - lo) / step));
    const b1 = Math.min(nBins - 1, Math.floor((c.high - lo) / step));
    for (let b = b0; b <= b1; b++) {
      const overlap = Math.min(c.high, bins[b].hi) - Math.max(c.low, bins[b].lo);
      if (overlap > 0) bins[b].volume += (c.volume * overlap) / range;
    }
  }
  let poc = 0;
  for (let i = 1; i < nBins; i++) if (bins[i].volume > bins[poc].volume) poc = i;
  const total = bins.reduce((s, b) => s + b.volume, 0);
  let vaLo = poc;
  let vaHi = poc;
  let acc = bins[poc].volume;
  while (acc < total * vaPct && (vaLo > 0 || vaHi < nBins - 1)) {
    const down = vaLo > 0 ? bins[vaLo - 1].volume : -1;
    const up = vaHi < nBins - 1 ? bins[vaHi + 1].volume : -1;
    if (up >= down) acc += bins[++vaHi].volume;
    else acc += bins[--vaLo].volume;
  }
  return { bins, poc, vaLo, vaHi, max: bins[poc].volume };
}

/** Bar-level delta estimate when tick data isn't available: volume × body / range. */
export function approxDelta(c: Candle): number {
  const range = c.high - c.low;
  if (range <= 0) return 0;
  return Math.max(-c.volume, Math.min(c.volume, (c.volume * (c.close - c.open)) / range));
}

/**
 * Cumulative volume delta. Uses real aggressor-side delta for bars we observed on the tape
 * (`realDelta`, keyed by candle open time), otherwise the bar approximation.
 */
export function cvd(candles: Candle[], realDelta: Record<number, number> = {}): Series {
  let acc = 0;
  return candles.map((c) => (acc += realDelta[c.time] ?? approxDelta(c)));
}

/** VWAP anchored at each UTC period boundary (default: daily session). */
export function vwap(candles: Candle[], anchorMs = 86_400_000): Series {
  let pv = 0;
  let v = 0;
  let anchor = -1;
  return candles.map((c) => {
    const a = Math.floor(c.time / anchorMs);
    if (a !== anchor) {
      anchor = a;
      pv = 0;
      v = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    v += c.volume;
    return v > 0 ? pv / v : null;
  });
}

export interface FlowStats {
  buyVol: number;
  sellVol: number;
  delta: number;
  buyPct: number;
  tradesPerSec: number;
  largest: Trade | null;
  vwap: number | null;
}

/** Aggressor statistics over the trailing window. */
export function flowStats(trades: Trade[], now: number, windowMs = 60_000): FlowStats {
  let buyVol = 0;
  let sellVol = 0;
  let count = 0;
  let pv = 0;
  let largest: Trade | null = null;
  for (const t of trades) {
    if (now - t.time > windowMs) continue;
    count++;
    pv += t.price * t.size;
    if (t.side === 'buy') buyVol += t.size;
    else sellVol += t.size;
    if (!largest || t.size * t.price > largest.size * largest.price) largest = t;
  }
  const total = buyVol + sellVol;
  return { buyVol, sellVol, delta: buyVol - sellVol, buyPct: total ? (buyVol / total) * 100 : 50, tradesPerSec: count / (windowMs / 1000), largest, vwap: total ? pv / total : null };
}

/** Notional threshold above which a print counts as "large": the q-quantile of recent notionals. */
export function largePrintThreshold(trades: Trade[], q = 0.95): number {
  if (trades.length < 10) return Infinity;
  const n = trades.map((t) => t.price * t.size).sort((a, b) => a - b);
  return n[Math.min(n.length - 1, Math.floor(n.length * q))];
}
