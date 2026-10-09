import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OrderType, Side, TimeInForce } from '@/types';
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
  exec: 'direct' | 'twap';
  twapMinutes: number;
  twapSlices: number;
  tif: TimeInForce;
  postOnly: boolean;
  reduceOnly: boolean;
  /** TP/SL go out as live OCO exit orders (on) or stay alert levels (off). */
  bracket: boolean;
  /** Market-order protection from the touch, bps. */
  maxSlippageBps: number;
  setTif: (t: TimeInForce) => void;
  setFlag: (k: 'postOnly' | 'reduceOnly' | 'bracket', v: boolean) => void;
  setMaxSlippage: (bps: number) => void;
  setExec: (e: 'direct' | 'twap') => void;
  setTwap: (p: { minutes?: number; slices?: number }) => void;
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
      exec: 'direct',
      twapMinutes: 5,
      twapSlices: 10,
      tif: 'GTC',
      postOnly: false,
      reduceOnly: false,
      bracket: true,
      maxSlippageBps: 50,
      // Post-only orders must be able to rest, so they're always GTC (as on most venues).
      setTif: (tif) => set(tif === 'GTC' ? { tif } : { tif, postOnly: false }),
      setFlag: (k, v) => set(k === 'postOnly' && v ? { postOnly: true, tif: 'GTC' } : ({ [k]: v } as Pick<OrderState, typeof k>)),
      setMaxSlippage: (bps) => set({ maxSlippageBps: Math.max(1, Math.min(1000, Math.round(bps))) }),
      setExec: (exec) => set({ exec }),
      setTwap: ({ minutes, slices }) => set((s) => ({ twapMinutes: minutes ?? s.twapMinutes, twapSlices: slices ?? s.twapSlices })),
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
      partialize: (s) => ({ sizingMode: s.sizingMode, pctValue: s.pctValue, usdtValue: s.usdtValue, twapMinutes: s.twapMinutes, twapSlices: s.twapSlices, tif: s.tif, bracket: s.bracket, maxSlippageBps: s.maxSlippageBps }),
    },
  ),
);
