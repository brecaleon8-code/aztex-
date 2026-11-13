import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Model } from 'flexlayout-react';
import { useMarketStore } from '@/stores/useMarketStore';
import { addTab, makeWindow, reconcileWindows, remapIds, signature, stacks, tabIds, tabOf } from './layoutModel';
import { TEMPLATES } from './templates';
import { parsePersisted, PERSIST_VERSION } from './repository';
import { freshWorkspaceState, useWorkspaceStore, windowSymbol } from './useWorkspaceStore';
import { DEFAULT_GROUPS, useLinkStore } from './useLinkStore';
import { startLinkSync } from './linkSync';
import type { Workspace } from './types';

const terminal = () => {
  const s = useWorkspaceStore.getState();
  return s.workspaces.find((w) => w.id === s.active.terminal)!;
};
const winOf = (ws: Workspace, type: string) => Object.values(ws.windows).find((w) => w.type === type)!;

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState(freshWorkspaceState());
  useLinkStore.setState({ groups: { ...DEFAULT_GROUPS }, active: { kind: 'group', color: 'red' } });
  useMarketStore.setState({ selected: 'BTC', timeframe: '1m' });
});

describe('layout model', () => {
  it('every template builds a valid tree whose tabs are exactly its windows', () => {
    for (const t of TEMPLATES) {
      const { dock, windows } = t.build();
      expect(tabIds(dock).sort()).toEqual(Object.keys(windows).sort());
      expect(reconcileWindows(dock, windows)).toEqual(windows);
      // flexlayout accepts it and serializes back to the same arrangement.
      expect(signature(Model.fromJson(dock).toJson(), windows)).toBe(signature(dock, windows));
    }
  });

  it('the Trading template links Monitor, Chart, Order book and Ticket in one group', () => {
    const { windows } = TEMPLATES.find((t) => t.id === 'tpl-trading')!.build();
    const groups = Object.values(windows).map((w) => [w.type, w.linkGroup]);
    expect(groups).toEqual(expect.arrayContaining([['monitor', 'red'], ['chart', 'red'], ['orderbook', 'red'], ['ticket', 'red'], ['blotter', null]]));
  });

  it('round-trips through JSON storage unchanged', () => {
    const s = useWorkspaceStore.getState();
    const raw = JSON.parse(JSON.stringify({ version: PERSIST_VERSION, workspaces: s.workspaces, active: s.active, layouts: s.layouts }));
    const back = parsePersisted(raw)!;
    expect(back.workspaces.map((w) => signature(w.dock, w.windows))).toEqual(s.workspaces.map((w) => signature(w.dock, w.windows)));
    expect(back.workspaces.map((w) => w.windows)).toEqual(s.workspaces.map((w) => w.windows));
    expect(back.active).toEqual(s.active);
  });

  it('rejects unreadable storage instead of crashing (the app falls back to templates)', () => {
    expect(parsePersisted(null)).toBeNull();
    expect(parsePersisted({ version: 99, workspaces: [] })).toBeNull();
    expect(parsePersisted({ version: PERSIST_VERSION, workspaces: [{ id: 1 }, { id: 'x', name: 'x', scope: 'terminal', dock: {}, windows: {} }] })!.workspaces).toEqual([]);
    localStorage.setItem('aztex.workspaces', '{not json');
    expect(freshWorkspaceState().workspaces.find((w) => w.scope === 'terminal')!.name).toBe('Trading');
  });

  it('remaps window ids without changing the arrangement', () => {
    const { dock, windows } = TEMPLATES[0].build();
    const copy = remapIds(dock, windows);
    expect(Object.keys(copy.windows).some((id) => id in windows)).toBe(false);
    expect(signature(copy.dock, copy.windows)).toBe(signature(dock, windows));
  });

  it('adds a tab to the given, active or first stack', () => {
    const { dock } = TEMPLATES[0].build();
    const w = makeWindow('news');
    const next = addTab(dock, tabOf(w));
    expect(stacks(next)[0]).toContain(w.id);
    expect(tabIds(dock)).not.toContain(w.id);
  });
});

describe('saved layouts', () => {
  it('Save as, rearrange, then restore: same arrangement, sizes, tabs and link groups', () => {
    const st = useWorkspaceStore.getState();
    const ws = terminal();
    const before = signature(ws.dock, ws.windows);
    useLinkStore.getState().setGroup('red', 'SOL');
    const id = st.saveLayoutAs('My desk');
    expect(useWorkspaceStore.getState().layouts.find((l) => l.id === id)!.links.red).toBe('SOL');
    expect(terminal().name).toBe('My desk');

    // Rearrange: change sizes and unlink the chart.
    const dock = structuredClone(terminal().dock);
    (dock.layout.children![0] as { weight: number }).weight = 40;
    st.setDock(terminal().id, dock);
    st.patchWindow(winOf(terminal(), 'chart').id, { linkGroup: null });
    useLinkStore.getState().setGroup('red', 'ETH');
    expect(signature(terminal().dock, terminal().windows)).not.toBe(before);

    st.loadLayout(id);
    expect(signature(terminal().dock, terminal().windows)).toBe(before);
    expect(useLinkStore.getState().groups.red).toBe('SOL');
  });

  it('Reset reverts to the layout, Delete drops it, closing the last tab reopens the template', () => {
    const st = useWorkspaceStore.getState();
    const before = signature(terminal().dock, terminal().windows);
    st.closeWindow(winOf(terminal(), 'blotter').id);
    expect(Object.values(terminal().windows).some((w) => w.type === 'blotter')).toBe(false);
    st.resetLayout();
    expect(signature(terminal().dock, terminal().windows)).toBe(before);

    st.saveLayoutAs('Temp');
    st.deleteLayout();
    expect(useWorkspaceStore.getState().layouts).toHaveLength(0);

    const only = terminal().id;
    st.closeWorkspace(only);
    expect(terminal().id).not.toBe(only);
    expect(terminal().name).toBe('Trading');
  });

  it('opens new tabs from templates with unique names and reorders them', () => {
    const st = useWorkspaceStore.getState();
    const a = st.openWorkspace('terminal', 'tpl-research');
    const b = st.openWorkspace('terminal', 'tpl-research');
    const names = () => useWorkspaceStore.getState().workspaces.filter((w) => w.scope === 'terminal').map((w) => w.name);
    expect(names()).toEqual(['Trading', 'Research', 'Research 2']);
    st.moveWorkspace(b, 0);
    expect(names()).toEqual(['Research 2', 'Trading', 'Research']);
    expect(useWorkspaceStore.getState().active.terminal).toBe(b);
    st.setActive('terminal', a);
    expect(terminal().id).toBe(a);
  });
});

describe('link groups', () => {
  let stop: () => void;
  beforeEach(() => {
    stop = startLinkSync();
  });
  afterEach(() => stop());

  it('a group symbol change reaches every linked window and the market, not unlinked windows', () => {
    const st = useWorkspaceStore.getState();
    const ws = terminal();
    const chart = winOf(ws, 'chart');
    const book = winOf(ws, 'orderbook');
    const extra = st.addWindow('chart', { linkGroup: null, settings: { symbol: 'DOGE', tf: '5m' } });
    st.focusWindow(winOf(ws, 'monitor').id);
    useLinkStore.getState().setGroup('red', 'ETH');
    const fresh = terminal();
    expect(windowSymbol(fresh.windows[chart.id])).toBe('ETH');
    expect(windowSymbol(fresh.windows[book.id])).toBe('ETH');
    expect(windowSymbol(fresh.windows[extra])).toBe('DOGE');
    expect(useMarketStore.getState().selected).toBe('ETH');
  });

  it('focusing an unlinked window streams its symbol; the group keeps its own', () => {
    const st = useWorkspaceStore.getState();
    const extra = st.addWindow('chart', { linkGroup: null, settings: { symbol: 'XRP', tf: '15m' } });
    st.focusWindow(extra);
    expect(useMarketStore.getState().selected).toBe('XRP');
    expect(useMarketStore.getState().timeframe).toBe('15m');
    expect(useWorkspaceStore.getState().activeChart).toBe(extra);
    expect(useLinkStore.getState().groups.red).toBe('BTC');
    // Back to the red chart: the market follows the group again.
    st.focusWindow(winOf(terminal(), 'chart').id);
    expect(useMarketStore.getState().selected).toBe('BTC');
  });

  it('a symbol picked elsewhere (command line, palette) lands in the active group', () => {
    useWorkspaceStore.getState().focusWindow(winOf(terminal(), 'monitor').id);
    useMarketStore.getState().select('SOL');
    expect(useLinkStore.getState().groups.red).toBe('SOL');
    useMarketStore.getState().setTimeframe('4h');
    expect(winOf(terminal(), 'chart').settings.tf).toBe('4h');
  });

  it('relinking a window joins the group; unlinking keeps the symbol it showed', () => {
    const st = useWorkspaceStore.getState();
    const book = winOf(terminal(), 'orderbook');
    st.patchWindow(book.id, { linkGroup: null });
    expect(windowSymbol(terminal().windows[book.id])).toBe('BTC');
    useLinkStore.getState().setGroup('red', 'ETH');
    expect(windowSymbol(terminal().windows[book.id])).toBe('BTC');
    st.patchWindow(book.id, { linkGroup: 'blue' });
    expect(windowSymbol(terminal().windows[book.id])).toBe(DEFAULT_GROUPS.blue);
  });
});
