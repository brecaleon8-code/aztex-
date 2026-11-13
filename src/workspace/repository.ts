import type { PersistedWorkspaces, SavedLayout, Scope, Workspace } from './types';
import { reconcileWindows, tabIds, withDockGlobal } from './layoutModel';

export const PERSIST_VERSION = 1;

/**
 * Where workspaces and saved layouts live. Local storage for now; an account-backed server
 * implementation can replace it (a Promise from `load` is fine: the app renders the default
 * layout first and never waits on the read).
 */
export interface LayoutRepository {
  load(): PersistedWorkspaces | null | Promise<PersistedWorkspaces | null>;
  save(state: PersistedWorkspaces): void | Promise<void>;
}

const SCOPES: Scope[] = ['terminal', 'discovery', 'community', 'otc'];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function validDock(d: unknown): boolean {
  return isObj(d) && isObj(d.layout) && Array.isArray((d.layout as { children?: unknown }).children);
}

function cleanWorkspace(w: unknown): Workspace | null {
  if (!isObj(w) || typeof w.id !== 'string' || typeof w.name !== 'string' || !SCOPES.includes(w.scope as Scope) || !validDock(w.dock) || !isObj(w.windows)) return null;
  const dock = withDockGlobal(w.dock as Workspace['dock']);
  if (tabIds(dock).length === 0) return null;
  return { id: w.id, name: w.name, scope: w.scope as Scope, layoutId: typeof w.layoutId === 'string' ? w.layoutId : '', dock, windows: reconcileWindows(dock, w.windows as Workspace['windows']), rev: 0 };
}

function cleanLayout(l: unknown): SavedLayout | null {
  if (!isObj(l) || typeof l.id !== 'string' || typeof l.name !== 'string' || !SCOPES.includes(l.scope as Scope) || !validDock(l.dock) || !isObj(l.windows)) return null;
  const dock = withDockGlobal(l.dock as SavedLayout['dock']);
  return { id: l.id, name: l.name, scope: l.scope as Scope, dock, windows: reconcileWindows(dock, l.windows as SavedLayout['windows']), links: (isObj(l.links) ? l.links : {}) as SavedLayout['links'] };
}

/** Validates a stored blob; anything unreadable is dropped (and the caller falls back to templates). */
export function parsePersisted(raw: unknown): PersistedWorkspaces | null {
  if (!isObj(raw) || raw.version !== PERSIST_VERSION || !Array.isArray(raw.workspaces)) return null;
  const workspaces = raw.workspaces.map(cleanWorkspace).filter((w): w is Workspace => !!w);
  const layouts = Array.isArray(raw.layouts) ? raw.layouts.map(cleanLayout).filter((l): l is SavedLayout => !!l) : [];
  const active: PersistedWorkspaces['active'] = {};
  if (isObj(raw.active)) for (const s of SCOPES) if (typeof raw.active[s] === 'string') active[s] = raw.active[s] as string;
  return { version: PERSIST_VERSION, workspaces, active, layouts };
}

export class LocalStorageLayoutRepository implements LayoutRepository {
  constructor(private key = 'aztex.workspaces') {}
  load(): PersistedWorkspaces | null {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? parsePersisted(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }
  save(state: PersistedWorkspaces): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the layout simply isn't remembered.
    }
  }
}
