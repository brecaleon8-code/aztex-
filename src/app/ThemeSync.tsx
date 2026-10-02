import { useEffect } from 'react';
import { useThemeStore } from '@/stores/useThemeStore';

/** Mirrors theme + Appearance colors onto <html> so CSS custom properties do the switching. */
export function ThemeSync() {
  const theme = useThemeStore((s) => s.theme);
  const colors = useThemeStore((s) => s.colors);
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
