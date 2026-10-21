import { create } from 'zustand';

/** Transient, app-level UI state (modals, menus). Not persisted. */
interface UiState {
  deposit: { open: boolean; asset?: string };
  openDeposit: (asset?: string) => void;
  closeDeposit: () => void;
  /** Chart settings menu (the chart's gear, F8 / Ctrl+, or right-click › Settings…): where it opens. */
  chartMenu: { x: number; y: number } | null;
  openChartMenu: (at?: { x: number; y: number }) => void;
  closeChartMenu: () => void;
  /** Right-click quick actions on a chart, at the price under the pointer (null outside the plot). */
  chartContext: { x: number; y: number; symbol: string; price: number | null } | null;
  openChartContext: (c: { x: number; y: number; symbol: string; price: number | null }) => void;
  closeChartContext: () => void;
  /** Object tree: everything on the focused chart (indicators, drawings, alerts, orders). */
  objectTree: { x: number; y: number } | null;
  openObjectTree: (at?: { x: number; y: number }) => void;
  closeObjectTree: () => void;
  /** Keyboard shortcuts sheet (?). */
  shortcuts: boolean;
  setShortcuts: (open: boolean) => void;
}

/** Without a click position, open by the chart's top-right corner (or under the top bar). */
function defaultMenuSpot(): { x: number; y: number } {
  const chart = typeof document !== 'undefined' ? document.querySelector('[data-testid="chart-panel"]') : null;
  if (chart) {
    const r = chart.getBoundingClientRect();
    return { x: r.right - 12, y: r.top + 44 };
  }
  return { x: (typeof window !== 'undefined' ? window.innerWidth : 1200) - 24, y: 104 };
}

export const useUiStore = create<UiState>((set) => ({
  deposit: { open: false },
  openDeposit: (asset) => set({ deposit: { open: true, asset } }),
  closeDeposit: () => set({ deposit: { open: false } }),
  chartMenu: null,
  openChartMenu: (at) => set({ chartMenu: at ?? defaultMenuSpot() }),
  closeChartMenu: () => set({ chartMenu: null }),
  chartContext: null,
  openChartContext: (chartContext) => set({ chartContext, chartMenu: null, objectTree: null }),
  closeChartContext: () => set({ chartContext: null }),
  objectTree: null,
  openObjectTree: (at) => set({ objectTree: at ?? defaultMenuSpot(), chartContext: null }),
  closeObjectTree: () => set({ objectTree: null }),
  shortcuts: false,
  setShortcuts: (shortcuts) => set({ shortcuts }),
}));
