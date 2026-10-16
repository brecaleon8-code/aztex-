import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { createProvider, type MarketDataProvider } from '@/lib/data';
import type { Unsubscribe } from '@/lib/data/provider';
import { HISTORY_LIMIT, candlesKeyOf, useMarketStore } from '@/stores/useMarketStore';
import { onPrices } from '@/stores/trading';
import { useFootprintStore } from '@/stores/useFootprintStore';
import { TIMEFRAME_MS } from '@/lib/mock/candles';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { activeTabOf, paneCount, useChartTabsStore, type ChartPane } from '@/stores/useChartTabsStore';

/** Series the other (unfocused) charts of the active tab need, by candles key. */
export function wantedSeries(tabs: Parameters<typeof activeTabOf>[0], providerId: string): Map<string, ChartPane> {
  const tab = activeTabOf(tabs);
  const want = new Map<string, ChartPane>();
  if (!tab) return want;
  const n = paneCount(tab.layout);
  const focused = tab.active < n ? tab.active : 0;
  tab.panes.slice(0, n).forEach((p, i) => {
    if (i !== focused) want.set(candlesKeyOf(p.symbol, p.tf, providerId), p);
  });
  return want;
}

/**
 * Wires the active MarketDataProvider to the stores. Re-subscribes the symbol-scoped streams when
 * the selected symbol / timeframe changes, and rebuilds everything when the provider changes.
 * Multi-chart layouts get candle-only streams for their other panes (`useSeriesStore`).
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
  const secondary = new Map<string, Unsubscribe>();

  /** Candle streams for the unfocused panes of a multi-chart layout. */
  const syncSecondary = () => {
    const { providerId } = useMarketStore.getState();
    const want = wantedSeries(useChartTabsStore.getState(), providerId);
    const series = useSeriesStore.getState();
    for (const [k, off] of secondary) {
      if (!want.has(k)) {
        off();
        secondary.delete(k);
      }
    }
    for (const [k, p] of want) {
      if (secondary.has(k)) continue;
      const p0 = provider;
      // Seed from the cache (e.g. the chart that just lost focus) so the pane never flashes empty.
      if (!series.series[k]?.candles.length) series.setSeries(k, []);
      p0.getCandles(p.symbol, p.tf, HISTORY_LIMIT)
        .then((c) => {
          if (p0 === provider && secondary.has(k)) useSeriesStore.getState().setSeries(k, c);
        })
        .catch((e: unknown) => {
          if (p0 === provider && secondary.has(k)) useSeriesStore.getState().setSeries(k, [], e instanceof Error ? e.message : String(e));
        });
      secondary.set(k, p0.subscribeCandles(p.symbol, p.tf, (c) => useSeriesStore.getState().upsert(k, c)));
    }
    useSeriesStore.getState().prune(new Set(want.keys()));
  };

  const connectSymbol = () => {
    scoped.forEach((f) => f());
    const prev = useMarketStore.getState();
    // Keep the outgoing series: in a multi-chart layout it usually stays on screen in another pane.
    if (prev.candlesKey && prev.candles.length && !prev.candlesError) useSeriesStore.getState().setSeries(prev.candlesKey, prev.candles);
    const { selected, timeframe, providerId, setCandles, upsertCandle, setBook } = prev;
    const key = candlesKeyOf(selected, timeframe, providerId);
    setCandles(key, useSeriesStore.getState().series[key]?.candles ?? []);
    provider
      .getCandles(selected, timeframe, HISTORY_LIMIT)
      .then((c) => {
        if (useMarketStore.getState().candlesKey === key) setCandles(key, c);
      })
      .catch((e: unknown) => {
        if (useMarketStore.getState().candlesKey === key) setCandles(key, [], e instanceof Error ? e.message : String(e));
      });
    useFootprintStore.getState().reset(key, TIMEFRAME_MS[timeframe], useMarketStore.getState().assets[selected]?.price ?? 1);
    scoped = [
      provider.subscribeCandles(selected, timeframe, (c) => upsertCandle(key, c)),
      provider.subscribeOrderBook(selected, setBook),
      provider.subscribeTrades(selected, (ts) => {
        useMarketStore.getState().pushTrades(selected, ts);
        useFootprintStore.getState().add(key, ts);
      }),
    ];
  };

  const connectProvider = () => {
    global.forEach((f) => f());
    scoped.forEach((f) => f());
    secondary.forEach((f) => f());
    secondary.clear();
    useSeriesStore.getState().clear();
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
    syncSecondary();
    loadSparks();
    if (sparkTimer) clearInterval(sparkTimer);
    sparkTimer = setInterval(loadSparks, 15 * 60_000);
  };

  connectProvider();
  const unsub = useMarketStore.subscribe((s, prev) => {
    if (s.providerId !== prev.providerId) connectProvider();
    else if (s.selected !== prev.selected || s.timeframe !== prev.timeframe) connectSymbol();
  });
  const unsubTabs = useChartTabsStore.subscribe((s, prev) => {
    if (s.tabs !== prev.tabs || s.activeTab !== prev.activeTab) syncSecondary();
  });

  return () => {
    if (sparkTimer) clearInterval(sparkTimer);
    unsub();
    unsubTabs();
    global.forEach((f) => f());
    scoped.forEach((f) => f());
    secondary.forEach((f) => f());
    secondary.clear();
    provider.dispose();
  };
}
