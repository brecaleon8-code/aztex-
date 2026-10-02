import { reorder } from './useLayoutStore';
import { matchAlerts } from './useDiscoveryStore';
import { useOtcStore } from './useOtcStore';
import { useMarketStore } from './useMarketStore';
import { usePositionStore } from './usePositionStore';
import { useWalletStore, STARTING_BALANCE } from './useWalletStore';
import { useCommunityStore, normalizeHandle } from './useCommunityStore';
import { closePosition, flattenAll, onPrices, placeOrder, CLOSE_ANIM_MS } from './trading';
import type { ScannerEvent } from '@/types';

describe('layout reorder', () => {
  it('moves a panel into the target slot', () => {
    expect(reorder(['watchlist', 'chart', 'orderbook', 'ticket', 'positions', 'pnl'], 'pnl', 'chart')).toEqual(['watchlist', 'pnl', 'chart', 'orderbook', 'ticket', 'positions']);
    expect(reorder(['watchlist', 'chart', 'orderbook', 'ticket', 'positions', 'pnl'], 'watchlist', 'orderbook')).toEqual(['chart', 'orderbook', 'watchlist', 'ticket', 'positions', 'pnl']);
  });
});

describe('scanner alert matching', () => {
  const e: ScannerEvent = { id: '1', symbol: 'ETH', network: 'Base', type: 'whale_move', amount: 1, usd: 12_000_000, from: 'a', to: 'b', time: 0, flagged: false, txHash: 'x' };
  it('matches tracked patterns and USD threshold rules', () => {
    expect(matchAlerts(e, [{ id: 't', symbol: 'ETH', network: 'Base', type: 'whale_move', sourceEventId: '0' }], [])).toHaveLength(1);
    expect(matchAlerts(e, [], [{ id: 'r', symbol: 'ETH', thresholdUsd: 10_000_000 }])).toHaveLength(1);
    expect(matchAlerts(e, [], [{ id: 'r', symbol: 'ETH', thresholdUsd: 20_000_000 }])).toHaveLength(0);
    expect(matchAlerts(e, [{ id: 't', symbol: 'ETH', network: 'Arbitrum', type: 'whale_move', sourceEventId: '0' }], [])).toHaveLength(0);
  });
});

describe('OTC quote expiry', () => {
  it('accepts a live quote into the blotter and refuses an expired one', () => {
    const q = { id: 'q', desk: 'D', symbol: 'BTC', side: 'buy' as const, amount: 1, price: 100, total: 100, createdAt: 0, expiresAt: 15_000 };
    useOtcStore.setState({ quote: q, blotter: [] });
    expect(useOtcStore.getState().accept(15_000)).toBeNull();
    expect(useOtcStore.getState().blotter).toHaveLength(0);
    useOtcStore.setState({ quote: q });
    expect(useOtcStore.getState().accept(14_999)).toMatchObject({ id: 'q', executedAt: 14_999 });
    expect(useOtcStore.getState().blotter).toHaveLength(1);
    expect(useOtcStore.getState().quote).toBeNull();
  });
});

describe('community', () => {
  it('normalizes X handles', () => {
    expect(normalizeHandle('@aztex_desk')).toBe('aztex_desk');
    expect(normalizeHandle('bad handle')).toBeNull();
    expect(normalizeHandle('waytoolonghandle_x')).toBeNull();
  });
  it('adds contacts only via a known friend code', () => {
    const s = useCommunityStore.getState();
    expect(s.addContact('azt-9tr4-6wn')).toMatchObject({ ok: true, name: 'Yuki Arai' });
    expect(useCommunityStore.getState().addContact('AZT-9TR4-6WN')).toMatchObject({ ok: false });
    expect(useCommunityStore.getState().addContact('AZT-0000-000')).toMatchObject({ ok: false });
    expect(useCommunityStore.getState().addContact(useCommunityStore.getState().friendCode)).toMatchObject({ ok: false });
  });
});

describe('order → position → close settles into the wallet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWalletStore.setState({ balance: STARTING_BALANCE });
    usePositionStore.setState({ positions: [], workingOrders: [], closing: {}, highlight: {}, pnlHistory: [], realized: 0 });
    const a = useMarketStore.getState().assets.BTC;
    useMarketStore.setState({ assets: { ...useMarketStore.getState().assets, BTC: { ...a, price: 100, bid: 99.5, ask: 100.5 } } });
  });
  afterEach(() => vi.useRealTimers());

  const setBtc = (price: number) => {
    const a = useMarketStore.getState().assets.BTC;
    useMarketStore.setState({ assets: { ...useMarketStore.getState().assets, BTC: { ...a, price, bid: price - 0.5, ask: price + 0.5 } } });
    onPrices();
  };

  it('fills a market buy at the ask, reserves notional and marks P/L', () => {
    const r = placeOrder({ symbol: 'BTC', side: 'Long', orderType: 'market', size: 10, tp: 120, sl: 90 });
    expect(r.ok).toBe(true);
    const p = usePositionStore.getState().positions[0];
    expect(p.entry).toBe(100.5);
    expect(useWalletStore.getState().balance).toBeCloseTo(STARTING_BALANCE - 1005);
    setBtc(110);
    expect(usePositionStore.getState().positions[0].pnl).toBeCloseTo(95);
  });

  it('closing settles notional + P/L at the bid', async () => {
    placeOrder({ symbol: 'BTC', side: 'Long', orderType: 'market', size: 10, tp: 120, sl: 90 });
    setBtc(110);
    const id = usePositionStore.getState().positions[0].id;
    const done = closePosition(id);
    expect(usePositionStore.getState().closing[id]).toBe(true);
    vi.advanceTimersByTime(CLOSE_ANIM_MS);
    await done;
    expect(usePositionStore.getState().positions).toHaveLength(0);
    // entry 100.5, exit bid 109.5 → +90
    expect(useWalletStore.getState().balance).toBeCloseTo(STARTING_BALANCE + 90);
    expect(usePositionStore.getState().realized).toBeCloseTo(90);
  });

  it('rests a passive limit order and fills when price crosses it', () => {
    placeOrder({ symbol: 'BTC', side: 'Long', orderType: 'limit', size: 1, limitPrice: 95, tp: 110, sl: 90 });
    expect(usePositionStore.getState().workingOrders).toHaveLength(1);
    setBtc(97);
    expect(usePositionStore.getState().positions).toHaveLength(0);
    setBtc(94);
    expect(usePositionStore.getState().workingOrders).toHaveLength(0);
    expect(usePositionStore.getState().positions[0]).toMatchObject({ entry: 95, orderType: 'limit' });
  });

  it('flags TP hits and flattens everything', async () => {
    placeOrder({ symbol: 'BTC', side: 'Short', orderType: 'market', size: 1, tp: 90, sl: 110 });
    placeOrder({ symbol: 'BTC', side: 'Long', orderType: 'market', size: 1, tp: 120, sl: 80 });
    setBtc(89);
    expect(usePositionStore.getState().positions.find((p) => p.side === 'Short')!.tpHit).toBe(true);
    const done = flattenAll();
    vi.advanceTimersByTime(CLOSE_ANIM_MS);
    expect(await done).toBe(2);
    expect(usePositionStore.getState().positions).toHaveLength(0);
  });

  it('rejects orders over the available balance', () => {
    expect(placeOrder({ symbol: 'BTC', side: 'Long', orderType: 'market', size: 1e6, tp: 120, sl: 90 })).toMatchObject({ ok: false, error: 'Insufficient balance' });
    expect(usePositionStore.getState().positions).toHaveLength(0);
  });
});
