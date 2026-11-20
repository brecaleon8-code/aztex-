import type { IJsonModel } from 'flexlayout-react';

/** Every kind of window the dock can host (see `registry.tsx`). */
export type WindowType =
  | 'monitor'
  | 'quote'
  | 'chart'
  | 'orderbook'
  | 'ticket'
  | 'blotter'
  | 'news'
  | 'comparison'
  | 'marketShare'
  | 'scanner'
  | 'messages'
  | 'forum'
  | 'otc'
  | 'tape'
  | 'flow'
  | 'pnl'
  | 'search';

/** Link groups: windows with the same colour share one symbol. `null` = unlinked. */
export type LinkColor = 'red' | 'blue' | 'green' | 'amber';
export const LINK_COLORS: LinkColor[] = ['red', 'blue', 'green', 'amber'];

/** Which part of the app a workspace belongs to. Routes only change which workspaces are offered. */
export type Scope = 'terminal' | 'discovery' | 'community' | 'otc';

export interface WindowState {
  id: string;
  type: WindowType;
  linkGroup: LinkColor | null;
  /** Per-window settings (symbol for unlinked windows, chart timeframe / mode / indicators, monitor columns…). */
  settings: Record<string, unknown>;
}

/** An open workspace tab: a dock tree plus the windows in it. */
export interface Workspace {
  id: string;
  name: string;
  scope: Scope;
  /** Saved layout (or template) this tab was opened from; Save writes back to it. */
  layoutId: string;
  dock: IJsonModel;
  windows: Record<string, WindowState>;
  /** Bumped when the dock tree is replaced from outside (load, reset, add window) so the host rebuilds. */
  rev: number;
}

/** A saved arrangement: dock tree, windows (with link groups and settings) and the symbol per group. */
export interface SavedLayout {
  id: string;
  name: string;
  scope: Scope;
  dock: IJsonModel;
  windows: Record<string, WindowState>;
  links: Record<LinkColor, string>;
}

/** What the LayoutRepository persists. */
export interface PersistedWorkspaces {
  version: number;
  workspaces: Workspace[];
  active: Partial<Record<Scope, string>>;
  layouts: SavedLayout[];
  /** Set when the data was saved by an older version and has just been read in. */
  upgradedFrom?: number;
}
