import type { Candle } from '@/types';
import { heikinAshi } from './heikinAshi';
import { clampViewport, isLive, onSeriesGrow, pan, zoom, MIN_VISIBLE } from './viewport';
import { fibLevels, linePath, makeXScale, makeYScale, niceTicks } from './scale';

describe('heikinAshi', () => {
  const c: Candle[] = [
    { time: 0, open: 10, high: 14, low: 8, close: 12, volume: 1 },
    { time: 1, open: 12, high: 16, low: 11, close: 15, volume: 1 },
  ];
  it('derives smoothed synthetic OHLC from real OHLC', () => {
    const ha = heikinAshi(c);
    expect(ha[0].close).toBe((10 + 14 + 8 + 12) / 4);
    expect(ha[0].open).toBe((10 + 12) / 2);
    expect(ha[1].open).toBe((ha[0].open + ha[0].close) / 2);
    expect(ha[1].close).toBe((12 + 16 + 11 + 15) / 4);
    expect(ha[1].high).toBe(Math.max(16, ha[1].open, ha[1].close));
    expect(ha[1].low).toBe(Math.min(11, ha[1].open, ha[1].close));
  });
  it('does not mutate input', () => {
    const copy = structuredClone(c);
    heikinAshi(c);
    expect(c).toEqual(copy);
  });
});

describe('viewport', () => {
  it('clamps visibleCount between MIN_VISIBLE and the full length', () => {
    expect(clampViewport({ visibleCount: 3, viewEnd: 100 }, 300).visibleCount).toBe(MIN_VISIBLE);
    expect(clampViewport({ visibleCount: 999, viewEnd: 100 }, 300)).toEqual({ visibleCount: 300, viewEnd: 300 });
  });
  it('zooms multiplicatively', () => {
    expect(zoom({ visibleCount: 100, viewEnd: 300 }, 0.83, 300).visibleCount).toBe(83);
    expect(zoom({ visibleCount: 100, viewEnd: 300 }, 1.2, 300).visibleCount).toBe(120);
  });

  it('pans with a pixel accumulator — slow drags still move', () => {
    let s = { vp: { visibleCount: 50, viewEnd: 300 }, acc: 0 };
    // ten 3px moves at a 10px candle width = 30px = 3 candles back in time
    for (let i = 0; i < 10; i++) s = pan(s, 3, 10, 300);
    expect(s.vp.viewEnd).toBe(297);
    expect(s.acc).toBeCloseTo(0);
  });
  it('carries the sub-candle remainder', () => {
    const s = pan({ vp: { visibleCount: 50, viewEnd: 200 }, acc: 0 }, 25, 10, 300);
    expect(s.vp.viewEnd).toBe(198);
    expect(s.acc).toBe(5);
    const back = pan(s, -16, 10, 300);
    expect(back.vp.viewEnd).toBe(199);
    expect(back.acc).toBe(-1);
  });
  it('drops the remainder when pinned at an edge so reversal is immediate', () => {
    const s = pan({ vp: { visibleCount: 50, viewEnd: 300 }, acc: 0 }, -500, 10, 300);
    expect(s.vp.viewEnd).toBe(300);
    expect(s.acc).toBe(0);
  });
  it('follows the live edge only when already live', () => {
    expect(onSeriesGrow({ visibleCount: 50, viewEnd: 300 }, 300, 301).viewEnd).toBe(301);
    expect(onSeriesGrow({ visibleCount: 50, viewEnd: 250 }, 300, 301).viewEnd).toBe(250);
    expect(isLive({ visibleCount: 50, viewEnd: 250 }, 300)).toBe(false);
  });
});

describe('scales', () => {
  it('x maps candle centres and inverts', () => {
    const x = makeXScale(100, 50, 500);
    expect(x.candleWidth).toBe(10);
    expect(x.toX(100)).toBe(5);
    expect(x.toIndex(x.toX(123))).toBe(123);
  });
  it('y inverts and pads', () => {
    const y = makeYScale(100, 200, 0, 100, 0);
    expect(y.toY(200)).toBe(0);
    expect(y.toY(100)).toBe(100);
    expect(y.toPrice(50)).toBe(150);
  });
  it('y handles a flat range without dividing by zero', () => {
    const y = makeYScale(50, 50, 0, 100);
    expect(Number.isFinite(y.toY(50))).toBe(true);
  });
  it('nice ticks are round', () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
  });
  it('fib levels span p1 → p2', () => {
    const f = fibLevels(100, 200);
    expect(f.map((l) => l.level)).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
    expect(f[3].price).toBe(150);
  });
  it('linePath breaks on nulls', () => {
    const x = makeXScale(0, 4, 40);
    const y = makeYScale(0, 10, 0, 10, 0);
    expect(linePath([1, null, 3, 4], x, y, 0, 4)).toBe('M5.00,9.00M25.00,7.00L35.00,6.00');
  });
});
