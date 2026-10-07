import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '@/lib/format';
import { STRATEGY_TEMPLATES, type StrategyDef } from '@/lib/strategy/backtest';
import { CATEGORICAL } from './useThemeStore';

export interface UserIndicator {
  id: string;
  name: string;
  formula: string;
  type: 'overlay' | 'oscillator';
  color: string;
  notes?: string;
}

interface StudioState {
  indicators: UserIndicator[];
  strategies: StrategyDef[];
  /** Strategy whose entry/exit signals are drawn on the Terminal chart. */
  chartStrategyId: string | null;
  saveIndicator: (i: Omit<UserIndicator, 'id'> & { id?: string }) => UserIndicator;
  deleteIndicator: (id: string) => void;
  saveStrategy: (s: Omit<StrategyDef, 'id'> & { id?: string }) => StrategyDef;
  deleteStrategy: (id: string) => void;
  setChartStrategy: (id: string | null) => void;
}

const SEED_INDICATORS: UserIndicator[] = [
  { id: 'ui_spread', name: 'EMA spread %', formula: '(ema(close, 9) - ema(close, 21)) / close * 100', type: 'oscillator', color: CATEGORICAL[2], notes: 'Momentum: distance between fast and slow EMA, as % of price.' },
  { id: 'ui_mid', name: 'Donchian mid (20)', formula: '(highest(high, 20) + lowest(low, 20)) / 2', type: 'overlay', color: CATEGORICAL[3] },
];
const SEED_STRATEGIES: StrategyDef[] = STRATEGY_TEMPLATES.slice(0, 2).map((t, i) => ({ ...t, id: `st_seed_${i}`, color: CATEGORICAL[i + 1] }));

export const useStudioStore = create<StudioState>()(
  persist(
    (set) => ({
      indicators: SEED_INDICATORS,
      strategies: SEED_STRATEGIES,
      chartStrategyId: null,
      saveIndicator: (i) => {
        const item: UserIndicator = { ...i, id: i.id ?? uid('ui_') };
        set((s) => ({ indicators: s.indicators.some((x) => x.id === item.id) ? s.indicators.map((x) => (x.id === item.id ? item : x)) : [item, ...s.indicators] }));
        return item;
      },
      deleteIndicator: (id) => set((s) => ({ indicators: s.indicators.filter((x) => x.id !== id) })),
      saveStrategy: (st) => {
        const item: StrategyDef = { ...st, id: st.id ?? uid('st_') };
        set((s) => ({ strategies: s.strategies.some((x) => x.id === item.id) ? s.strategies.map((x) => (x.id === item.id ? item : x)) : [item, ...s.strategies] }));
        return item;
      },
      deleteStrategy: (id) => set((s) => ({ strategies: s.strategies.filter((x) => x.id !== id), chartStrategyId: s.chartStrategyId === id ? null : s.chartStrategyId })),
      setChartStrategy: (chartStrategyId) => set({ chartStrategyId }),
    }),
    { name: 'aztex.studio' },
  ),
);
