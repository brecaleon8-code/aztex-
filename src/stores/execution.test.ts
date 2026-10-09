import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderBookSnapshot } from '@/types';
import { useMarketStore } from './useMarketStore';
import { usePositionStore } from './usePositionStore';
import { useWalletStore, STARTING_BALANCE } from './useWalletStore';
import { useFeeStore } from './useFeeStore';
import { useExecutionStore } from './useExecutionStore';
import { closePosition, onPrices, placeOrder, previewFor, CLOSE_ANIM_MS, cancelWorkingOrder } from './trading';
import { FEE_TIERS } from '@/lib/account/fees';

const TAKER = FEE_TIERS.standard.taker;
const MAKER = FEE_TIERS.standard.maker;
const lv = (ps: [number, number][]) => {
  let c = 0;
  return ps.map(([price, size]) => ({ price, size, cumulative: (c += size) }));
};
const BOOK: OrderBookSnapshot = {
  bids: lv([
    [99.5, 2],
    [99, 3],
    [98.5, 5],
  ]),
  asks: lv([
    [100.5, 2],
    [101, 3],
    [101.5, 5],
  ]),
  time: 0,
};

const setBtc = (price: number, book: OrderBookSnapshot | null = null) => {
  const a = useMarketStore.getState().assets.BTC;
  useMarketStore.setState({ selected: 'BTC', book, assets: { ...useMarketStore.getState().assets, BTC: { ...a, price, bid: price - 0.5, ask: price + 0.5 } } });
  onPrices();
};
const orders = () => useExecutionStore.getState().orders;
const fills = () => useExecutionStore.getState().fills;
const base = { symbol: 'BTC', tp: 120, sl: 90 } as const;

beforeEach(() => {
  vi.useFakeTimers();
  useWalletStore.setState({ balance: STARTING_BALANCE });
  useFeeStore.setState({ tier: 'standard', appliedCode: null, feesPaid: 0, rebatesEarned: 0 });
  usePositionStore.setState({ positions: [], workingOrders: [], algos: [], closing: {}, highlight: {}, pnlHistory: [], realized: 0 });
  useExecutionStore.setState({ orders: [], fills: [] });
  setBtc(100, BOOK);
});
afterEach(() => vi.useRealTimers());

describe('order router', () => {
  it('market orders walk the book: VWAP entry, one fill per level, order record with slippage benchmark', () => {
    const r = placeOrder({ ...base, side: 'Long', orderType: 'market', size: 4 });
    expect(r.ok).toBe(true);
    const p = usePositionStore.getState().positions[0];
    expect(p.entry).toBeCloseTo((100.5 * 2 + 101 * 2) / 4);
    expect(fills().map((f) => [f.price, f.qty, f.liquidity])).toEqual([
      [101, 2, 'taker'],
      [100.5, 2, 'taker'],
    ].reverse());
    const o = orders()[0];
    expect(o).toMatchObject({ status: 'filled', kind: 'market', tif: 'IOC', filledQty: 4, arrivalMid: 100 });
    expect(o.avgPx).toBeCloseTo(p.entry);
    expect(o.fees).toBeCloseTo(p.entry * 4 * TAKER);
    expect(useWalletStore.getState().balance).toBeCloseTo(STARTING_BALANCE - p.entry * 4 * (1 + TAKER));
  });

  it('preview matches what the router does', () => {
    const pv = previewFor({ ...base, side: 'Long', orderType: 'market', size: 4 });
    placeOrder({ ...base, side: 'Long', orderType: 'market', size: 4 });
    expect(orders()[0].avgPx).toBeCloseTo(pv.take.avgPx!);
    expect(orders()[0].fees).toBeCloseTo(pv.takerFee);
  });

  it('GTC limit through the book: takes what crosses, rests the rest, which later fills as maker into the same position', () => {
    placeOrder({ ...base, side: 'Long', orderType: 'limit', size: 6, limitPrice: 101 });
    expect(usePositionStore.getState().positions).toHaveLength(1);
    expect(usePositionStore.getState().positions[0].size).toBeCloseTo(5);
    expect(usePositionStore.getState().workingOrders[0]).toMatchObject({ size: 1, limitPrice: 101 });
    expect(orders()[0]).toMatchObject({ status: 'partially_filled', filledQty: 5 });
    setBtc(100.2, BOOK); // ask 100.7 ≤ 101 → resting part fills
    const p = usePositionStore.getState().positions;
    expect(p).toHaveLength(1);
    expect(p[0].size).toBeCloseTo(6);
    expect(orders()[0]).toMatchObject({ status: 'filled', filledQty: 6 });
    expect(fills()[0]).toMatchObject({ liquidity: 'maker', qty: 1, price: 101 });
  });

  it('IOC cancels the unfilled remainder; FOK rejects without filling', () => {
    placeOrder({ ...base, side: 'Long', orderType: 'limit', tif: 'IOC', size: 6, limitPrice: 101 });
    expect(orders()[0]).toMatchObject({ status: 'cancelled', filledQty: 5 });
    expect(orders()[0].reason).toMatch(/IOC/);
    expect(usePositionStore.getState().workingOrders).toHaveLength(0);
    const r = placeOrder({ ...base, side: 'Long', orderType: 'limit', tif: 'FOK', size: 6, limitPrice: 101 });
    expect(r.ok).toBe(false);
    expect(orders()[0]).toMatchObject({ status: 'rejected', filledQty: 0 });
    expect(usePositionStore.getState().positions).toHaveLength(1);
  });

  it('post-only: rejected if it would cross, otherwise rests and fills as maker', () => {
    expect(placeOrder({ ...base, side: 'Long', orderType: 'limit', postOnly: true, size: 1, limitPrice: 100.5 }).ok).toBe(false);
    expect(orders()[0].reason).toMatch(/Post-only/);
    placeOrder({ ...base, side: 'Long', orderType: 'limit', postOnly: true, size: 1, limitPrice: 99 });
    expect(orders()[0]).toMatchObject({ status: 'new', postOnly: true });
    setBtc(98, BOOK);
    expect(useFeeStore.getState().feesPaid).toBeCloseTo(99 * MAKER);
  });

  it('reduce-only closes opposite exposure FIFO, never opens new', () => {
    expect(placeOrder({ ...base, side: 'Short', orderType: 'market', size: 1, reduceOnly: true }).ok).toBe(false);
    expect(orders()[0].reason).toMatch(/no long position/);
    placeOrder({ ...base, side: 'Long', orderType: 'market', size: 1 });
    placeOrder({ ...base, side: 'Long', orderType: 'market', size: 1 });
    const r = placeOrder({ ...base, side: 'Short', orderType: 'market', size: 1.5, reduceOnly: true });
    expect(r.ok).toBe(true);
    const ps = usePositionStore.getState().positions;
    expect(ps).toHaveLength(1);
    expect(ps[0].size).toBeCloseTo(0.5);
    // Over-sized reduce-only is clamped to what's open.
    placeOrder({ ...base, side: 'Short', orderType: 'market', size: 5, reduceOnly: true });
    expect(usePositionStore.getState().positions).toHaveLength(0);
    expect(orders()[0]).toMatchObject({ qty: 0.5, reduceOnly: true, status: 'filled' });
    expect(orders()[0].reason).toMatch(/clamped/);
  });

  it('bracket: TP and SL are live OCO legs — TP fills at its price as maker and cancels the stop', () => {
    placeOrder({ ...base, side: 'Long', orderType: 'market', size: 1, bracket: true, tp: 105, sl: 95 });
    const legs = orders().filter((o) => o.source === 'bracket');
    expect(legs.map((l) => [l.kind, l.status, l.side, l.reduceOnly])).toEqual(
      expect.arrayContaining([
        ['take_profit', 'new', 'Short', true],
        ['stop_loss', 'new', 'Short', true],
      ]),
    );
    setBtc(106, null); // bid 105.5 ≥ 105
    expect(usePositionStore.getState().positions).toHaveLength(0);
    const after = orders().filter((o) => o.source === 'bracket');
    expect(after.find((o) => o.kind === 'take_profit')).toMatchObject({ status: 'filled', avgPx: 105 });
    expect(after.find((o) => o.kind === 'stop_loss')).toMatchObject({ status: 'cancelled' });
    expect(usePositionStore.getState().realized).toBeCloseTo((105 - 100.5) * 1);
  });

  it('bracket: the stop fills at the touch (taker) when triggered', () => {
    placeOrder({ ...base, side: 'Short', orderType: 'market', size: 1, bracket: true, tp: 90, sl: 103 });
    setBtc(104, null); // ask 104.5 ≥ 103 → stop-market at 104.5
    expect(usePositionStore.getState().positions).toHaveLength(0);
    expect(orders().find((o) => o.kind === 'stop_loss')).toMatchObject({ status: 'filled', avgPx: 104.5 });
    expect(orders().find((o) => o.kind === 'take_profit')).toMatchObject({ status: 'cancelled' });
  });

  it('without a bracket TP/SL stay alert levels', () => {
    placeOrder({ ...base, side: 'Long', orderType: 'market', size: 1, tp: 105, sl: 95 });
    setBtc(106, null);
    expect(usePositionStore.getState().positions[0].tpHit).toBe(true);
    expect(orders().filter((o) => o.source === 'bracket')).toHaveLength(0);
  });

  it('manual close and cancel are recorded; closing cancels bracket legs', async () => {
    placeOrder({ ...base, side: 'Long', orderType: 'market', size: 1, bracket: true, tp: 110, sl: 90 });
    const id = usePositionStore.getState().positions[0].id;
    const done = closePosition(id);
    vi.advanceTimersByTime(CLOSE_ANIM_MS);
    await done;
    expect(orders()[0]).toMatchObject({ kind: 'close', status: 'filled', side: 'Short' });
    expect(orders().filter((o) => o.source === 'bracket').every((o) => o.status === 'cancelled')).toBe(true);
    placeOrder({ ...base, side: 'Long', orderType: 'limit', size: 1, limitPrice: 90 });
    cancelWorkingOrder(orders()[0].id);
    expect(orders()[0]).toMatchObject({ status: 'cancelled', reason: 'Cancelled by user' });
  });
});
