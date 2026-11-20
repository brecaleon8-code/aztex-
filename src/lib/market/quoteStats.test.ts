import { describe, expect, it } from 'vitest';
import type { Candle } from '@/types';
import { quoteStats, startOfMonth, startOfQuarter, startOfWeek, startOfYear } from './quoteStats';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 20, 13, 0); // Fri 20 Nov 2026, 13:00 UTC

/** n daily candles ending with today's session; close of day i = 100 + i. */
function series(n: number): Candle[] {
  const today = Date.UTC(2026, 10, 20);
  return Array.from({ length: n }, (_, i) => {
    const time = today - (n - 1 - i) * DAY;
    const close = 100 + i;
    return { time, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 10 };
  });
}

describe('quote statistics', () => {
  it('period starts are UTC Monday / month / quarter / year', () => {
    expect(new Date(startOfWeek(NOW)).toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(new Date(startOfMonth(NOW)).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(new Date(startOfQuarter(NOW)).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(new Date(startOfYear(NOW)).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('session values, previous close and returns against the right reference closes', () => {
    const d = series(400); // today's close is 499, yesterday's 498
    const s = quoteStats(d, 500, NOW);
    expect(s.prevClose).toBe(498);
    expect(s.open).toBe(498.5);
    expect(s.high).toBe(500); // live price above today's high
    expect(s.low).toBe(498);
    // WTD: last close before Mon 16 Nov is Sun 15 Nov = 5 days before today → 499 - 5 = 494.
    expect(s.wtd).toBeCloseTo(500 / 494 - 1, 10);
    // MTD: last close before 1 Nov = 31 Oct, 20 days before today → 479.
    expect(s.mtd).toBeCloseTo(500 / 479 - 1, 10);
    // 1W: the close before (today − 6 days) = 7 days back → 492.
    expect(s.r1w).toBeCloseTo(500 / 492 - 1, 10);
    expect(s.r1y).not.toBeNull();
  });

  it('52-week range with dates, and the live price can set a new extreme', () => {
    const d = series(400);
    const s = quoteStats(d, 1000, NOW);
    expect(s.high52w).toEqual({ value: 1000, time: Date.UTC(2026, 10, 20) });
    // Lowest low within the last 365 sessions: the session 364 days before today.
    expect(s.low52w!.time).toBe(Date.UTC(2026, 10, 20) - 364 * DAY);
    expect(s.low52w!.value).toBe(499 - 364 - 1);
  });

  it('returns null when history is too short; volume and volatility from the last 30 sessions', () => {
    const s = quoteStats(series(20), 120, NOW);
    expect(s.r3m).toBeNull();
    expect(s.ytd).toBeNull();
    expect(s.avgVol30d).toBeGreaterThan(0);
    expect(s.vol30d).toBeGreaterThan(0);
    const empty = quoteStats([], 50, NOW);
    expect(empty.open).toBeNull();
    expect(empty.high52w).toBeNull();
    expect(empty.vol30d).toBeNull();
  });
});
