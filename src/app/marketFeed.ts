import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { createProvider, type MarketDataProvider } from '@/lib/data';
import type { Unsubscribe } from '@/lib/data/provider';
import { HISTORY_LIMIT, candlesKeyOf, useMarketStore } from '@/stores/useMarketStore';
import { onPrices } from '@/stores/trading';

/**
 * Wires the active MarketDataProvider to the stores. Re-subscribes the symbol-scoped streams when
 * the selected symbol / timeframe changes, and rebuilds everything when the provider changes.
 */
export function startMarketFeed(): Unsubscribe {
  const symbols = ASSET_UNIVERSE.map((a) => a.symbol);
  let provider: MarketDataProvider;
  let global: Unsubscribe[] = [];
  let sparkTimer: ReturnType<typeof setInterval> | null = null;

  /** 24h of 15m closes per symbol — real history from whichever provider is active. */
  const loadSparks = () => {
    const p = provider;
    for (const sym of symbols) {
      p.getCandles(sym, '15m', 96)
        .then((c) => {
          if (p === provider) useMarketStore.getState().setSpark(sym, c.map((k) => k.close));
        })
        .catch(() => {});
    }
  };
  let scoped: Unsubscribe[] = [];

  const connectSymbol = () => {
    scoped.forEach((f) => f());
    const { selected, timeframe, providerId, setCandles, upsertCandle, setBook } = useMarketStore.getState();
    const key = candlesKeyOf(selected, timeframe, providerId);
    setCandles(key, []);
    provider
      .getCandles(selected, timeframe, HISTORY_LIMIT)
      .then((c) => {
        if (useMarketStore.getState().candlesKey === key) setCandles(key, c);
      })
      .catch((e: unknown) => {
        if (useMarketStore.getState().candlesKey === key) setCandles(key, [], e instanceof Error ? e.message : String(e));
      });
    scoped = [
      provider.subscribeCandles(selected, timeframe, (c) => upsertCandle(key, c)),
      provider.subscribeOrderBook(selected, setBook),
      provider.subscribeTrades(selected, (ts) => useMarketStore.getState().pushTrades(selected, ts)),
    ];
  };

  const connectProvider = () => {
    global.forEach((f) => f());
    scoped.forEach((f) => f());
    provider?.dispose();
    const st = useMarketStore.getState();
    provider = createProvider(st.providerId);
    global = [
      provider.subscribeTickers(symbols, (ts) => {
        useMarketStore.getState().applyTickers(ts);
        onPrices();
      }),
      provider.onStatus((s) => useMarketStore.getState().setStatus(s)),
    ];
    connectSymbol();
    loadSparks();
    if (sparkTimer) clearInterval(sparkTimer);
    sparkTimer = setInterval(loadSparks, 15 * 60_000);
  };

  connectProvider();
  const unsub = useMarketStore.subscribe((s, prev) => {
    if (s.providerId !== prev.providerId) connectProvider();
    else if (s.selected !== prev.selected || s.timeframe !== prev.timeframe) connectSymbol();
  });

  return () => {
    if (sparkTimer) clearInterval(sparkTimer);
    unsub();
    global.forEach((f) => f());
    scoped.forEach((f) => f());
    provider.dispose();
  };
}
