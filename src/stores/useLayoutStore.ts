import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PanelId = 'watchlist' | 'chart' | 'orderbook' | 'tape' | 'ticket' | 'positions' | 'flow' | 'pnl' | 'news' | 'orders';
export const ALL_PANELS: PanelId[] = ['watchlist', 'chart', 'orderbook', 'tape', 'ticket', 'positions', 'orders', 'flow', 'pnl', 'news'];

/**
 * Workspaces curate which panels are on screen so the terminal stays data-rich without showing
 * everything at once. Each workspace keeps its own panel order; panels can be added/removed.
 */
export type WorkspaceId = 'trade' | 'flow' | 'monitor';
export const WORKSPACES: { id: WorkspaceId; label: string; hint: string }[] = [
  { id: 'trade', label: 'Trade', hint: 'Chart, ticket, book and positions' },
  { id: 'flow', label: 'Order flow', hint: 'Tape, aggressor flow and liquidity' },
  { id: 'monitor', label: 'Monitor', hint: 'Portfolio, P/L and news' },
];
export const DEFAULT_WORKSPACES: Record<WorkspaceId, PanelId[]> = {
  trade: ['watchlist', 'chart', 'ticket', 'orderbook', 'positions', 'orders'],
  flow: ['chart', 'orderbook', 'tape', 'flow', 'ticket'],
  monitor: ['watchlist', 'positions', 'pnl', 'news'],
};
/** Back-compat: the Trade workspace's default order. */
export const DEFAULT_PANEL_ORDER = DEFAULT_WORKSPACES.trade;
export const DEFAULT_CHART_HEIGHT = 420;
export const MAXIMIZED_CHART_HEIGHT = 580;

interface LayoutState {
  workspace: WorkspaceId;
  workspaces: Record<WorkspaceId, PanelId[]>;
  chartHeight: number;
  chartMaximized: boolean;
  setWorkspace: (w: WorkspaceId) => void;
  movePanel: (id: PanelId, before: PanelId) => void;
  togglePanel: (id: PanelId) => void;
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
      workspace: 'trade',
      workspaces: DEFAULT_WORKSPACES,
      chartHeight: DEFAULT_CHART_HEIGHT,
      chartMaximized: false,
      setWorkspace: (workspace) => set({ workspace }),
      movePanel: (id, before) => set((s) => ({ workspaces: { ...s.workspaces, [s.workspace]: reorder(s.workspaces[s.workspace], id, before) } })),
      togglePanel: (id) =>
        set((s) => {
          const cur = s.workspaces[s.workspace];
          const next = cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id];
          return { workspaces: { ...s.workspaces, [s.workspace]: next } };
        }),
      setChartHeight: (h) => set({ chartHeight: Math.round(Math.min(900, Math.max(220, h))) }),
      toggleChartMaximized: () =>
        set((s) => ({
          chartMaximized: !s.chartMaximized,
          chartHeight: !s.chartMaximized ? Math.max(s.chartHeight, MAXIMIZED_CHART_HEIGHT) : DEFAULT_CHART_HEIGHT,
        })),
      resetLayout: () => set((s) => ({ workspaces: { ...s.workspaces, [s.workspace]: DEFAULT_WORKSPACES[s.workspace] }, chartHeight: DEFAULT_CHART_HEIGHT, chartMaximized: false })),
    }),
    {
      name: 'aztex.layout',
      version: 4,
      migrate: (state, version) => {
        // v3 → v4: keep the user's arrangement and add the new Orders & fills blotter to Trade.
        const s = state as Partial<LayoutState> | undefined;
        if (version === 3 && s?.workspaces?.trade) {
          const trade = s.workspaces.trade.includes('orders') ? s.workspaces.trade : [...s.workspaces.trade, 'orders' as PanelId];
          return { ...s, workspaces: { ...s.workspaces, trade } } as LayoutState;
        }
        return { workspace: 'trade', workspaces: DEFAULT_WORKSPACES, chartHeight: DEFAULT_CHART_HEIGHT, chartMaximized: false } as LayoutState;
      },
    },
  ),
);
