import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppearanceColors } from '@/types';

export type Theme = 'dark' | 'light';
export type Platform = 'website' | 'mobile' | 'terminal';

export const DEFAULT_COLORS: AppearanceColors = {
  bull: '#3FCE84',
  bear: '#F0635A',
  profit: '#3FCE84',
  loss: '#F0635A',
};

/** Fixed categorical palette — independent of theme and of P/L colors (spec §3). */
export const CATEGORICAL = ['#C8973F', '#5B8DBE', '#9B7FC7', '#4FA8A8', '#E0785A', '#6FBF73'];

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
    { name: 'aztex.theme' },
  ),
);
