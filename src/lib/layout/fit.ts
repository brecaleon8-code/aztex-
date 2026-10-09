import type { PanelId } from '@/stores/useLayoutStore';

/**
 * Fit-to-screen Terminal layout. Panels are packed into rows that share the visible height, so the
 * workspace reads like a terminal (everything on one screen, panels scroll inside themselves)
 * instead of a long page. Pure, so it's unit-tested.
 */

/** Short, wide panels that sit in the bottom tier under the chart row. */
export const BOTTOM_TIER = new Set<PanelId>(['positions', 'orders', 'pnl', 'news']);

/** Narrowest width each panel stays usable at. */
export const MIN_W: Record<PanelId, number> = {
  watchlist: 280,
  chart: 420,
  ticket: 280,
  orderbook: 240,
  tape: 260,
  flow: 260,
  positions: 420,
  orders: 420,
  pnl: 300,
  news: 320,
};

/** Flex (grow shrink basis) per panel inside a fitted row. */
export const FIT_FLEX: Record<PanelId, string> = {
  watchlist: '0 0 280px',
  chart: '999 1 560px',
  ticket: '0 1 300px',
  orderbook: '0 1 280px',
  tape: '0 1 300px',
  flow: '1 1 300px',
  positions: '3 1 520px',
  orders: '2 1 460px',
  pnl: '1 1 360px',
  news: '2 1 420px',
};

export interface FitRow {
  ids: PanelId[];
  h: number;
}

/** Greedy line packing by minimum widths — never more on a line than can actually fit. */
export function pack(ids: PanelId[], width: number, gap: number): PanelId[][] {
  const lines: PanelId[][] = [];
  let cur: PanelId[] = [];
  let used = 0;
  for (const id of ids) {
    const w = MIN_W[id];
    if (cur.length && used + gap + w > width) {
      lines.push(cur);
      cur = [];
      used = 0;
    }
    used += (cur.length ? gap : 0) + w;
    cur.push(id);
  }
  if (cur.length) lines.push(cur);
  return lines;
}

export const MIN_MAIN_H = 320;
export const MIN_BOTTOM_H = 130;

export interface FitInput {
  order: PanelId[];
  width: number;
  /** Visible height available to the panels. */
  height: number;
  gap: number;
  maximized: boolean;
  /** Share of the height given to the bottom tier (positions, orders…). */
  bottomFrac: number;
}

export function bottomHeight(height: number, bottomFrac: number, gap: number): number {
  return Math.round(Math.min(height - gap - MIN_MAIN_H, Math.max(MIN_BOTTOM_H, height * bottomFrac)));
}

/**
 * Rows for the visible workspace. The first screenful always fits `height` exactly; anything that
 * can't (more panels than fit side by side, or panels moved out by a maximized chart) continues
 * below in rows of the same heights.
 */
export function fitRows({ order, width, height, gap, maximized, bottomFrac }: FitInput): FitRow[] {
  const top = order.filter((id) => !BOTTOM_TIER.has(id));
  const bottom = order.filter((id) => BOTTOM_TIER.has(id));
  const rows = (ids: PanelId[], h: number) => pack(ids, width, gap).map((line) => ({ ids: line, h }));

  if (maximized && order.includes('chart')) {
    // The chart takes the whole screen; everything else continues below it.
    const rest = top.filter((id) => id !== 'chart');
    return [{ ids: ['chart'], h: height }, ...rows(rest, height), ...rows(bottom, Math.max(MIN_BOTTOM_H * 2, Math.round(height * 0.45)))];
  }
  // Two tiers only when there's a main row to sit above the bottom panels.
  const twoTier = top.length > 0 && bottom.length > 0 && height - gap - MIN_BOTTOM_H >= MIN_MAIN_H;
  if (!twoTier) return rows(order, height);
  const bh = bottomHeight(height, bottomFrac, gap);
  return [...rows(top, height - bh - gap), ...rows(bottom, bh)];
}
