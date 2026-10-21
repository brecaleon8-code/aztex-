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
  /** Follow the operating system's light/dark setting ("System" in the account menu). */
  followSystem: boolean;
  followSystemTheme: () => void;
  /** ThemeSync applies the OS preference while following it. */
  applySystemTheme: (dark: boolean) => void;
  platform: Platform;
  colors: AppearanceColors;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setPlatform: (p: Platform) => void;
  setColor: (k: keyof AppearanceColors, hex: string) => void;
  setColors: (c: AppearanceColors) => void;
  resetColors: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      followSystem: false,
      followSystemTheme: () =>
        set({ followSystem: true, theme: typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark' }),
      applySystemTheme: (dark) => set((s) => (s.followSystem ? { theme: dark ? 'dark' : 'light' } : s)),
      platform: 'website',
      colors: DEFAULT_COLORS,
      setTheme: (theme) => set({ theme, followSystem: false }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark', followSystem: false })),
      setPlatform: (platform) => set({ platform }),
      setColor: (k, hex) => set((s) => ({ colors: { ...s.colors, [k]: hex } })),
      setColors: (colors) => set({ colors: { ...colors } }),
      resetColors: () => set({ colors: DEFAULT_COLORS }),
    }),
    { name: 'aztex.theme', version: 4, migrate: (s) => ({ ...(s as ThemeState), colors: DEFAULT_COLORS }) },
  ),
);
