import { create } from 'zustand';
import type { Trade } from '@/types';
import { accumulateTrades, footprintTick, type RawFootprint } from '@/lib/orderflow/footprint';

/**
 * Live footprint for the selected symbol/timeframe, built from the trade tape. `since` is the first
 * print seen: bars that opened before it were not fully observed and fall back to an OHLCV estimate.
 */
interface FootprintState {
  key: string;
  tfMs: number;
  tick: number;
  since: number | null;
  bars: RawFootprint;
  reset: (key: string, tfMs: number, price: number) => void;
  add: (key: string, trades: Trade[]) => void;
}

const MAX_BARS = 400;

export const useFootprintStore = create<FootprintState>((set) => ({
  key: '',
  tfMs: 60_000,
  tick: 1,
  since: null,
  bars: {},
  reset: (key, tfMs, price) => set({ key, tfMs, tick: footprintTick(price), since: null, bars: {} }),
  add: (key, trades) =>
    set((s) => {
      if (key !== s.key || trades.length === 0) return s;
      let bars = accumulateTrades(s.bars, trades, s.tfMs, s.tick);
      const times = Object.keys(bars);
      if (times.length > MAX_BARS) {
        const keep = new Set(times.map(Number).sort((a, b) => b - a).slice(0, MAX_BARS));
        bars = Object.fromEntries(Object.entries(bars).filter(([t]) => keep.has(+t)));
      }
      const first = Math.min(...trades.map((t) => t.time));
      return { bars, since: s.since == null ? first : Math.min(s.since, first) };
    }),
}));
