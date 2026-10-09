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
  addDrawing: (d: Omit<Drawing, 'id'>) => void;
  removeDrawing: (id: string) => void;
  clearDrawings: () => void;
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
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
      removeIndicator: (id) => set((s) => ({ indicators: s.indicators.filter((i) => i.id !== id) })),
      addDrawing: (d) => set((s) => ({ drawings: [...s.drawings, { ...d, id: uid('drw_') }] })),
      removeDrawing: (id) => set((s) => ({ drawings: s.drawings.filter((d) => d.id !== id) })),
      clearDrawings: () => set({ drawings: [] }),
    }),
    { name: 'aztex.chart', version: 4, migrate: () => ({}), partialize: (s) => ({ mode: s.mode, indicators: s.indicators, profile: s.profile, bookProfile: s.bookProfile }) },
  ),
);
