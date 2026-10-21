import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarketStore } from './useMarketStore';
import { usePositionStore } from './usePositionStore';
import { useWalletStore, STARTING_BALANCE } from './useWalletStore';
import { useExecutionStore } from './useExecutionStore';
import { useOrderStore } from './useOrderStore';
import { cancelStopOrder, onPrices, placeStopOrder } from './trading';
import { quickKinds, quickOrder, ticketAt, ticketSizeAt } from './quickTrade';
import { firedAlerts, usePriceAlertStore } from './usePriceAlertStore';

const setBtc = (price: number) => {
  const a = useMarketStore.getState().assets.BTC;
  useMarketStore.setState({ selected: 'BTC', book: null, assets: { ...useMarketStore.getState().assets, BTC: { ...a, price, bid: price - 0.5, ask: price + 0.5 } } });
  onPrices();
};
const orders = () => useExecutionStore.getState().orders;

beforeEach(() => {
  vi.useFakeTimers();
  useWalletStore.setState({ balance: STARTING_BALANCE, holdings: {} });
  usePositionStore.setState({ positions: [], workingOrders: [], stopOrders: [], algos: [], closing: {}, highlight: {}, pnlHistory: [], realized: 0 });
  useExecutionStore.setState({ orders: [], fills: [] });
  useOrderStore.setState({ sizingMode: 'pct', pctValue: 10, bracket: true, side: 'Long', orderType: 'market', limitPrice: null });
  setBtc(100);
});
afterEach(() => vi.useRealTimers());

describe('stop entry orders', () => {
  it('rest off-book and go in as a market order once the price trades through', () => {
    const r = placeStopOrder({ symbol: 'BTC', side: 'Long', size: 2, triggerPrice: 105, tp: 120, sl: 90 });
    expect(r.ok).toBe(true);
    expect(usePositionStore.getState().stopOrders).toHaveLength(1);
    expect(orders()[0]).toMatchObject({ kind: 'stop', status: 'new', triggerPrice: 105 });
    setBtc(103);
    expect(usePositionStore.getState().positions).toHaveLength(0);
    setBtc(106);
    expect(usePositionStore.getState().stopOrders).toHaveLength(0);
    const p = usePositionStore.getState().positions[0];
    expect(p).toMatchObject({ side: 'Long', size: 2 });
    expect(p.entry).toBeCloseTo(106.5);
    const stop = orders().find((o) => o.kind === 'stop')!;
    expect(stop.status).toBe('filled');
    expect(stop.reason).toContain('Triggered at 105');
    expect(orders().some((o) => o.kind === 'market' && o.source === 'chart')).toBe(true);
  });

  it('must sit on the right side of the market and can be cancelled', () => {
    expect(placeStopOrder({ symbol: 'BTC', side: 'Long', size: 1, triggerPrice: 99, tp: 120, sl: 90 })).toEqual({ ok: false, error: 'A buy stop must be above the market' });
    expect(placeStopOrder({ symbol: 'BTC', side: 'Short', size: 1, triggerPrice: 101, tp: 80, sl: 110 })).toEqual({ ok: false, error: 'A sell stop must be below the market' });
    const r = placeStopOrder({ symbol: 'BTC', side: 'Short', size: 1, triggerPrice: 95, tp: 80, sl: 110 });
    if (!r.ok) throw new Error(r.error);
    cancelStopOrder(r.id);
    expect(usePositionStore.getState().stopOrders).toHaveLength(0);
    expect(orders()[0].status).toBe('cancelled');
    setBtc(90);
    expect(usePositionStore.getState().positions).toHaveLength(0);
  });
});

describe('one-click chart orders', () => {
  it('pick limit or stop by where the click is relative to the market', () => {
    expect(quickKinds(95, 100)).toEqual({ buy: 'limit', sell: 'stop' });
    expect(quickKinds(105, 100)).toEqual({ buy: 'stop', sell: 'limit' });
  });

  it('size like the ticket and rest at the clicked price', () => {
    // 10% of 25,000 equity at 95 → 26.3158 BTC.
    expect(ticketSizeAt(95)).toBeCloseTo(2500 / 95);
    const buy = quickOrder('BTC', 'Long', 95);
    expect(buy.ok).toBe(true);
    const w = usePositionStore.getState().workingOrders[0];
    expect(w).toMatchObject({ side: 'Long', limitPrice: 95, bracket: true });
    expect(w.size).toBeCloseTo(2500 / 95);
    const sell = quickOrder('BTC', 'Short', 95);
    expect(sell.ok).toBe(true);
    expect(usePositionStore.getState().stopOrders[0]).toMatchObject({ side: 'Short', triggerPrice: 95 });
    expect(orders().every((o) => o.source === 'chart')).toBe(true);
  });

  it('Add order loads the ticket with a limit at that price', () => {
    ticketAt('ETH', 3000);
    expect(useMarketStore.getState().selected).toBe('ETH');
    expect(useOrderStore.getState()).toMatchObject({ orderType: 'limit', limitPrice: 3000 });
  });
});

describe('price alerts', () => {
  it('fire when the price reaches the level from where it was set', () => {
    usePriceAlertStore.setState({ alerts: [] });
    const up = usePriceAlertStore.getState().add('BTC', 110, 100);
    const down = usePriceAlertStore.getState().add('BTC', 90, 100);
    expect(up.direction).toBe('above');
    expect(down.direction).toBe('below');
    const all = usePriceAlertStore.getState().alerts;
    expect(firedAlerts(all, { BTC: 105 })).toEqual([]);
    expect(firedAlerts(all, { BTC: 110 }).map((a) => a.id)).toEqual([up.id]);
    expect(firedAlerts(all, { BTC: 89 }).map((a) => a.id)).toEqual([down.id]);
    expect(firedAlerts(all, {})).toEqual([]);
    usePriceAlertStore.getState().removeFor('BTC');
    expect(usePriceAlertStore.getState().alerts).toEqual([]);
  });
});
