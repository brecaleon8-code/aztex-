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

export type QuotesMode = 'simple' | 'advanced';

interface MobileState {
  sheet: MobileSheet | null;
  open: (s: MobileSheet) => void;
  close: () => void;
  /** Quotes list, as in MT5: Simple (symbol, bid, ask) or Advanced (+ tick time, spread, low / high). */
  quotesMode: QuotesMode;
  setQuotesMode: (m: QuotesMode) => void;
}

export const useMobileStore = create<MobileState>()(
  persist(
    (set) => ({
      sheet: null,
      open: (sheet) => set({ sheet }),
      close: () => set({ sheet: null }),
      quotesMode: 'advanced',
      setQuotesMode: (quotesMode) => set({ quotesMode }),
    }),
    {
      name: 'aztex.mobile',
      version: 2,
      partialize: (s) => ({ quotesMode: s.quotesMode }),
      // v1 had a sparkline list ('simple') and bid/ask boxes ('bidask'); both become MT5's Advanced view.
      migrate: (persisted, version) => (version < 2 ? { ...(persisted as object), quotesMode: 'advanced' } : persisted) as MobileState,
    },
  ),
);
