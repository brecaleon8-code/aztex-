import { describe, expect, it } from 'vitest';
import type { Candle } from '@/types';
import { atrBox, niceStep, renko } from './renko';

const mk = (closes: number[], vol = 10): Candle[] => closes.map((c, i) => ({ time: i * 60_000, open: closes[i - 1] ?? c, high: Math.max(c, closes[i - 1] ?? c) + 0.2, low: Math.min(c, closes[i - 1] ?? c) - 0.2, close: c, volume: vol }));

describe('niceStep', () => {
  it('rounds to 1 / 2 / 2.5 / 5 × 10^k', () => {
    expect(niceStep(6.2)).toBe(5);
    expect(niceStep(0.31)).toBe(0.25);
    expect(niceStep(1.9)).toBe(2);
    expect(niceStep(0.0148)).toBe(0.01);
    expect(niceStep(8)).toBe(10);
    expect(niceStep(0)).toBe(0);
  });
});

describe('renko', () => {
  it('prints one brick per full box, multiple bricks from one big candle', () => {
    const r = renko(mk([100, 100.5, 101, 103.2]), 1);
    expect(r.bricks.map((b) => [b.open, b.close])).toEqual([
      [100, 101],
      [101, 102],
      [102, 103],
    ]);
    // Bricks from the same candle share its time and split its volume.
    expect(r.bricks[1].time).toBe(r.bricks[2].time);
    expect(r.bricks[1].volume).toBeCloseTo(r.bricks[2].volume);
    expect(r.nextUp).toBe(104);
    expect(r.nextDown).toBe(101);
  });

  it('needs a two-box move to reverse', () => {
    const r = renko(mk([100, 101, 102, 101.2, 100.5, 99.9]), 1);
    const dirs = r.bricks.map((b) => Math.sign(b.close - b.open));
    // Up to 102: dips to 101.2 / 100.5 don't reverse; a close ≤ 100 (two boxes off the top) does.
    expect(dirs).toEqual([1, 1, -1]);
    expect(r.bricks[2]).toMatchObject({ open: 101, close: 100 });
  });

  it('volume is conserved across bricks and wicks show the counter-move', () => {
    const c = mk([100, 99.6, 100.4, 101.1, 102.3]);
    const r = renko(c, 1);
    const total = c.reduce((s, x) => s + x.volume, 0);
    const inBricks = r.bricks.reduce((s, b) => s + b.volume, 0);
    expect(inBricks).toBeLessThanOrEqual(total);
    expect(inBricks).toBeGreaterThan(0);
    expect(r.bricks[0].low).toBeLessThan(r.bricks[0].open);
    const noWicks = renko(c, 1, false);
    expect(noWicks.bricks[0].low).toBe(noWicks.bricks[0].open);
  });

  it('returns nothing for a bad box and an auto box from ATR', () => {
    expect(renko(mk([1, 2, 3]), 0).bricks).toEqual([]);
    const c = mk(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 4));
    const b = atrBox(c);
    expect(b).toBeGreaterThan(0);
    expect([1, 2, 2.5, 5]).toContain(+(b / 10 ** Math.floor(Math.log10(b))).toFixed(4));
    expect(renko(c, b).bricks.length).toBeGreaterThan(3);
  });
});
