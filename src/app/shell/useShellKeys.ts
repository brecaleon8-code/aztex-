import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Actions } from 'flexlayout-react';
import { activeWorkspace, useWorkspaceStore } from '@/workspace/useWorkspaceStore';
import { dockModels } from '@/workspace/dockModels';
import { NEW_TAB_EVENT, openChartWindow } from '../useChartShortcuts';
import type { Scope } from '@/workspace/types';

const typing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

/** Brings the active workspace's News & events window to the front, or adds one. */
function showNews(scope: Scope) {
  const s = useWorkspaceStore.getState();
  const ws = activeWorkspace(scope);
  const news = ws && Object.values(ws.windows).find((w) => w.type === 'news');
  if (!ws || !news) {
    s.addWindow('news', { scope });
    return;
  }
  dockModels.get(ws.id)?.doAction(Actions.selectTab(news.id));
  s.focusWindow(news.id);
}

/**
 * Ctrl+1…9 switch workspace tabs of the current app; Alt+N shows the News & events window;
 * Alt+Shift+T opens a chart window.
 */
export function useShellKeys(scope: Scope | null) {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyN' && !typing(e.target)) {
        e.preventDefault();
        if (!scope) navigate('/terminal');
        const sc = scope ?? 'terminal';
        requestAnimationFrame(() => showNews(sc));
        return;
      }
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
