import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppearanceColors } from '@/types';

export type Theme = 'dark' | 'light';
export type Platform = 'website' | 'mobile' | 'terminal';

export const DEFAULT_COLORS: AppearanceColors = {
  bull: '#3DDC97',
  bear: '#FF5D5D',
  profit: '#3DDC97',
  loss: '#FF5D5D',
};

/** Fixed categorical palette — independent of theme and of P/L colors (spec §3). */
/** Data-series colors: silver, steel, lavender, sand, rose, slate — no greens/reds, so they never read as P/L or brand. */
export const CATEGORICAL = ['#CFD3D8', '#7FA7CF', '#B39CDB', '#D2AE72', '#DDA1BC', '#93A8BF'];

interface ThemeState {
  theme: Theme;
  platform: Platform;
  colors: AppearanceColors;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setPlatform: (p: Platform) => void;
  setColor: (k: keyof AppearanceColors, hex: string) => void;
  resetColors: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      platform: 'website',
      colors: DEFAULT_COLORS,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setPlatform: (platform) => set({ platform }),
      setColor: (k, hex) => set((s) => ({ colors: { ...s.colors, [k]: hex } })),
      resetColors: () => set({ colors: DEFAULT_COLORS }),
    }),
    { name: 'aztex.theme', version: 4, migrate: (s) => ({ ...(s as ThemeState), colors: DEFAULT_COLORS }) },
  ),
);
