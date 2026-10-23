import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Side } from '@/types';

/** Bottom sheets of the phone app. One at a time, like the MT5 / TradingView apps. */
export type MobileSheet =
  | { kind: 'order'; side?: Side; type?: 'market' | 'limit' | 'stop'; price?: number; symbol?: string }
  | { kind: 'position'; id: string }
  | { kind: 'symbol'; purpose: 'chart' | 'watch' }
  | { kind: 'quote'; symbol: string }
  | { kind: 'indicators' }
  | { kind: 'tools' }
  | { kind: 'chart-settings' };

interface MobileState {
  sheet: MobileSheet | null;
  open: (s: MobileSheet) => void;
  close: () => void;
  /** Quotes list: TradingView-style prices or MT5-style bid/ask boxes. */
  quotesMode: 'simple' | 'bidask';
  setQuotesMode: (m: 'simple' | 'bidask') => void;
}

export const useMobileStore = create<MobileState>()(
  persist(
    (set) => ({
      sheet: null,
      open: (sheet) => set({ sheet }),
      close: () => set({ sheet: null }),
      quotesMode: 'simple',
      setQuotesMode: (quotesMode) => set({ quotesMode }),
    }),
    { name: 'aztex.mobile', version: 1, partialize: (s) => ({ quotesMode: s.quotesMode }) },
  ),
);
