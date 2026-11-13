import { BarChart3, Blocks, Handshake, LayoutDashboard, Users, type LucideIcon } from 'lucide-react';
import type { Scope } from '@/workspace/types';

/**
 * The app rail. Each entry has a terminal-style function key; docked routes have a workspace
 * scope (their own tabs and layouts), the others are plain pages inside the same shell.
 */
export const NAV: { to: string; key: string; label: string; icon: LucideIcon; scope?: Scope }[] = [
  { to: '/terminal', key: 'F1', label: 'Terminal', icon: LayoutDashboard, scope: 'terminal' },
  { to: '/discovery', key: 'F2', label: 'Data & Discovery', icon: BarChart3, scope: 'discovery' },
  { to: '/onchain', key: 'F3', label: 'On-chain', icon: Blocks },
  { to: '/community', key: 'F5', label: 'Community', icon: Users, scope: 'community' },
  { to: '/otc', key: 'F6', label: 'OTC Desk', icon: Handshake, scope: 'otc' },
];
/** Account lives at the foot of the rail and in the profile menu. */
export const ACCOUNT_NAV = { to: '/account', key: 'F7', label: 'Account' };

/** Pages that are not docked workspaces: their title for the tab strip. */
export const PAGE_TITLES: Record<string, string> = {
  '/onchain': 'On-chain',
  '/account': 'Account',
  '/get-studio': 'Aztex Studio',
};

export function scopeForPath(path: string): Scope | null {
  return NAV.find((n) => path.startsWith(n.to))?.scope ?? null;
}
