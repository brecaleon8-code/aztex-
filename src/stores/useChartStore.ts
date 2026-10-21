import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChartMode, Drawing, DrawingTool, IndicatorInstance } from '@/types';
import { uid } from '@/lib/format';

interface ChartState {
  mode: ChartMode;
  tool: DrawingTool;
  indicators: IndicatorInstance[];
  /** Drawings on the focused chart (its symbol:timeframe is `drawingsKey`). */
  drawings: Drawing[];
  drawingsKey: string;
  /** Drawings of the other symbol/timeframe charts this session, so switching focus never loses them. */
  drawingStash: Record<string, Drawing[]>;
  /** The focused chart changed: park its drawings and bring back the new one's. */
  switchDrawings: (key: string) => void;
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
  /** Move / edit a drawing in place (call `snapshotDrawings` once before a drag so it can be undone). */
  updateDrawing: (id: string, d: Drawing) => void;
  snapshotDrawings: () => void;
  /** Ctrl+Z: step back through drawing changes on the focused chart. */
  undoDrawings: () => boolean;
  drawingUndo: Drawing[][];
  selectedDrawing: string | null;
  selectDrawing: (id: string | null) => void;
  /** Snap drawing points to the nearest open/high/low/close. */
  magnet: boolean;
  toggleMagnet: () => void;
  /** Locked drawings can't be selected, moved or removed (new ones can still be added). */
  drawingsLocked: boolean;
  toggleDrawingsLocked: () => void;
  drawingsHidden: boolean;
  toggleDrawingsHidden: () => void;
}

const UNDO_MAX = 50;
const pushUndo = (s: { drawings: Drawing[]; drawingUndo: Drawing[][] }) => [...s.drawingUndo, s.drawings].slice(-UNDO_MAX);

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
      drawingsKey: '',
      drawingStash: {},
      switchDrawings: (key) =>
        set((s) => {
          if (s.drawingsKey === key) return s;
          const drawingStash = { ...s.drawingStash };
          if (s.drawingsKey) drawingStash[s.drawingsKey] = s.drawings;
          const drawings = drawingStash[key] ?? [];
          delete drawingStash[key];
          return { drawings, drawingStash, drawingsKey: key, drawingUndo: [], selectedDrawing: null };
        }),
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
      addDrawing: (d) => set((s) => ({ drawings: [...s.drawings, { ...d, id: uid('drw_') }], drawingUndo: pushUndo(s), drawingsHidden: false })),
      removeDrawing: (id) => set((s) => ({ drawings: s.drawings.filter((d) => d.id !== id), drawingUndo: pushUndo(s), selectedDrawing: s.selectedDrawing === id ? null : s.selectedDrawing })),
      clearDrawings: () => set((s) => (s.drawings.length ? { drawings: [], drawingUndo: pushUndo(s), selectedDrawing: null } : s)),
      updateDrawing: (id, d) => set((s) => ({ drawings: s.drawings.map((x) => (x.id === id ? { ...d, id } : x)) })),
      snapshotDrawings: () => set((s) => ({ drawingUndo: pushUndo(s) })),
      undoDrawings: () => {
        const prev = get().drawingUndo.at(-1);
        if (!prev) return false;
        set((s) => ({ drawings: prev, drawingUndo: s.drawingUndo.slice(0, -1), selectedDrawing: null }));
        return true;
      },
      drawingUndo: [],
      selectedDrawing: null,
      selectDrawing: (selectedDrawing) => set({ selectedDrawing }),
      magnet: false,
      toggleMagnet: () => set((s) => ({ magnet: !s.magnet })),
      drawingsLocked: false,
      toggleDrawingsLocked: () => set((s) => ({ drawingsLocked: !s.drawingsLocked, selectedDrawing: null })),
      drawingsHidden: false,
      toggleDrawingsHidden: () => set((s) => ({ drawingsHidden: !s.drawingsHidden, selectedDrawing: null })),
    }),
    {
      name: 'aztex.chart',
      version: 4,
      migrate: () => ({}),
      partialize: (s) => ({ mode: s.mode, indicators: s.indicators, profile: s.profile, bookProfile: s.bookProfile, magnet: s.magnet, drawingsLocked: s.drawingsLocked, drawingsHidden: s.drawingsHidden }),
    },
  ),
);
