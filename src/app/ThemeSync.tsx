import { useEffect } from 'react';
import { useThemeStore } from '@/stores/useThemeStore';

/** Mirrors theme + Appearance colors onto <html> so CSS custom properties do the switching. */
export function ThemeSync() {
  const theme = useThemeStore((s) => s.theme);
  const colors = useThemeStore((s) => s.colors);
  const followSystem = useThemeStore((s) => s.followSystem);
  useEffect(() => {
    if (!followSystem || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => useThemeStore.getState().applySystemTheme(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [followSystem]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const st = document.documentElement.style;
    st.setProperty('--bull', colors.bull);
    st.setProperty('--bear', colors.bear);
    st.setProperty('--profit', colors.profit);
    st.setProperty('--loss', colors.loss);
  }, [colors]);
  return null;
}
