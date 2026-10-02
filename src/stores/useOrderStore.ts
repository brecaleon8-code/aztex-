import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OrderType, Side } from '@/types';
import type { SizingMode } from '@/lib/trading/pnl';

/**
 * Order-ticket draft. tp/sl/limitPrice are `null` while following their live suggestion; the
 * ticket only ever stores finite numbers (inputs guard against NaN before committing).
 */
interface OrderState {
  side: Side;
  orderType: OrderType;
  limitPrice: number | null;
  sizingMode: SizingMode;
  pctValue: number;
  usdtValue: number;
  tp: number | null;
  sl: number | null;
  setSide: (s: Side) => void;
  setOrderType: (t: OrderType) => void;
  setLimitPrice: (p: number | null) => void;
  setSizingMode: (m: SizingMode) => void;
  setSizingValue: (v: number) => void;
  setTp: (v: number | null) => void;
  setSl: (v: number | null) => void;
  resetLevels: () => void;
  /** Order-book click: set limit price and switch to Limit. */
  limitFromBook: (price: number) => void;
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set) => ({
      side: 'Long',
      orderType: 'market',
      limitPrice: null,
      sizingMode: 'pct',
      pctValue: 10,
      usdtValue: 2500,
      tp: null,
      sl: null,
      setSide: (side) => set({ side, tp: null, sl: null }),
      setOrderType: (orderType) => set({ orderType }),
      setLimitPrice: (limitPrice) => set({ limitPrice }),
      setSizingMode: (sizingMode) => set({ sizingMode }),
      setSizingValue: (v) => set((s) => (s.sizingMode === 'pct' ? { pctValue: v } : { usdtValue: v })),
      setTp: (tp) => set({ tp }),
      setSl: (sl) => set({ sl }),
      resetLevels: () => set({ tp: null, sl: null }),
      limitFromBook: (price) => set({ limitPrice: price, orderType: 'limit', tp: null, sl: null }),
    }),
    {
      name: 'aztex.ticket',
      partialize: (s) => ({ sizingMode: s.sizingMode, pctValue: s.pctValue, usdtValue: s.usdtValue }),
    },
  ),
);
