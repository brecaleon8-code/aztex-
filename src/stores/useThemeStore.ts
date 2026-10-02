import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppearanceColors } from '@/types';

export type Theme = 'dark' | 'light';
export type Platform = 'website' | 'mobile' | 'terminal';

export const DEFAULT_COLORS: AppearanceColors = {
  bull: '#2EE6A0',
  bear: '#FF5C7A',
  profit: '#2EE6A0',
  loss: '#FF5C7A',
};

/** Fixed categorical palette — independent of theme and of P/L colors (spec §3). */
export const CATEGORICAL = ['#F5B84B', '#4CC9F0', '#9D8CFF', '#3DD6C6', '#FF8A5B', '#B6E35A'];

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
    { name: 'aztex.theme', version: 2, migrate: (s) => ({ ...(s as ThemeState), colors: DEFAULT_COLORS }) },
  ),
);
