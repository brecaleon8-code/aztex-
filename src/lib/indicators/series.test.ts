import { bollinger, ema, extent, macd, rsi, sma } from './series';

describe('sma', () => {
  it('averages a rolling window with null warm-up', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it('resets the window across nulls', () => {
    expect(sma([1, 2, null, 4, 5, 6], 2)).toEqual([null, 1.5, null, null, 4.5, 5.5]);
  });
});

describe('ema', () => {
  it('seeds with the SMA then smooths with k = 2/(n+1)', () => {
    const out = ema([2, 4, 6, 8], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBe(4);
    expect(out[3]).toBeCloseTo(8 * 0.5 + 4 * 0.5);
  });
});

describe('bollinger', () => {
  it('uses SMA middle ± mult population stdev', () => {
    const { middle, upper, lower } = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    expect(middle[7]).toBe(5);
    expect(upper[7]).toBeCloseTo(9); // stdev = 2
    expect(lower[7]).toBeCloseTo(1);
  });
});

describe('rsi (Wilder)', () => {
  it('is 100 for a strictly rising series and 0 for falling', () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3)[5]).toBe(100);
    expect(rsi([6, 5, 4, 3, 2, 1], 3)[5]).toBe(0);
  });
  it('matches the reference Wilder calculation', () => {
    // Classic Wilder example (first RSI value with period 14).
    const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0];
    const out = rsi(closes, 14);
    expect(out[13]).toBeNull();
    expect(out[14]).toBeCloseTo(70.46, 1);
    expect(out[15]).toBeCloseTo(66.25, 1);
  });
});

describe('macd', () => {
  it('macd = ema(fast) - ema(slow), histogram = macd - signal', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 5 + i * 0.2);
    const m = macd(closes, 12, 26, 9);
    const ef = ema(closes, 12);
    const es = ema(closes, 26);
    expect(m.macd[24]).toBeNull();
    expect(m.macd[40]).toBeCloseTo((ef[40] as number) - (es[40] as number));
    expect(m.histogram[50]).toBeCloseTo((m.macd[50] as number) - (m.signal[50] as number));
    expect(m.signal[25 + 7]).toBeNull();
    expect(m.signal[25 + 8]).not.toBeNull();
  });
});

describe('extent', () => {
  it('ignores nulls and respects the window', () => {
    expect(extent([[null, 5, 1, 9], [3, null, 0]], 1, 3)).toEqual([0, 5]);
    expect(extent([[null, null]], 0, 2)).toBeNull();
  });
});
