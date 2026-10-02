import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Position, WorkingOrder } from '@/types';
import { levelHit, unrealizedPnl } from '@/lib/trading/pnl';

export interface PnlSample {
  t: number;
  pnl: number;
}
export const PNL_HISTORY_MAX = 240;

interface PositionState {
  positions: Position[];
  workingOrders: WorkingOrder[];
  /** ids currently animating out (fade/shrink before removal). */
  closing: Record<string, true>;
  /** id -> timestamp of one-shot highlight pulse (placed / TP hit). */
  highlight: Record<string, number>;
  pnlHistory: PnlSample[];
  realized: number;
  add: (p: Position) => void;
  remove: (id: string) => Position | undefined;
  markClosing: (id: string) => void;
  addWorking: (o: WorkingOrder) => void;
  removeWorking: (id: string) => WorkingOrder | undefined;
  addRealized: (v: number) => void;
  pulse: (id: string) => void;
  /** Mark positions to the latest prices; returns ids whose TP/SL was newly hit. */
  markToMarket: (prices: Record<string, number>) => { tp: Position[]; sl: Position[] };
}

export const usePositionStore = create<PositionState>()(
  persist(
    (set, get) => ({
      positions: [],
      workingOrders: [],
      closing: {},
      highlight: {},
      pnlHistory: [],
      realized: 0,
      add: (p) => set((s) => ({ positions: [p, ...s.positions], highlight: { ...s.highlight, [p.id]: Date.now() } })),
      remove: (id) => {
        const p = get().positions.find((x) => x.id === id);
        set((s) => {
          const closing = { ...s.closing };
          delete closing[id];
          return { positions: s.positions.filter((x) => x.id !== id), closing };
        });
        return p;
      },
      markClosing: (id) => set((s) => ({ closing: { ...s.closing, [id]: true } })),
      addWorking: (o) => set((s) => ({ workingOrders: [o, ...s.workingOrders] })),
      removeWorking: (id) => {
        const o = get().workingOrders.find((x) => x.id === id);
        set((s) => ({ workingOrders: s.workingOrders.filter((x) => x.id !== id) }));
        return o;
      },
      addRealized: (v) => set((s) => ({ realized: s.realized + v })),
      pulse: (id) => set((s) => ({ highlight: { ...s.highlight, [id]: Date.now() } })),
      markToMarket: (prices) => {
        const tp: Position[] = [];
        const sl: Position[] = [];
        const positions = get().positions.map((p) => {
          const current = prices[p.symbol];
          if (current == null) return p;
          const hit = levelHit(p.side, p.tp, p.sl, current);
          const next = { ...p, current, pnl: unrealizedPnl(p.side, p.entry, current, p.size), tpHit: p.tpHit || hit.tp, slHit: p.slHit || hit.sl };
          if (hit.tp && !p.tpHit) tp.push(next);
          if (hit.sl && !p.slHit) sl.push(next);
          return next;
        });
        const total = positions.reduce((s, p) => s + p.pnl, 0);
        set((s) => {
          const highlight = { ...s.highlight };
          tp.forEach((p) => (highlight[p.id] = Date.now()));
          const pnlHistory = positions.length
            ? [...s.pnlHistory, { t: Date.now(), pnl: total }].slice(-PNL_HISTORY_MAX)
            : s.pnlHistory.length
              ? []
              : s.pnlHistory;
          return { positions, highlight, pnlHistory };
        });
        return { tp, sl };
      },
    }),
    {
      name: 'aztex.positions',
      partialize: (s) => ({ positions: s.positions, workingOrders: s.workingOrders, realized: s.realized }),
    },
  ),
);

export const totalUnrealized = (ps: Position[]) => ps.reduce((s, p) => s + p.pnl, 0);
export const committedNotional = (ps: Position[]) => ps.reduce((s, p) => s + p.entry * p.size, 0);
