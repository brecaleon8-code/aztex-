import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACCOUNT_NAV, NAV } from './TopBar';
import { openStudio } from './studioLauncher';
import { useUiStore } from '@/stores/useUiStore';

/**
 * F1–F7 jump between modules (F4 opens the Studio app, like MetaEditor); F8 opens the chart's
 * settings. "/" focuses the command line.
 */
export function useFunctionKeys() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      const n = [...NAV, ACCOUNT_NAV].find((x) => x.key === e.key);
      if (n && plain) {
        e.preventDefault();
        navigate(n.to);
        return;
      }
      if (e.key === 'F4' && plain) {
        e.preventDefault();
        openStudio();
        return;
      }
      if (e.key === 'F8' && plain) {
        e.preventDefault();
        if (!location.pathname.startsWith('/terminal')) navigate('/terminal');
        // Let the terminal mount first so the menu can sit by the chart.
        requestAnimationFrame(() => useUiStore.getState().openChartMenu());
        return;
      }
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Command line"]')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
