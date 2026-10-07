import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EconEvent, Impact, NewsCategory, NewsStory } from '@/lib/news/types';

export type DockSide = 'left' | 'right';
export type NewsTab = 'feed' | 'calendar';
export const NEWS_CATEGORIES: { id: NewsCategory; label: string }[] = [
  { id: 'crypto', label: 'Crypto' },
  { id: 'macro', label: 'Macro' },
  { id: 'regulation', label: 'Regulation' },
  { id: 'onchain', label: 'On-chain' },
  { id: 'markets', label: 'Markets' },
];
export const DOCK_MIN_W = 280;
export const DOCK_MAX_W = 560;
const MAX_STORIES = 250;

interface NewsState {
  // Live data (not persisted)
  stories: NewsStory[];
  events: EconEvent[];
  // Preferences (persisted)
  pinned: boolean;
  side: DockSide;
  collapsed: boolean;
  width: number;
  tab: NewsTab;
  categories: NewsCategory[];
  mineOnly: boolean;
  minImpact: Impact;
  calMinImpact: Impact;
  alerts: boolean;
  lastSeen: number;

  addStories: (s: NewsStory[]) => void;
  setEvents: (e: EconEvent[]) => void;
  updateEvent: (e: EconEvent) => void;
  toggleDock: () => void;
  setPinned: (v: boolean) => void;
  setSide: (s: DockSide) => void;
  setCollapsed: (v: boolean) => void;
  setWidth: (w: number) => void;
  setTab: (t: NewsTab) => void;
  toggleCategory: (c: NewsCategory) => void;
  setAllCategories: () => void;
  setMineOnly: (v: boolean) => void;
  setMinImpact: (i: Impact) => void;
  setCalMinImpact: (i: Impact) => void;
  setAlerts: (v: boolean) => void;
  markSeen: () => void;
}

export const useNewsStore = create<NewsState>()(
  persist(
    (set) => ({
      stories: [],
      events: [],
      pinned: false,
      side: 'right',
      collapsed: false,
      width: 360,
      tab: 'feed',
      categories: NEWS_CATEGORIES.map((c) => c.id),
      mineOnly: false,
      minImpact: 1,
      calMinImpact: 1,
      alerts: true,
      lastSeen: Date.now() - 20 * 60_000, // first visit: only the last 20 minutes count as new

      addStories: (incoming) =>
        set((s) => {
          const seen = new Set(s.stories.map((x) => x.id));
          const fresh = incoming.filter((x) => !seen.has(x.id));
          if (!fresh.length) return s;
          return { stories: [...fresh, ...s.stories].sort((a, b) => b.time - a.time).slice(0, MAX_STORIES) };
        }),
      setEvents: (events) => set({ events }),
      updateEvent: (e) => set((s) => ({ events: s.events.map((x) => (x.id === e.id ? e : x)) })),
      toggleDock: () => set((s) => (s.pinned && !s.collapsed ? { pinned: false } : { pinned: true, collapsed: false, lastSeen: Date.now() })),
      setPinned: (pinned) => set(pinned ? { pinned, collapsed: false, lastSeen: Date.now() } : { pinned }),
      setSide: (side) => set({ side }),
      setCollapsed: (collapsed) => set(collapsed ? { collapsed } : { collapsed, lastSeen: Date.now() }),
      setWidth: (w) => set({ width: Math.round(Math.min(DOCK_MAX_W, Math.max(DOCK_MIN_W, w))) }),
      setTab: (tab) => set({ tab }),
      toggleCategory: (c) =>
        set((s) => {
          const all = s.categories.length === NEWS_CATEGORIES.length;
          // From "all", clicking a chip isolates it; otherwise toggle, never leaving zero selected.
          if (all) return { categories: [c] };
          const next = s.categories.includes(c) ? s.categories.filter((x) => x !== c) : [...s.categories, c];
          return { categories: next.length ? next : NEWS_CATEGORIES.map((x) => x.id) };
        }),
      setAllCategories: () => set({ categories: NEWS_CATEGORIES.map((c) => c.id) }),
      setMineOnly: (mineOnly) => set({ mineOnly }),
      setMinImpact: (minImpact) => set({ minImpact }),
      setCalMinImpact: (calMinImpact) => set({ calMinImpact }),
      setAlerts: (alerts) => set({ alerts }),
      markSeen: () => set({ lastSeen: Date.now() }),
    }),
    {
      name: 'aztex.news',
      partialize: ({ stories: _s, events: _e, ...prefs }) => {
        void _s;
        void _e;
        return Object.fromEntries(Object.entries(prefs).filter(([, v]) => typeof v !== 'function'));
      },
    },
  ),
);

/** Stories newer than the last time the dock was opened (for the badge). */
export const unreadCount = (stories: NewsStory[], lastSeen: number) => stories.reduce((n, s) => n + (s.time > lastSeen ? 1 : 0), 0);
