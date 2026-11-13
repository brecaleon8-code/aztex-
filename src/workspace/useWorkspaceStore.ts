import { create } from 'zustand';
import { Actions, DockLocation, type IJsonModel } from 'flexlayout-react';
import { uid } from '@/lib/format';
import { useChartStore } from '@/stores/useChartStore';
import { useMarketStore } from '@/stores/useMarketStore';
import type { ChartMode, IndicatorInstance } from '@/types';
import { addTab, LINKABLE, makeWindow, reconcileWindows, remapIds, tabOf, withDockGlobal } from './layoutModel';
import { DEFAULT_TEMPLATE, TEMPLATES, templateById } from './templates';
import { LocalStorageLayoutRepository, PERSIST_VERSION, type LayoutRepository } from './repository';
import { contextOf, sameContext, symbolOf, useLinkStore } from './useLinkStore';
import { dockModels } from './dockModels';
import type { LinkColor, PersistedWorkspaces, SavedLayout, Scope, WindowState, WindowType, Workspace } from './types';

export const SCOPES: Scope[] = ['terminal', 'discovery', 'community', 'otc'];

/** A chart window's own look; the focused chart's lives in useChartStore while it has focus. */
export interface ChartView {
  mode: ChartMode;
  indicators: IndicatorInstance[];
  profile: boolean;
  bookProfile: boolean;
  renkoBox: number | null;
}

export const chartViewNow = (): ChartView => {
  const c = useChartStore.getState();
  return { mode: c.mode, indicators: c.indicators, profile: c.profile, bookProfile: c.bookProfile, renkoBox: c.renkoBox };
};

interface WorkspaceState {
  workspaces: Workspace[];
  active: Record<Scope, string>;
  layouts: SavedLayout[];
  /** Window last clicked into (gets the accent frame). */
  focused: string | null;
  /** Chart window that owns the chart store (indicators, drawings, mode) and the focused-chart stream. */
  activeChart: string | null;

  setActive: (scope: Scope, id: string) => void;
  openWorkspace: (scope: Scope, sourceId?: string) => string;
  renameWorkspace: (id: string, name: string) => void;
  closeWorkspace: (id: string) => void;
  moveWorkspace: (id: string, toIndex: number) => void;

  setDock: (id: string, dock: IJsonModel) => void;
  addWindow: (type: WindowType, opts?: { scope?: Scope; linkGroup?: LinkColor | null; settings?: Record<string, unknown>; stackId?: string }) => string;
  closeWindow: (winId: string) => void;
  patchWindow: (winId: string, patch: { linkGroup?: LinkColor | null; settings?: Record<string, unknown> }) => void;
  focusWindow: (winId: string) => void;
  activateChart: (winId: string) => void;

  saveLayout: (wsId?: string) => string;
  saveLayoutAs: (name: string, wsId?: string) => string;
  renameLayout: (name: string, wsId?: string) => void;
  deleteLayout: (wsId?: string) => void;
  resetLayout: (wsId?: string) => void;
  loadLayout: (layoutId: string, wsId?: string) => void;
}

/** Saved layouts first, then templates: what a tab can be opened from or reset to. */
function sourceOf(id: string, layouts: SavedLayout[]): { name: string; scope: Scope; dock: IJsonModel; windows: Record<string, WindowState>; links?: Record<LinkColor, string> } | null {
  const saved = layouts.find((l) => l.id === id);
  if (saved) return { ...remapIds(saved.dock, saved.windows), name: saved.name, scope: saved.scope, links: saved.links };
  const t = templateById(id);
  return t ? { ...t.build(), name: t.name, scope: t.scope } : null;
}

function fromSource(id: string, layouts: SavedLayout[], name?: string): Workspace | null {
  const src = sourceOf(id, layouts);
  if (!src) return null;
  return { id: uid('ws_'), name: name ?? src.name, scope: src.scope, layoutId: id, dock: withDockGlobal(src.dock), windows: src.windows, rev: 0 };
}

const fromTemplate = (scope: Scope) => fromSource(DEFAULT_TEMPLATE[scope], [])!;

/** Every scope has a tab, and each scope's active id points at one of its tabs. */
function normalise(workspaces: Workspace[], active: Partial<Record<Scope, string>>): { workspaces: Workspace[]; active: Record<Scope, string> } {
  const out = [...workspaces];
  const act = {} as Record<Scope, string>;
  for (const s of SCOPES) {
    let mine = out.filter((w) => w.scope === s);
    if (mine.length === 0) {
      out.push(fromTemplate(s));
      mine = out.filter((w) => w.scope === s);
    }
    act[s] = mine.some((w) => w.id === active[s]) ? active[s]! : mine[0].id;
  }
  return { workspaces: out, active: act };
}

function firstChart(ws: Workspace | undefined): string | null {
  if (!ws) return null;
  return Object.values(ws.windows).find((w) => w.type === 'chart')?.id ?? null;
}

let repository: LayoutRepository = new LocalStorageLayoutRepository();

function initialState(p: PersistedWorkspaces | null) {
  const { workspaces, active } = normalise(p?.workspaces ?? [], p?.active ?? {});
  const terminal = workspaces.find((w) => w.id === active.terminal);
  return { workspaces, active, layouts: p?.layouts ?? [], focused: null, activeChart: firstChart(terminal) };
}

function loadSync(): PersistedWorkspaces | null {
  try {
    const r = repository.load();
    return r instanceof Promise ? null : r;
  } catch {
    return null;
  }
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => {
  const wsOf = (wsId?: string, scope: Scope = 'terminal') => {
    const s = get();
    return s.workspaces.find((w) => w.id === (wsId ?? s.active[scope]));
  };
  const findWin = (winId: string) => {
    for (const ws of get().workspaces) if (ws.windows[winId]) return { ws, win: ws.windows[winId] };
    return null;
  };
  const replaceWs = (id: string, fn: (w: Workspace) => Workspace) => set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? fn(w) : w)) }));
  /** The active chart's live look written back into its window, so saving or switching keeps it. */
  const flushChart = () => {
    const id = get().activeChart;
    const f = id ? findWin(id) : null;
    if (f) replaceWs(f.ws.id, (w) => ({ ...w, windows: { ...w.windows, [id!]: { ...f.win, settings: { ...f.win.settings, view: chartViewNow() } } } }));
  };
  const snapshot = (ws: Workspace) => {
    flushChart();
    const cur = get().workspaces.find((w) => w.id === ws.id) ?? ws;
    return { dock: structuredClone(cur.dock), windows: structuredClone(cur.windows), links: { ...useLinkStore.getState().groups } };
  };

  return {
    ...initialState(loadSync()),

    setActive: (scope, id) =>
      set((s) => {
        if (!s.workspaces.some((w) => w.id === id && w.scope === scope)) return s;
        const next = { active: { ...s.active, [scope]: id } } as Partial<WorkspaceState>;
        if (scope === 'terminal') {
          const ws = s.workspaces.find((w) => w.id === id);
          if (!s.activeChart || !ws?.windows[s.activeChart]) next.activeChart = firstChart(ws);
        }
        return next;
      }),

    openWorkspace: (scope, sourceId) => {
      const s = get();
      const ws = fromSource(sourceId ?? DEFAULT_TEMPLATE[scope], s.layouts) ?? fromTemplate(scope);
      const names = new Set(s.workspaces.filter((w) => w.scope === ws.scope).map((w) => w.name));
      let name = ws.name;
      for (let i = 2; names.has(name); i++) name = `${ws.name} ${i}`;
      const created = { ...ws, name };
      set({ workspaces: [...s.workspaces, created], active: { ...s.active, [created.scope]: created.id } });
      if (created.scope === 'terminal') set({ activeChart: firstChart(created) });
      return created.id;
    },

    renameWorkspace: (id, name) => {
      const n = name.trim();
      if (n) replaceWs(id, (w) => ({ ...w, name: n }));
    },

    closeWorkspace: (id) =>
      set((s) => {
        const ws = s.workspaces.find((w) => w.id === id);
        if (!ws) return s;
        const siblings = s.workspaces.filter((w) => w.scope === ws.scope);
        const i = siblings.findIndex((w) => w.id === id);
        let workspaces = s.workspaces.filter((w) => w.id !== id);
        let nextActive = s.active[ws.scope];
        if (siblings.length === 1) {
          const fresh = fromTemplate(ws.scope);
          workspaces = [...workspaces, fresh];
          nextActive = fresh.id;
        } else if (nextActive === id) nextActive = (siblings[i + 1] ?? siblings[i - 1]).id;
        return { workspaces, active: { ...s.active, [ws.scope]: nextActive } };
      }),

    moveWorkspace: (id, toIndex) =>
      set((s) => {
        const ws = s.workspaces.find((w) => w.id === id);
        if (!ws) return s;
        const same = s.workspaces.filter((w) => w.scope === ws.scope && w.id !== id);
        same.splice(Math.max(0, Math.min(same.length, toIndex)), 0, ws);
        return { workspaces: [...s.workspaces.filter((w) => w.scope !== ws.scope), ...same] };
      }),

    setDock: (id, dock) => {
      set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, dock, windows: reconcileWindows(dock, w.windows) } : w)) }));
      const s = get();
      // A closed chart hands the chart store to the next chart; a closed window drops focus.
      if (s.activeChart && !findWin(s.activeChart)) set({ activeChart: firstChart(s.workspaces.find((w) => w.id === s.active.terminal)) });
      if (s.focused && !findWin(s.focused)) set({ focused: null });
    },

    addWindow: (type, opts = {}) => {
      const scope = opts.scope ?? 'terminal';
      const ws = wsOf(undefined, scope);
      if (!ws) return '';
      // New linkable windows join the active group, so they show what the rest of the screen shows.
      const ctx = useLinkStore.getState().active;
      const group = opts.linkGroup !== undefined ? opts.linkGroup : LINKABLE.has(type) && ctx.kind === 'group' ? ctx.color : null;
      const settings = { ...(type === 'chart' ? { tf: useMarketStore.getState().timeframe } : {}), ...(LINKABLE.has(type) && !group ? { symbol: useMarketStore.getState().selected } : {}), ...opts.settings };
      const win = makeWindow(type, group, settings);
      replaceWs(ws.id, (w) => ({ ...w, windows: { ...w.windows, [win.id]: win } }));
      const m = dockModels.get(ws.id);
      if (m) {
        const target = opts.stackId ?? m.getActiveTabset()?.getId() ?? firstTabsetId(m);
        if (target) m.doAction(Actions.addNode(tabOf(win), target, DockLocation.CENTER, -1, true));
        else replaceWs(ws.id, (w) => ({ ...w, dock: addTab(w.dock, tabOf(win)), rev: w.rev + 1 }));
      } else replaceWs(ws.id, (w) => ({ ...w, dock: addTab(w.dock, tabOf(win), opts.stackId), rev: w.rev + 1 }));
      if (type === 'chart' && scope === 'terminal') get().activateChart(win.id);
      return win.id;
    },

    closeWindow: (winId) => {
      const f = findWin(winId);
      if (!f) return;
      const m = dockModels.get(f.ws.id);
      if (m) m.doAction(Actions.deleteTab(winId));
      else {
        const dock = structuredClone(f.ws.dock) as IJsonModel;
        removeTab(dock, winId);
        replaceWs(f.ws.id, (w) => ({ ...w, dock, windows: reconcileWindows(dock, w.windows), rev: w.rev + 1 }));
      }
    },

    patchWindow: (winId, patch) => {
      const f = findWin(winId);
      if (!f) return;
      const next: WindowState = {
        ...f.win,
        ...(patch.linkGroup !== undefined ? { linkGroup: patch.linkGroup } : {}),
        settings: patch.settings ? { ...f.win.settings, ...patch.settings } : f.win.settings,
      };
      // Unlinking keeps what the window showed.
      if (patch.linkGroup === null && f.win.linkGroup && next.settings.symbol == null) next.settings = { ...next.settings, symbol: useLinkStore.getState().groups[f.win.linkGroup] };
      replaceWs(f.ws.id, (w) => ({ ...w, windows: { ...w.windows, [winId]: next } }));
      if (patch.linkGroup !== undefined && get().focused === winId && LINKABLE.has(next.type)) useLinkStore.getState().activate(contextOf(next));
    },

    focusWindow: (winId) => {
      const f = findWin(winId);
      if (!f) return;
      if (get().focused !== winId) set({ focused: winId });
      const { win, ws } = f;
      if (!LINKABLE.has(win.type)) return;
      const ctx = contextOf(win);
      useLinkStore.getState().activate(ctx);
      if (win.type === 'chart') get().activateChart(win.id);
      else {
        // The context's chart (if this workspace has one) becomes the focused chart.
        const cur = get().activeChart;
        const curWin = cur ? ws.windows[cur] : undefined;
        if (curWin && sameContext(contextOf(curWin), ctx)) return;
        const chart = Object.values(ws.windows).find((w) => w.type === 'chart' && sameContext(contextOf(w), ctx));
        if (chart) get().activateChart(chart.id);
      }
    },

    activateChart: (winId) => {
      const prev = get().activeChart;
      if (prev === winId) return;
      const f = findWin(winId);
      if (!f || f.win.type !== 'chart') return;
      if (prev) flushChart();
      const view = findWin(winId)!.win.settings.view as ChartView | undefined;
      if (view) useChartStore.setState({ mode: view.mode, indicators: view.indicators, profile: view.profile, bookProfile: view.bookProfile, renkoBox: view.renkoBox });
      set({ activeChart: winId });
    },

    saveLayout: (wsId) => {
      const ws = wsOf(wsId);
      if (!ws) return '';
      const saved = get().layouts.find((l) => l.id === ws.layoutId);
      if (!saved) return get().saveLayoutAs(ws.name, ws.id);
      const snap = snapshot(ws);
      set((s) => ({ layouts: s.layouts.map((l) => (l.id === saved.id ? { ...l, ...snap } : l)) }));
      return saved.id;
    },

    saveLayoutAs: (name, wsId) => {
      const ws = wsOf(wsId);
      const n = name.trim();
      if (!ws || !n) return '';
      const snap = snapshot(ws);
      const layout: SavedLayout = { id: uid('lay_'), name: n, scope: ws.scope, ...snap };
      set((s) => ({ layouts: [...s.layouts, layout], workspaces: s.workspaces.map((w) => (w.id === ws.id ? { ...w, name: n, layoutId: layout.id } : w)) }));
      return layout.id;
    },

    renameLayout: (name, wsId) => {
      const ws = wsOf(wsId);
      const n = name.trim();
      if (!ws || !n) return;
      set((s) => ({
        layouts: s.layouts.map((l) => (l.id === ws.layoutId ? { ...l, name: n } : l)),
        workspaces: s.workspaces.map((w) => (w.id === ws.id ? { ...w, name: n } : w)),
      }));
    },

    deleteLayout: (wsId) => {
      const ws = wsOf(wsId);
      if (!ws || !get().layouts.some((l) => l.id === ws.layoutId)) return;
      set((s) => ({
        layouts: s.layouts.filter((l) => l.id !== ws.layoutId),
        // Tabs opened from it keep their arrangement and now reset to their scope's template.
        workspaces: s.workspaces.map((w) => (w.layoutId === ws.layoutId ? { ...w, layoutId: DEFAULT_TEMPLATE[w.scope] } : w)),
      }));
    },

    resetLayout: (wsId) => {
      const ws = wsOf(wsId);
      if (ws) get().loadLayout(ws.layoutId || DEFAULT_TEMPLATE[ws.scope], ws.id);
    },

    loadLayout: (layoutId, wsId) => {
      const ws = wsOf(wsId);
      if (!ws) return;
      const src = sourceOf(layoutId, get().layouts) ?? sourceOf(DEFAULT_TEMPLATE[ws.scope], []);
      if (!src) return;
      if (src.links) useLinkStore.getState().setGroups(src.links);
      const saved = get().layouts.find((l) => l.id === layoutId);
      const next: Workspace = { ...ws, name: saved ? saved.name : ws.name, layoutId, dock: withDockGlobal(src.dock), windows: src.windows, rev: ws.rev + 1 };
      set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === ws.id ? next : w)), activeChart: ws.scope === 'terminal' ? null : s.activeChart }));
      if (ws.scope === 'terminal') {
        const chart = firstChart(next);
        if (chart) get().activateChart(chart);
      }
    },
  };
});

function firstTabsetId(m: { visitNodes: (fn: (n: { getType: () => string; getId: () => string }) => void) => void }): string | undefined {
  let id: string | undefined;
  m.visitNodes((n) => {
    if (!id && n.getType() === 'tabset') id = n.getId();
  });
  return id;
}

function removeTab(dock: IJsonModel, id: string) {
  const rec = (n: { children?: { id?: string; children?: unknown[] }[] }) => {
    if (!n.children) return;
    n.children = n.children.filter((c) => c.id !== id);
    n.children.forEach((c) => rec(c as typeof n));
  };
  rec(dock.layout as never);
}

/** The window (and its workspace) for an id. */
export function findWindow(winId: string): { ws: Workspace; win: WindowState } | null {
  for (const ws of useWorkspaceStore.getState().workspaces) if (ws.windows[winId]) return { ws, win: ws.windows[winId] };
  return null;
}

export const activeWorkspace = (scope: Scope) => {
  const s = useWorkspaceStore.getState();
  return s.workspaces.find((w) => w.id === s.active[scope]);
};

/** Resolves a window's symbol against the current link groups. */
export const windowSymbol = (win: WindowState) => symbolOf(win, useLinkStore.getState().groups, useMarketStore.getState().selected);

/** Swap the persistence backend (e.g. a server repository once accounts exist). */
export function setWorkspaceRepository(repo: LayoutRepository) {
  repository = repo;
}

/**
 * Persists open tabs and saved layouts (debounced). An async repository's first read is applied
 * when it arrives; the default layout renders meanwhile.
 */
export function startWorkspacePersistence(): () => void {
  const r = repository.load();
  if (r instanceof Promise)
    r.then((p) => {
      if (p) useWorkspaceStore.setState(initialState(p));
    }).catch(() => {});
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    const s = useWorkspaceStore.getState();
    void repository.save({ version: PERSIST_VERSION, workspaces: s.workspaces, active: s.active, layouts: s.layouts });
  };
  const off = useWorkspaceStore.subscribe((s, prev) => {
    if (s.workspaces === prev.workspaces && s.active === prev.active && s.layouts === prev.layouts) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 250);
  });
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      save();
    }
  };
  window.addEventListener('beforeunload', flush);
  return () => {
    off();
    flush();
    window.removeEventListener('beforeunload', flush);
  };
}

export { TEMPLATES };

/** Default tabs (one per scope, from templates): the state the app falls back to. */
export const freshWorkspaceState = () => initialState(null);
