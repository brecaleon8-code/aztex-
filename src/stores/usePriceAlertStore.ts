import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PriceAlert } from '@/types';
import { uid } from '@/lib/format';

/** Price alerts set from the chart (right-click › Add alert, or Alt+A). */
interface PriceAlertState {
  alerts: PriceAlert[];
  /** Fires when the price reaches `price` from where it is now (`last`). */
  add: (symbol: string, price: number, last: number) => PriceAlert;
  remove: (id: string) => void;
  removeFor: (symbol: string) => void;
}

export const usePriceAlertStore = create<PriceAlertState>()(
  persist(
    (set) => ({
      alerts: [],
      add: (symbol, price, last) => {
        const a: PriceAlert = { id: uid('alr_'), symbol, price, direction: price >= last ? 'above' : 'below', createdAt: Date.now() };
        set((s) => ({ alerts: [...s.alerts, a] }));
        return a;
      },
      remove: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
      removeFor: (symbol) => set((s) => ({ alerts: s.alerts.filter((a) => a.symbol !== symbol) })),
    }),
    { name: 'aztex.priceAlerts', version: 1 },
  ),
);

/** Alerts whose level the current prices have reached (pure; exported for tests). */
export function firedAlerts(alerts: PriceAlert[], prices: Record<string, number | undefined>): PriceAlert[] {
  return alerts.filter((a) => {
    const p = prices[a.symbol];
    if (p == null) return false;
    return a.direction === 'above' ? p >= a.price : p <= a.price;
  });
}
