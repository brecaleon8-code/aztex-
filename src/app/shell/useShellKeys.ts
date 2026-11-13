import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '@/workspace/useWorkspaceStore';
import { NEW_TAB_EVENT, openChartWindow } from '../useChartShortcuts';
import type { Scope } from '@/workspace/types';

/** Ctrl+1…9 switch workspace tabs of the current app; Alt+Shift+T opens a chart window. */
export function useShellKeys(scope: Scope | null) {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || !/^Digit[1-9]$/.test(e.code)) return;
      const s = useWorkspaceStore.getState();
      const sc = scope ?? 'terminal';
      const tab = s.workspaces.filter((w) => w.scope === sc)[Number(e.code.slice(5)) - 1];
      if (!tab) return;
      e.preventDefault();
      s.setActive(sc, tab.id);
      if (!scope) navigate('/terminal');
    };
    const onNewChart = () => {
      if (scope !== 'terminal') navigate('/terminal');
      requestAnimationFrame(openChartWindow);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(NEW_TAB_EVENT, onNewChart);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(NEW_TAB_EVENT, onNewChart);
    };
  }, [scope, navigate]);
}
