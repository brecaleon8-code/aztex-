import { useEffect } from 'react';
import { useChartStore } from '@/stores/useChartStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useUiStore } from '@/stores/useUiStore';
import { useChartTabsStore } from '@/stores/useChartTabsStore';
import { alertAt, quickOrder, ticketAt } from '@/stores/quickTrade';
import { toast } from '@/stores/useToastStore';
import { chartCursor, CHART_RESET_EVENT } from '@/modules/terminal/chart/chartCursor';
import type { DrawingTool } from '@/types';

export const NEW_TAB_EVENT = 'aztex:new-tab';

const typing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

const TOOL_KEYS: Record<string, DrawingTool> = { KeyT: 'trend', KeyH: 'ray', KeyF: 'fib' };

/**
 * TradingView's chart keys. Price actions (alert / buy / sell / add order) work at the price under
 * the mouse — point at the chart and press the key.
 */
export function useChartShortcuts() {
  useEffect(() => {
    const atCursor = (fn: (symbol: string, price: number) => void) => {
      if (chartCursor.symbol && chartCursor.price != null) fn(chartCursor.symbol, chartCursor.price);
      else toast({ kind: 'info', title: 'Point at a price on the chart', detail: 'Hover the chart where you want it, then press the key again.' });
    };
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey) return;
      const { altKey: alt, shiftKey: shift, ctrlKey: ctrl, code } = e;
      let handled = true;
      if (alt && !shift && !ctrl && TOOL_KEYS[code]) useChartStore.getState().setTool(TOOL_KEYS[code]);
      else if (alt && !shift && !ctrl && code === 'KeyR') window.dispatchEvent(new Event(CHART_RESET_EVENT));
      else if (alt && !shift && !ctrl && code === 'KeyA') {
        if (chartCursor.symbol && chartCursor.price != null) alertAt(chartCursor.symbol, chartCursor.price);
        else {
          const m = useMarketStore.getState();
          alertAt(m.selected, m.assets[m.selected].price);
        }
      } else if (alt && shift && !ctrl && code === 'KeyB') atCursor((s, p) => report(quickOrder(s, 'Long', p)));
      else if (alt && shift && !ctrl && code === 'KeyS') atCursor((s, p) => report(quickOrder(s, 'Short', p)));
      else if (!alt && shift && !ctrl && code === 'KeyT') atCursor(ticketAt);
      else if (alt && shift && !ctrl && code === 'KeyT') window.dispatchEvent(new Event(NEW_TAB_EVENT));
      else if (alt && shift && !ctrl && code === 'KeyW') {
        const t = useChartTabsStore.getState();
        t.closeTab(t.activeTab);
      } else if (ctrl && !alt && code === 'Comma') useUiStore.getState().openChartMenu();
      else if (!alt && !ctrl && e.key === '?') useUiStore.getState().setShortcuts(true);
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function report(r: { ok: true } | { ok: false; error: string }) {
  if (!r.ok) toast({ kind: 'error', title: 'Order rejected', detail: r.error });
}
