import type { IGlobalAttributes, IJsonModel, IJsonRowNode, IJsonTabNode, IJsonTabSetNode } from 'flexlayout-react';
import { uid } from '@/lib/format';
import type { LinkColor, WindowState, WindowType } from './types';

/**
 * The dock tree is flexlayout-react's JSON model (rows of tab stacks). Everything here is pure
 * so layouts can be built, inspected and round-tripped without a DOM.
 */

/** Dock behaviour shared by every workspace; re-applied on load so old saves pick up changes. */
export const DOCK_GLOBAL: IGlobalAttributes = {
  tabEnableClose: true,
  tabEnableRename: false,
  tabEnablePopout: true,
  tabEnablePopoutIcon: false,
  tabSetEnableMaximize: true,
  tabSetEnableDeleteWhenEmpty: true,
  tabSetEnableTabStrip: true,
  tabSetMinWidth: 220,
  tabSetMinHeight: 140,
  enableEdgeDock: true,
};

export const WINDOW_TITLES: Record<WindowType, string> = {
  monitor: 'Monitor',
  quote: 'Quote',
  chart: 'Chart',
  orderbook: 'Order book',
  ticket: 'Order ticket',
  blotter: 'Blotter',
  news: 'News & events',
  comparison: 'Comparison',
  marketShare: 'Market share',
  scanner: 'Scanner',
  messages: 'Messages',
  forum: 'Forum',
  otc: 'OTC desk',
  tape: 'Time & sales',
  flow: 'Order flow',
  pnl: 'P/L',
  search: 'Currency search',
};

export function makeWindow(type: WindowType, linkGroup: LinkColor | null = null, settings: Record<string, unknown> = {}): WindowState {
  return { id: uid('w_'), type, linkGroup, settings };
}

export const tabOf = (w: WindowState): IJsonTabNode => ({ type: 'tab', id: w.id, name: WINDOW_TITLES[w.type], component: w.type });
export const stack = (weight: number, ...wins: WindowState[]): IJsonTabSetNode => ({ type: 'tabset', weight, children: wins.map(tabOf) });
export const split = (weight: number, ...children: (IJsonRowNode | IJsonTabSetNode)[]): IJsonRowNode => ({ type: 'row', weight, children });

export function model(layout: IJsonRowNode): IJsonModel {
  return { global: { ...DOCK_GLOBAL }, borders: [], layout };
}

/** Our global attributes over whatever a saved tree carried. */
export function withDockGlobal(json: IJsonModel): IJsonModel {
  return { ...json, global: { ...(json.global ?? {}), ...DOCK_GLOBAL } };
}

type AnyNode = { type?: string; id?: string; children?: AnyNode[] };

function walk(node: AnyNode | undefined, fn: (n: AnyNode) => void) {
  if (!node) return;
  fn(node);
  node.children?.forEach((c) => walk(c, fn));
}

/** Every node of the tree: main layout, borders and popped-out / floating windows (sub-layouts). */
function eachNode(json: IJsonModel, fn: (n: AnyNode) => void) {
  walk(json.layout as AnyNode, fn);
  json.borders?.forEach((b) => walk(b as AnyNode, fn));
  for (const p of Object.values({ ...(json.popouts ?? {}), ...(json.subLayouts ?? {}) })) walk((p as { layout?: AnyNode }).layout, fn);
}

/** Ids of every tab (window) in the tree. */
export function tabIds(json: IJsonModel): string[] {
  const out: string[] = [];
  eachNode(json, (n) => n.type === 'tab' && n.id && out.push(n.id));
  return out;
}

/** Tab ids grouped by the tab stack that holds them, in order (stacks without an id are skipped). */
export function stacks(json: IJsonModel): string[][] {
  const out: string[][] = [];
  eachNode(json, (n) => {
    if (n.type === 'tabset') out.push((n.children ?? []).filter((c) => c.type === 'tab' && c.id).map((c) => c.id!));
  });
  return out.filter((s) => s.length > 0);
}

/** Drops windows whose tab is gone from the tree, and adds placeholders for tabs with no window. */
export function reconcileWindows(json: IJsonModel, windows: Record<string, WindowState>): Record<string, WindowState> {
  const ids = new Set(tabIds(json));
  const out: Record<string, WindowState> = {};
  for (const [id, w] of Object.entries(windows)) if (ids.has(id)) out[id] = w;
  eachNode(json, (n) => {
    if (n.type === 'tab' && n.id && !out[n.id]) {
      const t = (n as IJsonTabNode).component as WindowType | undefined;
      if (t && t in WINDOW_TITLES) out[n.id] = { id: n.id, type: t, linkGroup: null, settings: {} };
    }
  });
  return out;
}

/**
 * Adds a tab to the tree: into the stack `targetStackId` if given, else the active stack, else the
 * first stack; an empty tree gets a new stack. Pure (returns a new tree).
 */
export function addTab(json: IJsonModel, tab: IJsonTabNode, targetStackId?: string): IJsonModel {
  const next = structuredClone(json) as IJsonModel;
  let target: IJsonTabSetNode | undefined;
  let first: IJsonTabSetNode | undefined;
  let active: IJsonTabSetNode | undefined;
  walk(next.layout as AnyNode, (n) => {
    if (n.type !== 'tabset') return;
    const ts = n as IJsonTabSetNode;
    first ??= ts;
    if (ts.active) active = ts;
    if (targetStackId && ts.id === targetStackId) target = ts;
  });
  const into = target ?? active ?? first;
  if (!into) {
    next.layout = { ...next.layout, children: [...(next.layout.children ?? []), { type: 'tabset', weight: 100, children: [tab], selected: 0 }] };
    return next;
  }
  into.children = [...(into.children ?? []), tab];
  into.selected = into.children.length - 1;
  return next;
}

/** True when two trees describe the same arrangement (same stacks, same order, same weights). */
export function sameArrangement(a: IJsonModel, b: IJsonModel): boolean {
  const shape = (j: IJsonModel) => {
    const parts: string[] = [];
    walk(j.layout as AnyNode, (n) => {
      const w = (n as { weight?: number }).weight;
      parts.push(`${n.type}:${n.type === 'tab' ? n.id : ''}:${w == null ? '' : Math.round(w * 1000) / 1000}`);
    });
    return parts.join('|');
  };
  return shape(a) === shape(b);
}

/** Window types that show a symbol, and so take part in link groups. */
export const LINKABLE = new Set<WindowType>(['monitor', 'quote', 'chart', 'orderbook', 'ticket', 'news', 'tape', 'flow']);

/**
 * Copies a tree and its windows under fresh window ids (a saved layout can be open in several tabs,
 * and window ids are unique app-wide).
 */
export function remapIds(json: IJsonModel, windows: Record<string, WindowState>): { dock: IJsonModel; windows: Record<string, WindowState> } {
  const dock = structuredClone(json) as IJsonModel;
  const map = new Map<string, string>();
  const out: Record<string, WindowState> = {};
  eachNode(dock, (n) => {
    if (n.type === 'tab' && n.id) {
      const next = uid('w_');
      map.set(n.id, next);
      n.id = next;
    } else if (n.type === 'tabset' || n.type === 'row') delete n.id;
  });
  for (const [old, w] of Object.entries(windows)) {
    const id = map.get(old);
    if (id) out[id] = { ...structuredClone(w), id };
  }
  return { dock, windows: out };
}

/**
 * The arrangement as a string, independent of ids: nesting, weights (to 0.1%), the stacks' tabs
 * (type and link group, in order) and which tab each stack shows. Two layouts with the same
 * signature look and link the same.
 */
export function signature(json: IJsonModel, windows: Record<string, WindowState>): string {
  const parts: string[] = [];
  const rec = (n: AnyNode, depth: number) => {
    const w = (n as { weight?: number }).weight;
    // The root's weight means nothing (and flexlayout drops the default 100).
    const wt = w == null || depth === 0 || w === 100 ? '' : `@${Math.round(w * 10) / 10}`;
    if (n.type === 'tab') {
      const win = n.id ? windows[n.id] : undefined;
      parts.push(`${depth}:tab:${win?.type ?? (n as IJsonTabNode).component}:${win?.linkGroup ?? '-'}`);
      return;
    }
    const sel = n.type === 'tabset' ? `#${(n as IJsonTabSetNode).selected ?? 0}` : '';
    parts.push(`${depth}:${n.type}${wt}${sel}`);
    n.children?.forEach((c) => rec(c, depth + 1));
  };
  rec(json.layout as AnyNode, 0);
  return parts.join('|');
}
