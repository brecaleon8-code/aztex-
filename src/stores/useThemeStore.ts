import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppearanceColors } from '@/types';

export type Theme = 'dark' | 'light';
export type Platform = 'website' | 'mobile' | 'terminal';

export const DEFAULT_COLORS: AppearanceColors = {
  bull: '#00D26A',
  bear: '#FF3B3B',
  profit: '#00D26A',
  loss: '#FF3B3B',
};

/** Fixed categorical palette — independent of theme and of P/L colors (spec §3). */
/** Terminal series colors: amber, cyan, magenta, yellow, white, coral. */
export const CATEGORICAL = ['#FFA028', '#3DC7F5', '#E066FF', '#FFD60A', '#E6E6E6', '#FF7F50'];

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
    { name: 'aztex.theme', version: 3, migrate: (s) => ({ ...(s as ThemeState), colors: DEFAULT_COLORS }) },
  ),
);
