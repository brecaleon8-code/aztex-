import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PanelId = 'watchlist' | 'chart' | 'orderbook' | 'tape' | 'ticket' | 'positions' | 'flow' | 'pnl' | 'news';
export const DEFAULT_PANEL_ORDER: PanelId[] = ['watchlist', 'chart', 'orderbook', 'tape', 'ticket', 'positions', 'flow', 'news', 'pnl'];
export const DEFAULT_CHART_HEIGHT = 400;
export const MAXIMIZED_CHART_HEIGHT = 560;

interface LayoutState {
  panelOrder: PanelId[];
  chartHeight: number;
  chartMaximized: boolean;
  movePanel: (id: PanelId, before: PanelId) => void;
  setChartHeight: (h: number) => void;
  toggleChartMaximized: () => void;
  resetLayout: () => void;
}

/** Moves `id` into the slot currently held by `target` (pure; exported for tests). */
export function reorder(order: PanelId[], id: PanelId, target: PanelId): PanelId[] {
  if (id === target) return order;
  const from = order.indexOf(id);
  const to = order.indexOf(target);
  if (from < 0 || to < 0) return order;
  const next = order.filter((p) => p !== id);
  next.splice(to, 0, id);
  return next;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      panelOrder: DEFAULT_PANEL_ORDER,
      chartHeight: DEFAULT_CHART_HEIGHT,
      chartMaximized: false,
      movePanel: (id, before) => set((s) => ({ panelOrder: reorder(s.panelOrder, id, before) })),
      setChartHeight: (h) => set({ chartHeight: Math.round(Math.min(900, Math.max(220, h))) }),
      toggleChartMaximized: () =>
        set((s) => ({
          chartMaximized: !s.chartMaximized,
          chartHeight: !s.chartMaximized ? Math.max(s.chartHeight, MAXIMIZED_CHART_HEIGHT) : DEFAULT_CHART_HEIGHT,
        })),
      resetLayout: () => set({ panelOrder: DEFAULT_PANEL_ORDER, chartHeight: DEFAULT_CHART_HEIGHT, chartMaximized: false }),
    }),
    { name: 'aztex.layout', version: 2, migrate: () => ({ panelOrder: DEFAULT_PANEL_ORDER, chartHeight: DEFAULT_CHART_HEIGHT, chartMaximized: false }) },
  ),
);
