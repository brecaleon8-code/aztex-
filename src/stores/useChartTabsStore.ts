import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Timeframe } from '@/types';
import { uid } from '@/lib/format';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';

/**
 * Chart tabs, TradingView style: each tab is a chart page for a crypto with its own layout of
 * 1–4 charts. The focused pane of the active tab *is* the terminal's selected symbol/timeframe
 * (the ticket, book and tape follow it); see `startChartTabsSync`.
 */
export type ChartLayoutId = '1' | '2v' | '2h' | '3' | '4';
export const CHART_LAYOUTS: { id: ChartLayoutId; label: string; panes: number }[] = [
  { id: '1', label: 'Single chart', panes: 1 },
  { id: '2v', label: '2 charts · side by side', panes: 2 },
  { id: '2h', label: '2 charts · stacked', panes: 2 },
  { id: '3', label: '3 charts · 1 large + 2', panes: 3 },
  { id: '4', label: '4 charts · 2 × 2 grid', panes: 4 },
];
export const MAX_PANES = 4;
export const MAX_TABS = 12;

export interface ChartPane {
  symbol: string;
  tf: Timeframe;
}
export interface ChartTab {
  id: string;
  layout: ChartLayoutId;
  /** Always MAX_PANES long, so switching layouts keeps every pane's symbol and timeframe. */
  panes: ChartPane[];
  /** Index of the focused pane. */
  active: number;
}

export const paneCount = (l: ChartLayoutId) => CHART_LAYOUTS.find((x) => x.id === l)?.panes ?? 1;
export const focusedPane = (t: ChartTab): ChartPane => t.panes[t.active] ?? t.panes[0];

/** Pads to MAX_PANES with symbols not already on the page (universe order), on the first pane's timeframe. */
export function fillPanes(panes: ChartPane[]): ChartPane[] {
  const out = panes.slice(0, MAX_PANES);
  const tf = out[0]?.tf ?? '1m';
  const used = new Set(out.map((p) => p.symbol));
  for (const a of ASSET_UNIVERSE) {
    if (out.length >= MAX_PANES) break;
    if (!used.has(a.symbol)) {
      out.push({ symbol: a.symbol, tf });
      used.add(a.symbol);
    }
  }
  return out;
}

export function makeTab(symbol: string, tf: Timeframe, layout: ChartLayoutId = '1'): ChartTab {
  return { id: uid('tab_'), layout, panes: fillPanes([{ symbol, tf }]), active: 0 };
}

/** A fresh set of tabs: the given symbol first, then a couple of majors to switch between. */
export function defaultTabs(symbol: string, tf: Timeframe): ChartTab[] {
  const extra = ['BTC', 'ETH', 'SOL'].filter((s) => s !== symbol).slice(0, 2);
  return [makeTab(symbol, tf), ...extra.map((s) => makeTab(s, tf))];
}

interface ChartTabsState {
  tabs: ChartTab[];
  activeTab: string;
  /** Opens a tab for `symbol` (or switches to the one already showing it) and focuses it. */
  openTab: (symbol: string, tf: Timeframe) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  setLayout: (layout: ChartLayoutId) => void;
  activatePane: (index: number) => void;
  setPaneSymbol: (index: number, symbol: string) => void;
  setPaneTf: (index: number, tf: Timeframe) => void;
  /** Mirrors an outside change of the selected symbol/timeframe (watchlist, CLI, palette…) into the focused pane. */
  syncFocused: (symbol: string, tf: Timeframe) => void;
  /** First run: seed tabs from the terminal's current symbol. */
  ensureTabs: (symbol: string, tf: Timeframe) => void;
}

const patchActive = (s: ChartTabsState, fn: (t: ChartTab) => ChartTab): Partial<ChartTabsState> => ({
  tabs: s.tabs.map((t) => (t.id === s.activeTab ? fn(t) : t)),
});

export const useChartTabsStore = create<ChartTabsState>()(
  persist(
    (set) => ({
      tabs: [],
      activeTab: '',
      openTab: (symbol, tf) =>
        set((s) => {
          const existing = s.tabs.find((t) => focusedPane(t).symbol === symbol);
          if (existing) return { activeTab: existing.id };
          if (s.tabs.length >= MAX_TABS) return s;
          const tab = makeTab(symbol, tf);
          return { tabs: [...s.tabs, tab], activeTab: tab.id };
        }),
      closeTab: (id) =>
        set((s) => {
          if (s.tabs.length <= 1) return s;
          const i = s.tabs.findIndex((t) => t.id === id);
          if (i < 0) return s;
          const tabs = s.tabs.filter((t) => t.id !== id);
          const activeTab = s.activeTab === id ? (tabs[i] ?? tabs[i - 1]).id : s.activeTab;
          return { tabs, activeTab };
        }),
      activateTab: (id) => set((s) => (s.tabs.some((t) => t.id === id) ? { activeTab: id } : s)),
      setLayout: (layout) => set((s) => patchActive(s, (t) => ({ ...t, layout, active: t.active < paneCount(layout) ? t.active : 0 }))),
      activatePane: (index) => set((s) => patchActive(s, (t) => (index >= 0 && index < paneCount(t.layout) ? { ...t, active: index } : t))),
      setPaneSymbol: (index, symbol) => set((s) => patchActive(s, (t) => ({ ...t, panes: t.panes.map((p, i) => (i === index ? { ...p, symbol } : p)) }))),
      setPaneTf: (index, tf) => set((s) => patchActive(s, (t) => ({ ...t, panes: t.panes.map((p, i) => (i === index ? { ...p, tf } : p)) }))),
      syncFocused: (symbol, tf) =>
        set((s) => {
          const tab = s.tabs.find((t) => t.id === s.activeTab);
          if (!tab) return s;
          const f = focusedPane(tab);
          if (f.symbol === symbol && f.tf === tf) return s;
          return patchActive(s, (t) => ({ ...t, panes: t.panes.map((p, i) => (i === t.active ? { symbol, tf } : p)) }));
        }),
      ensureTabs: (symbol, tf) =>
        set((s) => {
          if (s.tabs.length && s.tabs.some((t) => t.id === s.activeTab)) return s;
          if (s.tabs.length) return { activeTab: s.tabs[0].id };
          const tabs = defaultTabs(symbol, tf);
          return { tabs, activeTab: tabs[0].id };
        }),
    }),
    { name: 'aztex.chartTabs', version: 1, partialize: (s) => ({ tabs: s.tabs, activeTab: s.activeTab }) },
  ),
);

export const activeTabOf = (s: { tabs: ChartTab[]; activeTab: string }) => s.tabs.find((t) => t.id === s.activeTab) ?? null;
