import type { Candle, Trade } from '@/types';
import { approxDelta, cvd, flowStats, largePrintThreshold, volumeProfile, vwap } from './orderflow';

const c = (time: number, open: number, high: number, low: number, close: number, volume: number): Candle => ({ time, open, high, low, close, volume });

describe('volume profile', () => {
  it('spreads volume over each bar range and finds the POC', () => {
    const p = volumeProfile([c(0, 10, 12, 10, 11, 100), c(1, 11, 11.5, 10.5, 11, 300)], 0, 2, 4)!;
    expect(p.bins).toHaveLength(4);
    expect(p.bins.reduce((s, b) => s + b.volume, 0)).toBeCloseTo(400);
    // Second bar's 300 lands in 10.5–11.5 → bins 1 and 2 dominate.
    expect([1, 2]).toContain(p.poc);
  });
  it('value area holds ≥70% of volume and contains the POC', () => {
    const bars = Array.from({ length: 50 }, (_, i) => c(i, 100 + Math.sin(i) * 3, 104 + Math.sin(i) * 3, 97 + Math.sin(i) * 3, 101, 10 + (i % 7)));
    const p = volumeProfile(bars, 0, 50, 30)!;
    const total = p.bins.reduce((s, b) => s + b.volume, 0);
    const va = p.bins.slice(p.vaLo, p.vaHi + 1).reduce((s, b) => s + b.volume, 0);
    expect(va / total).toBeGreaterThanOrEqual(0.7);
    expect(p.poc).toBeGreaterThanOrEqual(p.vaLo);
    expect(p.poc).toBeLessThanOrEqual(p.vaHi);
  });
  it('returns null for an empty window', () => {
    expect(volumeProfile([], 0, 0)).toBeNull();
  });
});

describe('delta / CVD / VWAP', () => {
  it('approximates bar delta from body/range, bounded by volume', () => {
    expect(approxDelta(c(0, 10, 12, 10, 12, 50))).toBe(50);
    expect(approxDelta(c(0, 11, 12, 10, 10, 40))).toBe(-20);
    expect(approxDelta(c(0, 10, 10, 10, 10, 40))).toBe(0);
  });
  it('CVD prefers real tape delta where observed', () => {
    const bars = [c(0, 10, 12, 10, 12, 50), c(60, 12, 12, 10, 10, 50)];
    expect(cvd(bars)).toEqual([50, 0]);
    expect(cvd(bars, { 60: 30 })).toEqual([50, 80]);
  });
  it('VWAP resets at the anchor boundary', () => {
    const day = 86_400_000;
    const v = vwap([c(0, 0, 12, 6, 9, 1), c(1000, 0, 21, 15, 18, 2), c(day, 0, 3, 3, 3, 5)]);
    expect(v[0]).toBe(9);
    expect(v[1]).toBe((9 * 1 + 18 * 2) / 3);
    expect(v[2]).toBe(3);
  });
});

describe('flow stats', () => {
  const t = (side: 'buy' | 'sell', size: number, time: number, price = 100): Trade => ({ id: `${time}`, symbol: 'BTC', side, size, time, price });
  it('splits aggressor volume within the window', () => {
    const s = flowStats([t('buy', 3, 9_000), t('sell', 1, 9_500), t('buy', 100, 0)], 10_000, 5_000);
    expect(s).toMatchObject({ buyVol: 3, sellVol: 1, delta: 2, buyPct: 75 });
    expect(s.largest!.size).toBe(3);
    expect(s.tradesPerSec).toBeCloseTo(0.4);
  });
  it('large-print threshold is a high quantile of notional', () => {
    const trades = Array.from({ length: 100 }, (_, i) => t('buy', i + 1, i));
    expect(largePrintThreshold(trades, 0.95)).toBe(96 * 100);
    expect(largePrintThreshold(trades.slice(0, 5))).toBe(Infinity);
  });
});
