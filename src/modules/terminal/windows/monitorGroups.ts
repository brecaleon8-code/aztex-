/**
 * The Monitor's grouped "Overview" list: built-in sections of the universe, shown as collapsible
 * groups that flow into side-by-side blocks when the window is wide enough.
 */
export interface MonitorGroup {
  id: string;
  name: string;
  symbols: string[];
}

export const OVERVIEW_LIST = 'overview';

export const OVERVIEW_GROUPS: MonitorGroup[] = [
  { id: 'key', name: 'Key markets', symbols: ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA'] },
  { id: 'payments', name: 'Payments', symbols: ['BTC', 'XRP', 'LTC', 'DOGE'] },
  { id: 'platforms', name: 'Smart-contract platforms', symbols: ['ETH', 'SOL', 'AVAX', 'ADA', 'DOT', 'ATOM'] },
  { id: 'infra', name: 'Infrastructure & scaling', symbols: ['LINK', 'MATIC', 'DOT', 'ATOM'] },
];

/** Narrowest a block may get before the groups fall back to fewer blocks. */
export const BLOCK_MIN_WIDTH = 340;

/** How many side-by-side blocks fit in a window of this width (at least 1, at most one per group). */
export function blockCount(width: number, groups: number, min = BLOCK_MIN_WIDTH): number {
  return Math.max(1, Math.min(groups, Math.floor(width / min)));
}

/**
 * Splits groups, in order, into `n` blocks of roughly equal height (a group's header counts as a
 * row; a collapsed group is just its header). Groups are never split across blocks.
 */
export function splitBlocks<G extends MonitorGroup>(groups: G[], n: number, collapsed: string[] = []): G[][] {
  const rowsOf = (g: G) => 1 + (collapsed.includes(g.id) ? 0 : g.symbols.length);
  const total = groups.reduce((t, g) => t + rowsOf(g), 0);
  const blocks: G[][] = [[]];
  let used = 0;
  groups.forEach((g, i) => {
    const cur = blocks[blocks.length - 1];
    const left = groups.length - i;
    const target = (total * blocks.length) / n;
    // Start a new block when this one is full enough, while blocks remain and groups remain for them.
    if (cur.length > 0 && blocks.length < n && (used + rowsOf(g) / 2 > target || left < n - blocks.length + 1)) blocks.push([]);
    blocks[blocks.length - 1].push(g);
    used += rowsOf(g);
  });
  return blocks;
}
