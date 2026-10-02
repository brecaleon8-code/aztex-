import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScannerEvent, ScannerEventType } from '@/types';
import { CATEGORICAL } from './useThemeStore';
import { uid } from '@/lib/format';

export interface TrackedPattern {
  id: string;
  symbol: string;
  type: ScannerEventType;
  network: string;
  sourceEventId: string;
}
export interface AlertRule {
  id: string;
  symbol: string;
  thresholdUsd: number;
}
export interface AlertHit {
  id: string;
  time: number;
  reason: string;
  event: ScannerEvent;
}

export const MAX_COMPARE = 5;
export const MAX_EVENTS = 60;

interface DiscoveryState {
  /** Shared selection across the dominance ring, breakdown table and search. */
  highlighted: string | null;
  comparison: { symbol: string; color: string }[];
  events: ScannerEvent[];
  tracked: TrackedPattern[];
  rules: AlertRule[];
  alerts: AlertHit[];
  highlight: (s: string | null) => void;
  toggleCompare: (s: string) => void;
  pushEvent: (e: ScannerEvent) => AlertHit[];
  toggleTrack: (e: ScannerEvent) => void;
  addRule: (symbol: string, thresholdUsd: number) => void;
  removeRule: (id: string) => void;
  clearAlerts: () => void;
}

/** Returns which tracked patterns / threshold rules an event triggers (pure; tested). */
export function matchAlerts(e: ScannerEvent, tracked: TrackedPattern[], rules: AlertRule[]): string[] {
  const reasons: string[] = [];
  for (const t of tracked) if (t.symbol === e.symbol && t.type === e.type && t.network === e.network) reasons.push(`Tracked pattern · ${t.symbol} ${t.type.replace('_', ' ')} on ${t.network}`);
  for (const r of rules) if (r.symbol === e.symbol && e.usd >= r.thresholdUsd) reasons.push(`${r.symbol} transfer ≥ $${r.thresholdUsd.toLocaleString('en-US')}`);
  return reasons;
}

export const useDiscoveryStore = create<DiscoveryState>()(
  persist(
    (set, get) => ({
      highlighted: null,
      comparison: [
        { symbol: 'BTC', color: CATEGORICAL[0] },
        { symbol: 'ETH', color: CATEGORICAL[1] },
        { symbol: 'SOL', color: CATEGORICAL[2] },
      ],
      events: [],
      tracked: [],
      rules: [],
      alerts: [],
      highlight: (highlighted) => set({ highlighted }),
      toggleCompare: (symbol) =>
        set((s) => {
          if (s.comparison.some((c) => c.symbol === symbol)) return { comparison: s.comparison.filter((c) => c.symbol !== symbol) };
          if (s.comparison.length >= MAX_COMPARE) return s;
          const used = new Set(s.comparison.map((c) => c.color));
          const color = CATEGORICAL.find((c) => !used.has(c)) ?? CATEGORICAL[0];
          return { comparison: [...s.comparison, { symbol, color }] };
        }),
      pushEvent: (e) => {
        const { tracked, rules } = get();
        const hits = matchAlerts(e, tracked, rules).map((reason) => ({ id: uid('al_'), time: e.time, reason, event: e }));
        set((s) => ({ events: [e, ...s.events].slice(0, MAX_EVENTS), alerts: hits.length ? [...hits, ...s.alerts].slice(0, 50) : s.alerts }));
        return hits;
      },
      toggleTrack: (e) =>
        set((s) => {
          const existing = s.tracked.find((t) => t.sourceEventId === e.id);
          if (existing) return { tracked: s.tracked.filter((t) => t !== existing) };
          const t: TrackedPattern = { id: uid('trk_'), symbol: e.symbol, type: e.type, network: e.network, sourceEventId: e.id };
          return { tracked: [...s.tracked, t], alerts: [{ id: uid('al_'), time: Date.now(), reason: `Now tracking · ${e.symbol} ${e.type.replace('_', ' ')} on ${e.network}`, event: e }, ...s.alerts] };
        }),
      addRule: (symbol, thresholdUsd) => set((s) => ({ rules: [...s.rules, { id: uid('rule_'), symbol, thresholdUsd }] })),
      removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      clearAlerts: () => set({ alerts: [] }),
    }),
    { name: 'aztex.discovery', partialize: (s) => ({ rules: s.rules, tracked: s.tracked, comparison: s.comparison }) },
  ),
);
