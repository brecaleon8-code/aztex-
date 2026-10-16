import { create } from 'zustand';
import type { Candle } from '@/types';

/** Candles for charts other than the focused one (multi-chart layouts), keyed like `candlesKeyOf`. */
export interface SeriesEntry {
  candles: Candle[];
  error: string | null;
}

/** Kept around after a pane stops showing a series, so flipping focus back and forth is instant. */
export const SERIES_CACHE_MAX = 12;

interface SeriesState {
  series: Record<string, SeriesEntry>;
  /** Most recently written keys last (for eviction). */
  order: string[];
  setSeries: (key: string, candles: Candle[], error?: string | null) => void;
  upsert: (key: string, c: Candle) => void;
  /** Drops cached series beyond the cap, never touching `keep`. */
  prune: (keep: Set<string>) => void;
  clear: () => void;
}

export const useSeriesStore = create<SeriesState>()((set) => ({
  series: {},
  order: [],
  setSeries: (key, candles, error = null) => set((s) => ({ series: { ...s.series, [key]: { candles, error } }, order: [...s.order.filter((k) => k !== key), key] })),
  upsert: (key, c) =>
    set((s) => {
      const e = s.series[key];
      if (!e || e.candles.length === 0) return s;
      const last = e.candles[e.candles.length - 1];
      let candles: Candle[];
      if (c.time === last.time) candles = [...e.candles.slice(0, -1), c];
      else if (c.time > last.time) candles = [...e.candles, c];
      else return s;
      return { series: { ...s.series, [key]: { ...e, candles } } };
    }),
  prune: (keep) =>
    set((s) => {
      const extra = s.order.length - SERIES_CACHE_MAX;
      if (extra <= 0) return s;
      const drop = new Set(s.order.filter((k) => !keep.has(k)).slice(0, extra));
      if (!drop.size) return s;
      const series = { ...s.series };
      for (const k of drop) delete series[k];
      return { series, order: s.order.filter((k) => !drop.has(k)) };
    }),
  clear: () => set({ series: {}, order: [] }),
}));
