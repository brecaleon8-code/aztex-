import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LinkColor, WindowState } from './types';

/** The link context the terminal is streaming for: a colour group, or one unlinked window. */
export type LinkContext = { kind: 'group'; color: LinkColor } | { kind: 'window'; id: string };

export const DEFAULT_GROUPS: Record<LinkColor, string> = { red: 'BTC', blue: 'ETH', green: 'SOL', amber: 'XRP' };

interface LinkState {
  /** Symbol shared by every window in each group. */
  groups: Record<LinkColor, string>;
  /** The context last focused: its symbol is the terminal's selected symbol (book, tape, focused chart). */
  active: LinkContext;
  setGroup: (color: LinkColor, symbol: string) => void;
  setGroups: (groups: Partial<Record<LinkColor, string>>) => void;
  activate: (ctx: LinkContext) => void;
}

export const useLinkStore = create<LinkState>()(
  persist(
    (set) => ({
      groups: { ...DEFAULT_GROUPS },
      active: { kind: 'group', color: 'red' },
      setGroup: (color, symbol) => set((s) => (s.groups[color] === symbol ? s : { groups: { ...s.groups, [color]: symbol } })),
      setGroups: (groups) => set((s) => ({ groups: { ...s.groups, ...groups } })),
      activate: (ctx) =>
        set((s) => {
          const a = s.active;
          const same = a.kind === ctx.kind && (a.kind === 'group' ? a.color === (ctx as { color: LinkColor }).color : a.id === (ctx as { id: string }).id);
          return same ? s : { active: ctx };
        }),
    }),
    { name: 'aztex.links', version: 1, partialize: (s) => ({ groups: s.groups, active: s.active }) },
  ),
);

/** A window's symbol: its group's, or (unlinked) its own, else the fallback. */
export function symbolOf(win: Pick<WindowState, 'linkGroup' | 'settings'>, groups: Record<LinkColor, string>, fallback: string): string {
  if (win.linkGroup) return groups[win.linkGroup] ?? fallback;
  const own = win.settings.symbol;
  return typeof own === 'string' ? own : fallback;
}

export const contextOf = (win: Pick<WindowState, 'id' | 'linkGroup'>): LinkContext => (win.linkGroup ? { kind: 'group', color: win.linkGroup } : { kind: 'window', id: win.id });

export const sameContext = (a: LinkContext, b: LinkContext) => a.kind === b.kind && (a.kind === 'group' ? a.color === (b as { color: LinkColor }).color : a.id === (b as { id: string }).id);
