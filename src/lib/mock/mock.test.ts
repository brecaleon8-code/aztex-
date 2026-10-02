import { generateOrderBook, imbalance } from './orderbook';
import { applyTick, generateCandles } from './candles';
import { generateQuote, QUOTE_TTL_MS } from './otc';
import { generateFriendCode } from './community';
import { mulberry32 } from './rng';

describe('mock order book', () => {
  const book = generateOrderBook(62480, 0.0001, 14, mulberry32(1));
  it('has best levels nearest the spread, never crossed', () => {
    expect(book.bids[0].price).toBeLessThan(book.asks[0].price);
    for (let i = 1; i < 14; i++) {
      expect(book.bids[i].price).toBeLessThan(book.bids[i - 1].price);
      expect(book.asks[i].price).toBeGreaterThan(book.asks[i - 1].price);
    }
  });
  it('cumulative depth is a running sum', () => {
    expect(book.asks[3].cumulative).toBeCloseTo(book.asks.slice(0, 4).reduce((s, l) => s + l.size, 0));
  });
  it('imbalance is in [-1, 1]', () => {
    const v = imbalance(book);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe('mock candles', () => {
  it('generates ≥200 candles of deep history ending at the requested price', () => {
    const c = generateCandles('BTC', '1m', 320, 50_000, 1_700_000_000_000);
    expect(c.length).toBe(320);
    expect(c.at(-1)!.close).toBeCloseTo(50_000);
    expect(c.every((k) => k.high >= Math.max(k.open, k.close) && k.low <= Math.min(k.open, k.close))).toBe(true);
    expect(c[1].time - c[0].time).toBe(60_000);
  });
  it('is deterministic per symbol/timeframe', () => {
    expect(generateCandles('ETH', '5m', 50, 3000, 1e12)).toEqual(generateCandles('ETH', '5m', 50, 3000, 1e12));
  });
  it('applyTick updates the forming candle, then opens a new one', () => {
    const base = [{ time: 0, open: 10, high: 10, low: 10, close: 10, volume: 0 }];
    const a = applyTick(base, 12, 30_000, 60_000, 1);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ high: 12, close: 12, volume: 1 });
    const b = applyTick(a, 11, 61_000, 60_000);
    expect(b).toHaveLength(2);
    expect(b[1]).toMatchObject({ time: 60_000, open: 12, close: 11 });
  });
});

describe('mock OTC + community', () => {
  it('quotes skew against the requester and expire after the TTL', () => {
    const buy = generateQuote('BTC', 'buy', 2, 100, mulberry32(3));
    const sell = generateQuote('BTC', 'sell', 2, 100, mulberry32(3));
    expect(buy.price).toBeGreaterThan(100);
    expect(sell.price).toBeLessThan(100);
    expect(buy.total).toBeCloseTo(buy.price * 2);
    expect(buy.expiresAt - buy.createdAt).toBe(QUOTE_TTL_MS);
  });
  it('friend codes look like AZT-XXXX-XXX', () => {
    expect(generateFriendCode()).toMatch(/^AZT-[A-Z2-9]{4}-[A-Z2-9]{3}$/);
  });
});

describe('evolving mock book', () => {
  it('keeps resting size at a price between snapshots (bounded drift)', async () => {
    const { evolveBook } = await import('./orderbook');
    const mem = new Map<number, number>();
    const rand = mulberry32(9);
    const a = evolveBook(100, 0.0002, mem, 14, rand);
    const b = evolveBook(100, 0.0002, mem, 14, rand);
    const p = a.bids[5].price;
    const sa = a.bids[5].size;
    const sb = b.bids.find((l) => l.price === p)!.size;
    expect(sb / sa).toBeGreaterThan(0.2);
    expect(sb / sa).toBeLessThan(5);
  });
});
