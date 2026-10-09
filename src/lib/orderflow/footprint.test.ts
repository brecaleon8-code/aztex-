import { describe, expect, it } from 'vitest';
import type { Trade } from '@/types';
import { accumulateTrades, estimateBar, footprintTick, imbalances, rebin, rowSizeFor } from './footprint';

const t = (price: number, size: number, side: 'buy' | 'sell', time = 1000): Trade => ({ id: `${price}${size}${side}${time}`, symbol: 'BTC', price, size, side, time });

describe('footprint', () => {
  it('picks ~1bp ticks and nice row multiples', () => {
    expect(footprintTick(62_000)).toBe(5);
    expect(footprintTick(3_100)).toBe(0.25);
    expect(rowSizeFor(5, 12)).toBe(25);
    expect(rowSizeFor(5, 3)).toBe(5);
    expect(rowSizeFor(0.25, 1.1)).toBe(1.25);
  });

  it('accumulates trades by bar and tick, split by aggressor, immutably', () => {
    const empty = {};
    const a = accumulateTrades(empty, [t(100.2, 1, 'buy'), t(100.4, 2, 'sell'), t(101.1, 3, 'buy', 61_000)], 60_000, 0.5);
    expect(empty).toEqual({});
    expect(a[0]).toEqual({ 200: [1, 2] });
    expect(a[60_000]).toEqual({ 202: [3, 0] });
    const b = accumulateTrades(a, [t(100.3, 1, 'buy')], 60_000, 0.5);
    expect(b[0][200]).toEqual([2, 2]);
    expect(a[0][200]).toEqual([1, 2]);
    expect(b[60_000]).toBe(a[60_000]);
  });

  it('rebins ticks into rows with totals, delta and POC', () => {
    const r = rebin({ 200: [1, 2], 201: [5, 0], 204: [1, 1] }, 0.5, 1);
    expect(r.rows).toEqual({ 100: [6, 2], 102: [1, 1] });
    expect(r.total).toBe(10);
    expect(r.delta).toBe(4);
    expect(r.poc).toBe(100);
  });

  it('estimates a bar from OHLCV: conserves volume, covers the range, leans with direction, deterministic', () => {
    const c = { time: 5, open: 100, high: 104, low: 99, close: 103.5, volume: 1000 };
    const e = estimateBar(c, 0.5);
    expect(e.total).toBeCloseTo(1000, 6);
    const keys = Object.keys(e.rows).map(Number);
    expect(Math.min(...keys)).toBe(198);
    expect(Math.max(...keys)).toBe(208);
    expect(e.delta).toBeGreaterThan(0);
    expect(estimateBar(c, 0.5)).toEqual(e);
    expect(estimateBar({ ...c, open: 103.5, close: 100 }, 0.5).delta).toBeLessThan(0);
  });

  it('flags diagonal imbalances', () => {
    const rows = { 10: [1, 2] as [number, number], 11: [9, 1] as [number, number], 12: [1, 8] as [number, number] };
    const im = imbalances(rows, 3);
    expect([...im.buy]).toEqual([11]); // 9 buy at 11 vs 2 sell at 10
    expect([...im.sell]).toEqual([]); // 8 sell at 12 vs nothing above
    expect([...imbalances({ 10: [0, 9], 11: [2, 0] }, 3).sell]).toEqual([10]);
  });
});
