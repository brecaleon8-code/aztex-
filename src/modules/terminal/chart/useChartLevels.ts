import { useMarketStore } from '@/stores/useMarketStore';
import { usePositionStore } from '@/stores/usePositionStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { textOn } from '@/lib/format';
import { useTicket } from '../useTicket';
import { useWindowRef } from '@/workspace/WindowContext';
import { useWorkspaceStore } from '@/workspace/useWorkspaceStore';

export interface ChartLevel {
  key: string;
  label: string;
  price: number;
  fill: string;
  text: string;
  draft: boolean;
}

/**
 * Entry/TP/SL shown on the chart. A live position on the symbol wins (its real levels); only when
 * none exists do we fall back to the order ticket's draft levels — and only on the selected
 * symbol's chart, since the ticket trades that one.
 */
export function useChartLevels(forSymbol?: string): ChartLevel[] {
  const selected = useMarketStore((s) => s.selected);
  const symbol = forSymbol ?? selected;
  const position = usePositionStore((s) => s.positions.find((p) => p.symbol === symbol));
  const colors = useThemeStore((s) => s.colors);
  const t = useTicket();
  // In the dock, the ticket's draft levels show only when this workspace has a ticket to place them.
  const inDock = useWindowRef() != null;
  const ticketHere = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === s.active.terminal);
    return !!ws && Object.values(ws.windows).some((w) => w.type === 'ticket');
  });
  const tp = { fill: colors.profit, text: textOn(colors.profit) };
  const sl = { fill: colors.loss, text: textOn(colors.loss) };
  const entry = { fill: 'var(--accent)', text: 'var(--on-accent)' };

  if (position) {
    return [
      { key: 'entry', label: `${position.side} entry`, price: position.entry, ...entry, draft: false },
      { key: 'tp', label: 'TP', price: position.tp, ...tp, draft: false },
      { key: 'sl', label: 'SL', price: position.sl, ...sl, draft: false },
    ];
  }
  if (symbol !== selected || (inDock && !ticketHere)) return [];
  return [
    { key: 'entry', label: t.orderType === 'limit' ? 'Limit' : 'Entry', price: t.entry, ...entry, draft: true },
    { key: 'tp', label: 'TP', price: t.tp, ...tp, draft: true },
    { key: 'sl', label: 'SL', price: t.sl, ...sl, draft: true },
  ];
}
