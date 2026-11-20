import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Chart height for charts that aren't sized by their container. Windows in the docked workspace
 * (src/workspace) size themselves; their arrangement lives in useWorkspaceStore.
 */
export const DEFAULT_CHART_HEIGHT = 420;

interface LayoutState {
  chartHeight: number;
  setChartHeight: (h: number) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      chartHeight: DEFAULT_CHART_HEIGHT,
      setChartHeight: (h) => set({ chartHeight: Math.round(Math.min(900, Math.max(220, h))) }),
    }),
    {
      name: 'aztex.layout',
      version: 5,
      // v5: the panel grid (workspaces / order / fit) became the docked workspace.
      migrate: (state) => ({ chartHeight: (state as Partial<LayoutState> | undefined)?.chartHeight ?? DEFAULT_CHART_HEIGHT }) as LayoutState,
    },
  ),
);
