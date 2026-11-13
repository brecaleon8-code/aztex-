import { candlesKeyOf, useMarketStore } from '@/stores/useMarketStore';
import type { Timeframe } from '@/types';
import { SCOPES, useWorkspaceStore } from './useWorkspaceStore';
import { symbolOf, useLinkStore } from './useLinkStore';

/**
 * Candle series the open chart windows need besides the terminal's focused one, by candles key:
 * every chart in each app's active workspace tab.
 */
export function wantedChartSeries(providerId: string): Map<string, { symbol: string; tf: Timeframe }> {
  const ws = useWorkspaceStore.getState();
  const groups = useLinkStore.getState().groups;
  const m = useMarketStore.getState();
  const focusedKey = candlesKeyOf(m.selected, m.timeframe, providerId);
  const want = new Map<string, { symbol: string; tf: Timeframe }>();
  for (const scope of SCOPES) {
    const tab = ws.workspaces.find((w) => w.id === ws.active[scope]);
    for (const win of Object.values(tab?.windows ?? {})) {
      if (win.type !== 'chart') continue;
      const symbol = symbolOf(win, groups, m.selected);
      const tf = (win.settings.tf as Timeframe | undefined) ?? '1m';
      const key = candlesKeyOf(symbol, tf, providerId);
      if (key !== focusedKey) want.set(key, { symbol, tf });
    }
  }
  return want;
}
