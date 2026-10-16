import { useMarketStore } from '@/stores/useMarketStore';
import { activeTabOf, focusedPane, useChartTabsStore } from '@/stores/useChartTabsStore';

/**
 * Keeps the active tab's focused chart and the terminal's selected symbol/timeframe in step, both
 * ways: switching tab or pane retargets the ticket, book and tape; picking a symbol elsewhere
 * (watchlist, command line, palette) changes the focused chart, like TradingView.
 */
export function startChartTabsSync(): () => void {
  const m = useMarketStore.getState();
  useChartTabsStore.getState().ensureTabs(m.selected, m.timeframe);

  const pushToMarket = () => {
    const tab = activeTabOf(useChartTabsStore.getState());
    if (!tab) return;
    const f = focusedPane(tab);
    useMarketStore.getState().focusChart(f.symbol, f.tf);
  };
  pushToMarket();

  const offTabs = useChartTabsStore.subscribe((s, prev) => {
    if (s.tabs !== prev.tabs || s.activeTab !== prev.activeTab) pushToMarket();
  });
  const offMarket = useMarketStore.subscribe((s, prev) => {
    if (s.selected !== prev.selected || s.timeframe !== prev.timeframe) useChartTabsStore.getState().syncFocused(s.selected, s.timeframe);
  });
  return () => {
    offTabs();
    offMarket();
  };
}
