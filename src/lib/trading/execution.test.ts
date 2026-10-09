import { describe, expect, it } from 'vitest';
import type { OrderBookSnapshot } from '@/types';
import { previewOrder, slippageVs, sweepBook, type PreviewInput } from './execution';

const lv = (ps: [number, number][]) => {
  let c = 0;
  return ps.map(([price, size]) => ({ price, size, cumulative: (c += size) }));
};
const book: OrderBookSnapshot = {
  bids: lv([
    [99, 1],
    [98, 2],
    [97, 3],
  ]),
  asks: lv([
    [101, 1],
    [102, 2],
    [103, 3],
  ]),
  time: 0,
};
const rates = { maker: 0.0002, taker: 0.0006 };
const base: PreviewInput = { side: 'Long', type: 'market', qty: 1, tif: 'GTC', postOnly: false, reduceOnly: false, book, bid: 99, ask: 101, rates };

describe('sweepBook', () => {
  it('walks levels and computes VWAP / worst price', () => {
    const s = sweepBook(book.asks, 2.5, true);
    expect(s.filled).toBeCloseTo(2.5);
    expect(s.avgPx).toBeCloseTo((101 * 1 + 102 * 1.5) / 2.5);
    expect(s.worstPx).toBe(102);
    expect(s.levels).toBe(2);
  });
  it('respects a limit and only extrapolates when asked', () => {
    expect(sweepBook(book.asks, 10, true, 102).filled).toBeCloseTo(3);
    const deep = sweepBook(book.asks, 10, true, undefined, true);
    expect(deep.filled).toBeCloseTo(10);
    expect(deep.beyondBook).toBe(true);
    expect(deep.legs.some((l) => l.estimated)).toBe(true);
    expect(sweepBook(book.bids, 2, false).avgPx).toBeCloseTo((99 + 98) / 2);
  });
});

describe('previewOrder', () => {
  it('market: fills through the book with slippage vs touch and impact vs mid', () => {
    const p = previewOrder({ ...base, qty: 3 });
    expect(p.ok).toBe(true);
    expect(p.take.avgPx).toBeCloseTo((101 + 204) / 3);
    expect(p.slippageBps).toBeCloseTo(((305 / 3 - 101) / 101) * 1e4);
    expect(p.impactBps).toBeGreaterThan(p.slippageBps);
    expect(p.takerFee).toBeCloseTo(305 * 0.0006);
    expect(p.liquidity).toBe('taker');
  });

  it('market: slippage protection cancels the remainder', () => {
    const p = previewOrder({ ...base, qty: 5, maxSlippageBps: 150 }); // 101 × 1.015 = 102.515 → levels 101, 102
    expect(p.take.filled).toBeCloseTo(3);
    expect(p.cancelQty).toBeCloseTo(2);
    expect(p.warnings.join()).toMatch(/Slippage limit/);
  });

  it('sell side mirrors buys', () => {
    const p = previewOrder({ ...base, side: 'Short', qty: 2 });
    expect(p.take.avgPx).toBeCloseTo(98.5);
    expect(p.slippageBps).toBeCloseTo(((99 - 98.5) / 99) * 1e4);
  });

  it('limit GTC: takes what crosses and rests the rest', () => {
    const p = previewOrder({ ...base, type: 'limit', limitPrice: 102, qty: 5 });
    expect(p.take.filled).toBeCloseTo(3);
    expect(p.restQty).toBeCloseTo(2);
    expect(p.restPx).toBe(102);
    expect(p.liquidity).toBe('mixed');
    expect(p.required).toBeCloseTo(p.take.notional + 204 + p.takerFee + p.makerFee);
  });

  it('limit IOC cancels the remainder; FOK rejects unless fully fillable', () => {
    const ioc = previewOrder({ ...base, type: 'limit', tif: 'IOC', limitPrice: 102, qty: 5 });
    expect(ioc.ok).toBe(true);
    expect(ioc.restQty).toBe(0);
    expect(ioc.cancelQty).toBeCloseTo(2);
    const fok = previewOrder({ ...base, type: 'limit', tif: 'FOK', limitPrice: 102, qty: 5 });
    expect(fok.ok).toBe(false);
    expect(fok.reject).toMatch(/FOK/);
    expect(previewOrder({ ...base, type: 'limit', tif: 'FOK', limitPrice: 102, qty: 3 }).ok).toBe(true);
    expect(previewOrder({ ...base, type: 'limit', tif: 'IOC', limitPrice: 100, qty: 1 }).reject).toMatch(/IOC/);
  });

  it('post-only rejects marketable limits and rests passive ones as maker', () => {
    expect(previewOrder({ ...base, type: 'limit', postOnly: true, limitPrice: 101 }).reject).toMatch(/Post-only/);
    const p = previewOrder({ ...base, type: 'limit', postOnly: true, limitPrice: 100 });
    expect(p.ok).toBe(true);
    expect(p.liquidity).toBe('maker');
    expect(p.makerFee).toBeCloseTo(100 * 0.0002);
  });

  it('reduce-only needs an opposite position and is clamped to it', () => {
    expect(previewOrder({ ...base, reduceOnly: true, reducible: 0 }).reject).toMatch(/no short position/);
    const p = previewOrder({ ...base, side: 'Short', reduceOnly: true, reducible: 0.4, qty: 1 });
    expect(p.qty).toBeCloseTo(0.4);
    expect(p.warnings.join()).toMatch(/clamped/);
  });

  it('falls back to the touch when no book is available', () => {
    const p = previewOrder({ ...base, book: null, qty: 1000 });
    expect(p.take.avgPx).toBe(101);
    expect(p.slippageBps).toBe(0);
  });

  it('slippage vs arrival is signed by side', () => {
    expect(slippageVs('Long', 101, 100)).toBeCloseTo(100);
    expect(slippageVs('Short', 99, 100)).toBeCloseTo(100);
    expect(slippageVs('Short', 101, 100)).toBeCloseTo(-100);
  });
});
