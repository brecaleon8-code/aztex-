import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Asset, Candle, OrderBookSnapshot, Ticker, Timeframe, Trade } from '@/types';
import { TIMEFRAME_MS } from '@/lib/mock/candles';
import { ASSET_UNIVERSE, BASE_PRICES, DEFAULT_WATCHLIST, SPREAD } from '@/lib/mock/assets';
import { DEFAULT_PROVIDER, type ProviderId } from '@/lib/data';
import type { ConnectionStatus } from '@/lib/data/provider';

export const HISTORY_LIMIT = 320;
export const TAPE_MAX = 400;
export const BOOK_HISTORY_MAX = 160;

function initialAssets(): Record<string, Asset> {
  return Object.fromEntries(
    ASSET_UNIVERSE.map((a) => {
      const price = BASE_PRICES[a.symbol];
      const half = (price * SPREAD[a.symbol]) / 2;
      return [a.symbol, { symbol: a.symbol, name: a.name, price, change24h: 0, bid: price - half, ask: price + half, volume24h: 0 }];
    }),
  );
}

interface MarketState {
  providerId: ProviderId;
  assets: Record<string, Asset>;
  selected: string;
  watchlist: string[];
  timeframe: Timeframe;
  candles: Candle[];
  candlesKey: string;
  candlesError: string | null;
  book: OrderBookSnapshot | null;
  bookVersion: number;
  /** Rolling book snapshots for the liquidity heatmap. */
  bookHistory: OrderBookSnapshot[];
  /** Tape for the selected symbol, newest first. */
  trades: Trade[];
  /** Real aggressor delta per candle open-time, accumulated from the tape. */
  deltaByTime: Record<number, number>;
  status: ConnectionStatus;
  setProvider: (id: ProviderId) => void;
  select: (symbol: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  addWatch: (symbol: string) => void;
  removeWatch: (symbol: string) => void;
  toggleWatch: (symbol: string) => void;
  applyTickers: (t: Ticker[]) => void;
  setCandles: (key: string, candles: Candle[], error?: string | null) => void;
  upsertCandle: (key: string, c: Candle) => void;
  setBook: (b: OrderBookSnapshot) => void;
  pushTrades: (symbol: string, t: Trade[]) => void;
  setStatus: (s: ConnectionStatus) => void;
}

export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      providerId: DEFAULT_PROVIDER,
      assets: initialAssets(),
      selected: 'BTC',
      watchlist: DEFAULT_WATCHLIST,
      timeframe: '1m',
      candles: [],
      candlesKey: '',
      candlesError: null,
      book: null,
      bookVersion: 0,
      bookHistory: [],
      trades: [],
      deltaByTime: {},
      status: { state: 'connecting', latencyMs: null },
      setProvider: (providerId) => set({ providerId, candles: [], candlesKey: '', book: null, bookHistory: [], trades: [], deltaByTime: {} }),
      select: (selected) => set((s) => (s.selected === selected ? s : { selected, book: null, bookHistory: [], trades: [], deltaByTime: {} })),
      setTimeframe: (timeframe) => set({ timeframe, deltaByTime: {} }),
      addWatch: (sym) => set((s) => (s.watchlist.includes(sym) ? s : { watchlist: [...s.watchlist, sym] })),
      removeWatch: (sym) => set((s) => ({ watchlist: s.watchlist.filter((w) => w !== sym) })),
      toggleWatch: (sym) => set((s) => ({ watchlist: s.watchlist.includes(sym) ? s.watchlist.filter((w) => w !== sym) : [...s.watchlist, sym] })),
      applyTickers: (ts) =>
        set((s) => {
          const assets = { ...s.assets };
          for (const t of ts) {
            const prev = assets[t.symbol];
            if (!prev) continue;
            assets[t.symbol] = { ...prev, price: t.price, bid: t.bid, ask: t.ask, change24h: t.change24h, volume24h: t.volume24h };
          }
          return { assets };
        }),
      setCandles: (candlesKey, candles, error = null) => set({ candlesKey, candles, candlesError: error }),
      upsertCandle: (key, c) =>
        set((s) => {
          if (s.candlesKey !== key || s.candles.length === 0) return s;
          const last = s.candles[s.candles.length - 1];
          if (c.time === last.time) return { candles: [...s.candles.slice(0, -1), c] };
          if (c.time > last.time) return { candles: [...s.candles, c] };
          return s;
        }),
      setBook: (book) => set((s) => ({ book, bookVersion: s.bookVersion + 1, bookHistory: [...s.bookHistory, book].slice(-BOOK_HISTORY_MAX) })),
      pushTrades: (symbol, ts) =>
        set((s) => {
          if (symbol !== s.selected || ts.length === 0) return s;
          const step = TIMEFRAME_MS[s.timeframe];
          const deltaByTime = { ...s.deltaByTime };
          for (const t of ts) {
            const b = Math.floor(t.time / step) * step;
            deltaByTime[b] = (deltaByTime[b] ?? 0) + (t.side === 'buy' ? t.size : -t.size);
          }
          return { trades: [...ts].reverse().concat(s.trades).slice(0, TAPE_MAX), deltaByTime };
        }),
      setStatus: (status) => set({ status }),
    }),
    {
      name: 'aztex.market',
      partialize: (s) => ({ watchlist: s.watchlist, selected: s.selected, timeframe: s.timeframe, providerId: s.providerId }),
    },
  ),
);

export const candlesKeyOf = (symbol: string, tf: Timeframe, provider: string) => `${provider}:${symbol}:${tf}`;
