import { describe, expect, it } from 'vitest';
import { distToSegment, fmtSpan, hitDrawing, measure, shiftDrawing, snapToOhlc } from './drawings';
import { makeXScale, makeYScale } from './scale';
import type { Drawing } from '@/types';

// 100 bars across 1000px (10px each), prices 0–100 over 0–500px (y grows downward).
const xs = makeXScale(0, 100, 1000);
const ys = makeYScale(0, 100, 0, 500, 0);
const at = (i: number, p: number) => ({ index: i, price: p });

describe('drawing hit-testing', () => {
  const trend: Drawing = { id: 't', tool: 'trend', p1: at(10, 20), p2: at(50, 60) };
  const ray: Drawing = { id: 'r', tool: 'ray', p1: at(30, 50) };
  const rect: Drawing = { id: 'b', tool: 'rect', p1: at(60, 80), p2: at(80, 70) };
  const brush: Drawing = { id: 'k', tool: 'brush', p1: at(0, 0), points: [at(0, 10), at(5, 15), at(10, 10)] };

  it('measures distance to a segment', () => {
    expect(distToSegment(5, 5, 0, 0, 10, 0)).toBeCloseTo(5);
    expect(distToSegment(-3, 4, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it('finds the drawing under the pointer, topmost first', () => {
    const mid = { x: xs.toX(30), y: ys.toY(40) }; // on the trend line
    expect(hitDrawing([trend], mid.x, mid.y, xs, ys, 1000)?.id).toBe('t');
    expect(hitDrawing([trend], mid.x, mid.y + 30, xs, ys, 1000)).toBeNull();
    // Horizontal line: anywhere to the right of its anchor, at its price.
    expect(hitDrawing([ray], xs.toX(90), ys.toY(50), xs, ys, 1000)?.id).toBe('r');
    expect(hitDrawing([ray], xs.toX(10), ys.toY(50), xs, ys, 1000)).toBeNull();
    expect(hitDrawing([rect], xs.toX(70), ys.toY(75), xs, ys, 1000)?.id).toBe('b');
    expect(hitDrawing([brush], xs.toX(5), ys.toY(15), xs, ys, 1000)?.id).toBe('k');
    // Overlapping: the last drawn wins.
    const ray2: Drawing = { ...ray, id: 'r2' };
    expect(hitDrawing([ray, ray2], xs.toX(90), ys.toY(50), xs, ys, 1000)?.id).toBe('r2');
  });
});

describe('moving, snapping and measuring', () => {
  it('shifts every point by bars and price, keeping time anchors in step', () => {
    const d: Drawing = { id: 'x', tool: 'trend', p1: { index: 1, price: 10, time: 60_000 }, p2: { index: 3, price: 12, time: 180_000 } };
    const m = shiftDrawing(d, 2, 5, 60_000);
    expect(m.p1).toEqual({ index: 3, price: 15, time: 180_000 });
    expect(m.p2).toEqual({ index: 5, price: 17, time: 300_000 });
  });

  it('magnet snaps to the nearest O/H/L/C within reach only', () => {
    const candles = [{ time: 0, open: 40, high: 60, low: 30, close: 50, volume: 1 }];
    expect(snapToOhlc(at(0.3, 58), ys.toY(58), candles, ys)).toEqual({ index: 0, price: 60 });
    expect(snapToOhlc(at(0.2, 90), ys.toY(90), candles, ys)).toEqual(at(0.2, 90));
  });

  it('ruler reads price change, % and bars / duration', () => {
    expect(measure(at(10, 100), at(25, 110), 60_000)).toEqual({ dPrice: 10, pct: 10, bars: 15, span: '15m' });
    expect(measure(at(0, 100), at(-3, 90), null)).toMatchObject({ dPrice: -10, pct: -10, bars: -3, span: null });
    expect(fmtSpan(90 * 60_000)).toBe('1h 30m');
    expect(fmtSpan(2 * 86_400_000 + 4 * 3_600_000)).toBe('2d 4h');
    expect(fmtSpan(3_600_000)).toBe('1h');
  });
});
