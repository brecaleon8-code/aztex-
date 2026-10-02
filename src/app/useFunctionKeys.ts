import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NAV } from './TopBar';

/** F1–F5 jump between modules; "/" or Esc-then-typing focuses the command line. */
export function useFunctionKeys() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = NAV.find((x) => x.key === e.key);
      if (n && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        navigate(n.to);
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
