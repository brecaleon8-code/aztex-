import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChartMode, Drawing, DrawingTool, IndicatorInstance } from '@/types';
import { uid } from '@/lib/format';

interface ChartState {
  mode: ChartMode;
  tool: DrawingTool;
  indicators: IndicatorInstance[];
  drawings: Drawing[];
  /** Volume-profile (VPVR) overlay on the price pane. */
  profile: boolean;
  toggleProfile: () => void;
  /** Resting order-book liquidity drawn against the price axis. */
  bookProfile: boolean;
  toggleBookProfile: () => void;
  /** Renko box size in price units; null = automatic (ATR 14). */
  renkoBox: number | null;
  setRenkoBox: (b: number | null) => void;
  setMode: (m: ChartMode) => void;
  setTool: (t: DrawingTool) => void;
  addIndicator: (i: Omit<IndicatorInstance, 'id'>) => void;
  removeIndicator: (id: string) => void;
  /** Quick edit from the chart: patch any setting; changes apply live. */
  updateIndicator: (id: string, patch: Partial<Omit<IndicatorInstance, 'id' | 'kind'>>) => void;
  duplicateIndicator: (id: string) => string | null;
  toggleIndicatorHidden: (id: string) => void;
  /** Indicator whose quick-edit popover is open, anchored to a screen rect. */
  editing: { id: string; anchor: { x: number; y: number; w: number; h: number } } | null;
  openEditor: (id: string, el: Element) => void;
  closeEditor: () => void;
  addDrawing: (d: Omit<Drawing, 'id'>) => void;
  removeDrawing: (id: string) => void;
  clearDrawings: () => void;
}

export const useChartStore = create<ChartState>()(
  persist(
    (set, get) => ({
      mode: 'candles',
      tool: 'cursor',
      indicators: [
        { id: 'ema21', kind: 'ema', type: 'overlay', color: '#D2AE72', period: 21 },
        { id: 'vwap', kind: 'vwap', type: 'overlay', color: '#7FA7CF' },
        { id: 'vol', kind: 'volume', type: 'oscillator', color: '#7FA7CF' },
      ],
      drawings: [],
      profile: true,
      toggleProfile: () => set((s) => ({ profile: !s.profile })),
      bookProfile: true,
      toggleBookProfile: () => set((s) => ({ bookProfile: !s.bookProfile })),
      renkoBox: null,
      setRenkoBox: (renkoBox) => set({ renkoBox: renkoBox != null && renkoBox > 0 && Number.isFinite(renkoBox) ? renkoBox : null }),
      setMode: (mode) => set({ mode }),
      setTool: (tool) => set({ tool }),
      addIndicator: (i) => set((s) => ({ indicators: [...s.indicators, { ...i, id: uid('ind_') }] })),
      removeIndicator: (id) => set((s) => ({ indicators: s.indicators.filter((i) => i.id !== id), editing: s.editing?.id === id ? null : s.editing })),
      updateIndicator: (id, patch) => set((s) => ({ indicators: s.indicators.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      duplicateIndicator: (id) => {
        const src = get().indicators.find((i) => i.id === id);
        if (!src) return null;
        const copy = { ...src, id: uid('ind_'), hidden: false };
        set((s) => {
          const at = s.indicators.findIndex((i) => i.id === id);
          return { indicators: [...s.indicators.slice(0, at + 1), copy, ...s.indicators.slice(at + 1)] };
        });
        return copy.id;
      },
      toggleIndicatorHidden: (id) => set((s) => ({ indicators: s.indicators.map((i) => (i.id === id ? { ...i, hidden: !i.hidden } : i)) })),
      editing: null,
      openEditor: (id, el) => {
        const r = el.getBoundingClientRect();
        set((s) => (s.editing?.id === id ? { editing: null } : { editing: { id, anchor: { x: r.left, y: r.top, w: r.width, h: r.height } } }));
      },
      closeEditor: () => set({ editing: null }),
      addDrawing: (d) => set((s) => ({ drawings: [...s.drawings, { ...d, id: uid('drw_') }] })),
      removeDrawing: (id) => set((s) => ({ drawings: s.drawings.filter((d) => d.id !== id) })),
      clearDrawings: () => set({ drawings: [] }),
    }),
    { name: 'aztex.chart', version: 4, migrate: () => ({}), partialize: (s) => ({ mode: s.mode, indicators: s.indicators, profile: s.profile, bookProfile: s.bookProfile }) },
  ),
);
