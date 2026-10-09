import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FeeSample, Label, NetworkId } from '@/lib/onchain/types';
import type { ClassifiedTransfer } from '@/lib/onchain/flows';
import type { ActivityState, AlertHit, AlertRule } from '@/lib/onchain/alerts';
import { uid } from '@/lib/format';

export const MAX_TRANSFERS = 300;
export const MAX_FEES = 120;
export const MAX_HITS = 120;

export type DataMode = 'sim' | 'live';
type NewRule = AlertRule extends infer R ? (R extends AlertRule ? Omit<R, 'id' | 'createdAt' | 'hits' | 'lastHit' | 'enabled'> : never) : never;

interface OnchainState {
  /** Lookups: simulated or live public RPC. The flow/alert stream is simulated in both. */
  mode: DataMode;
  transfers: ClassifiedTransfer[];
  fees: Partial<Record<NetworkId, FeeSample[]>>;
  activity: ActivityState;
  rules: AlertRule[];
  hits: AlertHit[];
  /** Hits not yet seen on the On-chain page. */
  unseen: number;
  labels: Label[];
  history: { q: string; network: NetworkId | null; time: number }[];
  setMode: (m: DataMode) => void;
  addTransfers: (ts: ClassifiedTransfer[]) => void;
  addFees: (fs: FeeSample[]) => void;
  setActivity: (a: ActivityState) => void;
  addRule: (r: NewRule) => AlertRule;
  updateRule: (id: string, p: Partial<AlertRule>) => void;
  removeRule: (id: string) => void;
  addHits: (h: AlertHit[]) => void;
  clearHits: () => void;
  markSeen: () => void;
  setLabel: (l: Omit<Label, 'source'>) => void;
  removeLabel: (address: string) => void;
  pushHistory: (q: string, network: NetworkId | null) => void;
}

export const useOnchainStore = create<OnchainState>()(
  persist(
    (set, get) => ({
      mode: 'sim',
      transfers: [],
      fees: {},
      activity: { open: {}, stats: {} },
      rules: [],
      hits: [],
      unseen: 0,
      labels: [],
      history: [],
      setMode: (mode) => set({ mode }),
      addTransfers: (ts) => set((s) => ({ transfers: [...ts, ...s.transfers].sort((a, b) => b.time - a.time).slice(0, MAX_TRANSFERS) })),
      addFees: (fs) =>
        set((s) => {
          const fees = { ...s.fees };
          for (const f of fs) fees[f.network] = [...(fees[f.network] ?? []), f].slice(-MAX_FEES);
          return { fees };
        }),
      setActivity: (activity) => set({ activity }),
      addRule: (r) => {
        const rule = { ...r, id: uid('oar_'), createdAt: Date.now(), hits: 0, lastHit: null, enabled: true } as AlertRule;
        set((s) => ({ rules: [rule, ...s.rules] }));
        return rule;
      },
      updateRule: (id, p) => set((s) => ({ rules: s.rules.map((r) => (r.id === id ? ({ ...r, ...p } as AlertRule) : r)) })),
      removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      addHits: (h) => {
        if (!h.length) return;
        const byRule = new Map<string, { n: number; last: number }>();
        for (const x of h) byRule.set(x.ruleId, { n: (byRule.get(x.ruleId)?.n ?? 0) + 1, last: Math.max(byRule.get(x.ruleId)?.last ?? 0, x.time) });
        set((s) => ({
          hits: [...h, ...s.hits].slice(0, MAX_HITS),
          unseen: s.unseen + h.length,
          rules: s.rules.map((r) => (byRule.has(r.id) ? ({ ...r, hits: r.hits + byRule.get(r.id)!.n, lastHit: byRule.get(r.id)!.last } as AlertRule) : r)),
        }));
      },
      clearHits: () => set({ hits: [], unseen: 0 }),
      markSeen: () => {
        if (get().unseen) set({ unseen: 0 });
      },
      setLabel: (l) => set((s) => ({ labels: [{ ...l, source: 'user' as const }, ...s.labels.filter((x) => x.address.toLowerCase() !== l.address.toLowerCase())] })),
      removeLabel: (address) => set((s) => ({ labels: s.labels.filter((x) => x.address.toLowerCase() !== address.toLowerCase()) })),
      pushHistory: (q, network) => set((s) => ({ history: [{ q, network, time: Date.now() }, ...s.history.filter((h) => h.q !== q)].slice(0, 10) })),
    }),
    {
      name: 'aztex.onchain',
      partialize: (s) => ({ mode: s.mode, rules: s.rules, hits: s.hits.slice(0, 50), labels: s.labels, history: s.history }),
    },
  ),
);
