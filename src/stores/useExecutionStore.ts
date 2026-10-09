import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FillRecord, OrderRecord } from '@/types';

const MAX_ORDERS = 300;
const MAX_FILLS = 600;

/** Order and fill history — the source for the blotter and execution-quality stats. */
interface ExecutionState {
  orders: OrderRecord[];
  fills: FillRecord[];
  upsert: (o: OrderRecord) => void;
  patch: (id: string, p: Partial<OrderRecord>) => OrderRecord | undefined;
  addFills: (f: FillRecord[]) => void;
  clearHistory: () => void;
}

export const useExecutionStore = create<ExecutionState>()(
  persist(
    (set, get) => ({
      orders: [],
      fills: [],
      upsert: (o) =>
        set((s) => ({ orders: s.orders.some((x) => x.id === o.id) ? s.orders.map((x) => (x.id === o.id ? o : x)) : [o, ...s.orders].slice(0, MAX_ORDERS) })),
      patch: (id, p) => {
        const cur = get().orders.find((x) => x.id === id);
        if (!cur) return undefined;
        const next = { ...cur, ...p, updatedAt: Date.now() };
        set((s) => ({ orders: s.orders.map((x) => (x.id === id ? next : x)) }));
        return next;
      },
      addFills: (f) => set((s) => ({ fills: [...f, ...s.fills].slice(0, MAX_FILLS) })),
      // Keeps live orders (resting limits, active bracket legs); drops finished history.
      clearHistory: () => set((s) => ({ orders: s.orders.filter((o) => o.status === 'new' || o.status === 'partially_filled'), fills: [] })),
    }),
    { name: 'aztex.execution' },
  ),
);

export const isLive = (o: OrderRecord) => o.status === 'new' || o.status === 'partially_filled';
