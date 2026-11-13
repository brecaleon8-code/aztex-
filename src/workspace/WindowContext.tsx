import { createContext, useCallback, useContext } from 'react';
import { useMarketStore } from '@/stores/useMarketStore';
import { useWorkspaceStore } from './useWorkspaceStore';
import { contextOf, symbolOf, useLinkStore } from './useLinkStore';
import type { WindowState } from './types';

/** Which dock window a component is rendered in (null outside the dock, e.g. the phone app). */
export const WindowContext = createContext<{ wsId: string; winId: string } | null>(null);

export const useWindowRef = () => useContext(WindowContext);

/** This window's state (null outside the dock). */
export function useWindow(): WindowState | null {
  const ref = useContext(WindowContext);
  return useWorkspaceStore((s) => (ref ? (s.workspaces.find((w) => w.id === ref.wsId)?.windows[ref.winId] ?? null) : null));
}

/**
 * The symbol this window shows: its link group's, or its own when unlinked. Outside the dock it is
 * the terminal's selected symbol, so components work unchanged in the phone app.
 */
export function useWindowSymbol(): string {
  const win = useWindow();
  const groups = useLinkStore((s) => s.groups);
  const selected = useMarketStore((s) => s.selected);
  return win ? symbolOf(win, groups, selected) : selected;
}

/** Sets this window's symbol (its whole link group when linked) and streams it. */
export function useSetWindowSymbol(): (symbol: string) => void {
  const win = useWindow();
  return useCallback(
    (symbol: string) => {
      if (!win) return useMarketStore.getState().select(symbol);
      if (win.linkGroup) useLinkStore.getState().setGroup(win.linkGroup, symbol);
      else useWorkspaceStore.getState().patchWindow(win.id, { settings: { symbol } });
      useLinkStore.getState().activate(contextOf(win));
    },
    [win],
  );
}

/** This window's settings and a patcher (no-op outside the dock). */
export function useWindowSettings<T extends Record<string, unknown>>(): [Partial<T>, (patch: Partial<T>) => void] {
  const win = useWindow();
  const patch = useCallback((p: Partial<T>) => win && useWorkspaceStore.getState().patchWindow(win.id, { settings: p }), [win]);
  return [(win?.settings ?? {}) as Partial<T>, patch];
}

/** True when the terminal streams this window's symbol (book, tape and focused chart data). */
export function useIsStreaming(): boolean {
  const sym = useWindowSymbol();
  return useMarketStore((s) => s.selected === sym);
}
