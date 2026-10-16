import { create } from 'zustand';

/** Transient, app-level UI state (modals, menus). Not persisted. */
interface UiState {
  deposit: { open: boolean; asset?: string };
  openDeposit: (asset?: string) => void;
  closeDeposit: () => void;
  /** Chart settings menu (right-click on a chart, the chart's gear, or F8): where it opens. */
  chartMenu: { x: number; y: number } | null;
  openChartMenu: (at?: { x: number; y: number }) => void;
  closeChartMenu: () => void;
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
}));
