import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OtcFill, OtcQuote } from '@/types';

interface OtcState {
  quote: OtcQuote | null;
  blotter: OtcFill[];
  setQuote: (q: OtcQuote | null) => void;
  /** Executes the live quote; refuses if it has expired. */
  accept: (now?: number) => OtcFill | null;
}

export const useOtcStore = create<OtcState>()(
  persist(
    (set, get) => ({
      quote: null,
      blotter: [],
      setQuote: (quote) => set({ quote }),
      accept: (now = Date.now()) => {
        const q = get().quote;
        if (!q || now >= q.expiresAt) return null;
        const fill: OtcFill = { ...q, executedAt: now };
        set((s) => ({ quote: null, blotter: [fill, ...s.blotter] }));
        return fill;
      },
    }),
    { name: 'aztex.otc', partialize: (s) => ({ blotter: s.blotter }) },
  ),
);
