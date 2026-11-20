import { create } from 'zustand';
import type { Candle } from '@/types';

/** How many daily sessions the Quote window asks for: a year and a bit, for 52-week and 1Y stats. */
export const DAILY_LIMIT = 400;

interface DailyState {
  /** Daily candles per symbol from the active provider, oldest first. */
  bars: Record<string, Candle[]>;
  /** Symbols some window wants daily history for (the market feed loads and refreshes them). */
  wanted: string[];
  want: (symbol: string) => void;
  setBars: (symbol: string, candles: Candle[]) => void;
  clear: () => void;
}

export const useDailyStore = create<DailyState>()((set) => ({
  bars: {},
  wanted: [],
  want: (symbol) => set((s) => (s.wanted.includes(symbol) ? s : { wanted: [...s.wanted, symbol] })),
  setBars: (symbol, candles) => set((s) => ({ bars: { ...s.bars, [symbol]: candles } })),
  clear: () => set({ bars: {} }),
}));
