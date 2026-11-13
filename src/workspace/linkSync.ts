import { useMarketStore } from '@/stores/useMarketStore';
import type { Timeframe } from '@/types';
import { contextOf, sameContext, useLinkStore, type LinkContext } from './useLinkStore';
import { findWindow, useWorkspaceStore } from './useWorkspaceStore';

/** The symbol of a link context: its group's, or the unlinked window's own. */
export function contextSymbol(ctx: LinkContext): string | null {
  if (ctx.kind === 'group') return useLinkStore.getState().groups[ctx.color] ?? null;
  const f = findWindow(ctx.id);
  const s = f?.win.settings.symbol;
  return typeof s === 'string' ? s : null;
}

/** The focused chart's timeframe when it belongs to the active context. */
function contextTf(ctx: LinkContext): Timeframe | null {
  const id = useWorkspaceStore.getState().activeChart;
  const f = id ? findWindow(id) : null;
  if (!f || !sameContext(contextOf(f.win), ctx)) return null;
  return (f.win.settings.tf as Timeframe | undefined) ?? null;
}

/**
 * Keeps the terminal's selected symbol / timeframe (what the book, tape and focused chart stream)
 * equal to the active link context, both ways:
 *  - a Monitor click in a group, focusing a window, or switching charts retargets the market;
 *  - a symbol picked elsewhere (command line, palette, chart menu, phone app) lands in the active
 *    context, so every window linked to it follows.
 */
export function startLinkSync(): () => void {
  const toMarket = () => {
    const ctx = useLinkStore.getState().active;
    const sym = contextSymbol(ctx);
    if (!sym) return;
    const m = useMarketStore.getState();
    const tf = contextTf(ctx) ?? m.timeframe;
    if (m.selected !== sym || m.timeframe !== tf) m.focusChart(sym, tf);
  };
  const fromMarket = () => {
    const m = useMarketStore.getState();
    const link = useLinkStore.getState();
    const ctx = link.active;
    if (contextSymbol(ctx) !== m.selected) {
      if (ctx.kind === 'group') link.setGroup(ctx.color, m.selected);
      else useWorkspaceStore.getState().patchWindow(ctx.id, { settings: { symbol: m.selected } });
    }
    const tf = contextTf(ctx);
    const chart = useWorkspaceStore.getState().activeChart;
    if (tf && chart && tf !== m.timeframe) useWorkspaceStore.getState().patchWindow(chart, { settings: { tf: m.timeframe } });
  };

  // Start from the focused chart's context (or the red group).
  const chart = useWorkspaceStore.getState().activeChart;
  const f = chart ? findWindow(chart) : null;
  if (f) useLinkStore.getState().activate(contextOf(f.win));
  toMarket();

  const offLink = useLinkStore.subscribe((s, p) => {
    if (s.active !== p.active || s.groups !== p.groups) toMarket();
  });
  const offWs = useWorkspaceStore.subscribe((s, p) => {
    if (s.activeChart !== p.activeChart || s.workspaces !== p.workspaces) toMarket();
  });
  const offMarket = useMarketStore.subscribe((s, p) => {
    if (s.selected !== p.selected || s.timeframe !== p.timeframe) fromMarket();
  });
  return () => {
    offLink();
    offWs();
    offMarket();
  };
}
