import { activeTabOf, defaultTabs, fillPanes, focusedPane, makeTab, MAX_PANES, MAX_TABS, paneCount, useChartTabsStore } from './useChartTabsStore';
import { useMarketStore } from './useMarketStore';
import { SERIES_CACHE_MAX, useSeriesStore } from './useSeriesStore';
import { startChartTabsSync } from '@/app/chartTabsSync';
import { wantedSeries } from '@/app/marketFeed';
import { syncAcrossWindows } from '@/lib/sync/crossWindow';
import { fmtBookQty } from '@/lib/format';

const reset = () => useChartTabsStore.setState({ tabs: [], activeTab: '' });
const active = () => activeTabOf(useChartTabsStore.getState())!;

describe('chart tabs', () => {
  beforeEach(reset);

  it('fills every tab to four distinct panes so layouts switch without losing charts', () => {
    const panes = fillPanes([{ symbol: 'ETH', tf: '15m' }]);
    expect(panes).toHaveLength(MAX_PANES);
    expect(panes[0]).toEqual({ symbol: 'ETH', tf: '15m' });
    expect(new Set(panes.map((p) => p.symbol)).size).toBe(MAX_PANES);
    expect(panes.every((p) => p.tf === '15m')).toBe(true);
    expect(paneCount('1')).toBe(1);
    expect(paneCount('3')).toBe(3);
    expect(paneCount('4')).toBe(4);
  });

  it('seeds default tabs from the current symbol without duplicates', () => {
    expect(defaultTabs('ETH', '1m').map((t) => focusedPane(t).symbol)).toEqual(['ETH', 'BTC', 'SOL']);
    expect(defaultTabs('DOGE', '1h').map((t) => focusedPane(t).symbol)).toEqual(['DOGE', 'BTC', 'ETH']);
  });

  it('opens, switches to an existing tab, closes, and never closes the last one', () => {
    const s = useChartTabsStore.getState();
    s.ensureTabs('BTC', '1m');
    expect(useChartTabsStore.getState().tabs).toHaveLength(3);
    s.openTab('DOGE', '1m');
    expect(focusedPane(active()).symbol).toBe('DOGE');
    expect(useChartTabsStore.getState().tabs).toHaveLength(4);
    s.openTab('ETH', '1m'); // already open → just focus it
    expect(useChartTabsStore.getState().tabs).toHaveLength(4);
    expect(focusedPane(active()).symbol).toBe('ETH');

    const ethId = active().id;
    const ids = useChartTabsStore.getState().tabs.map((t) => t.id);
    s.closeTab(ethId);
    // Closing the active tab focuses its right-hand neighbour.
    expect(useChartTabsStore.getState().activeTab).toBe(ids[ids.indexOf(ethId) + 1]);
    for (const t of [...useChartTabsStore.getState().tabs]) s.closeTab(t.id);
    expect(useChartTabsStore.getState().tabs).toHaveLength(1);
  });

  it('caps the number of tabs', () => {
    useChartTabsStore.setState({ tabs: Array.from({ length: MAX_TABS }, () => makeTab('BTC', '1m')) });
    useChartTabsStore.setState({ activeTab: useChartTabsStore.getState().tabs[0].id });
    useChartTabsStore.getState().openTab('ATOM', '1m');
    expect(useChartTabsStore.getState().tabs).toHaveLength(MAX_TABS);
  });

  it('keeps the focused pane inside the layout and mirrors outside symbol changes into it', () => {
    const s = useChartTabsStore.getState();
    s.ensureTabs('BTC', '1m');
    s.setLayout('4');
    s.activatePane(3);
    expect(active().active).toBe(3);
    s.activatePane(7); // out of range → ignored
    expect(active().active).toBe(3);
    s.setLayout('2v'); // pane 3 no longer visible → focus falls back to the first chart
    expect(active().active).toBe(0);
    s.syncFocused('SOL', '5m');
    expect(focusedPane(active())).toEqual({ symbol: 'SOL', tf: '5m' });
    s.setPaneSymbol(1, 'LINK');
    s.setPaneTf(1, '1h');
    expect(active().panes[1]).toEqual({ symbol: 'LINK', tf: '1h' });
  });
});

describe('chart tabs ↔ terminal sync', () => {
  beforeEach(() => {
    reset();
    useMarketStore.setState({ selected: 'BTC', timeframe: '1m' });
  });

  it('tab / pane focus drives the selected symbol, and the watchlist drives the focused pane', () => {
    const stop = startChartTabsSync();
    const s = useChartTabsStore.getState();
    s.openTab('AVAX', '1m');
    expect(useMarketStore.getState().selected).toBe('AVAX');

    s.setLayout('4');
    s.setPaneSymbol(2, 'LTC');
    s.setPaneTf(2, '4h');
    s.activatePane(2);
    expect(useMarketStore.getState().selected).toBe('LTC');
    expect(useMarketStore.getState().timeframe).toBe('4h');

    useMarketStore.getState().select('DOT');
    expect(focusedPane(active()).symbol).toBe('DOT');
    useMarketStore.getState().setTimeframe('15m');
    expect(focusedPane(active()).tf).toBe('15m');
    stop();
  });
});

describe('multi-chart candle streams', () => {
  it('asks for every visible pane except the focused one (which uses the main feed)', () => {
    const tab = { ...makeTab('BTC', '1m', '4'), active: 1 };
    tab.panes[2] = { symbol: 'ETH', tf: '5m' };
    const want = wantedSeries({ tabs: [tab], activeTab: tab.id }, 'mock');
    expect([...want.keys()]).toEqual(['mock:BTC:1m', 'mock:ETH:5m', `mock:${tab.panes[3].symbol}:1m`]);
    expect(wantedSeries({ tabs: [{ ...tab, layout: '1' }], activeTab: tab.id }, 'mock').size).toBe(0);
  });

  it('caches series and evicts the oldest unused ones beyond the cap', () => {
    const s = useSeriesStore.getState();
    s.clear();
    const c = { time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 };
    for (let i = 0; i < SERIES_CACHE_MAX + 3; i++) s.setSeries(`k${i}`, [c]);
    s.prune(new Set(['k0']));
    const keys = Object.keys(useSeriesStore.getState().series);
    expect(keys).toHaveLength(SERIES_CACHE_MAX);
    expect(keys).toContain('k0'); // still on screen → kept
    expect(keys).not.toContain('k1');
    // Live updates replace the forming candle and append new ones.
    s.upsert('k0', { ...c, close: 2 });
    s.upsert('k0', { ...c, time: 2 });
    expect(useSeriesStore.getState().series.k0.candles.map((x) => [x.time, x.close])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });
});

describe('cross-window sync (terminal ↔ Studio)', () => {
  it('re-reads a persisted store when another window writes it', () => {
    const rehydrate = vi.fn();
    const store = { persist: { getOptions: () => ({ name: 'aztex.studio' }), rehydrate } };
    const stop = syncAcrossWindows([store]);
    window.dispatchEvent(new StorageEvent('storage', { key: 'aztex.other', newValue: '{}', storageArea: localStorage }));
    expect(rehydrate).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: 'aztex.studio', newValue: '{}', storageArea: localStorage }));
    expect(rehydrate).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new StorageEvent('storage', { key: 'aztex.studio', newValue: '{}', storageArea: localStorage }));
    expect(rehydrate).toHaveBeenCalledTimes(1);
  });
});

describe('order book sizes', () => {
  it('abbreviates very large resting sizes so ladder columns never collide', () => {
    expect(fmtBookQty(1.2345)).toBe('1.2345');
    expect(fmtBookQty(99_999.5)).toBe('99,999.50');
    expect(fmtBookQty(1_861_812.64)).toBe('1.86M');
    expect(fmtBookQty(283_142.13)).toBe('283.14K');
  });
});

describe('drawings follow their chart', () => {
  it('parks drawings per symbol/timeframe and restores them when that chart is focused again', async () => {
    const { useChartStore } = await import('./useChartStore');
    const s = useChartStore.getState();
    useChartStore.setState({ drawings: [], drawingsKey: '', drawingStash: {} });
    s.switchDrawings('BTC:1m');
    s.addDrawing({ tool: 'ray', p1: { index: 10, price: 100, time: 1_000 } });
    s.switchDrawings('ETH:5m');
    expect(useChartStore.getState().drawings).toEqual([]);
    expect(useChartStore.getState().drawingStash['BTC:1m']).toHaveLength(1);
    s.switchDrawings('BTC:1m');
    expect(useChartStore.getState().drawings).toHaveLength(1);
    expect(useChartStore.getState().drawingStash['BTC:1m']).toBeUndefined();
    expect(useChartStore.getState().drawingStash['ETH:5m']).toEqual([]);
  });
});

describe('drawing edits', () => {
  it('select, move with one undo step, delete, undo, clear', async () => {
    const { useChartStore } = await import('./useChartStore');
    useChartStore.setState({ drawings: [], drawingUndo: [], selectedDrawing: null, drawingsKey: 'X:1m', drawingStash: {} });
    const s = useChartStore.getState();
    s.addDrawing({ tool: 'ray', p1: { index: 1, price: 10 } });
    const d = useChartStore.getState().drawings[0];
    s.selectDrawing(d.id);
    s.snapshotDrawings();
    s.updateDrawing(d.id, { ...d, p1: { index: 1, price: 11 } });
    s.updateDrawing(d.id, { ...d, p1: { index: 1, price: 12 } });
    expect(useChartStore.getState().drawings[0].p1.price).toBe(12);
    expect(s.undoDrawings()).toBe(true); // back to before the drag in one step
    expect(useChartStore.getState().drawings[0].p1.price).toBe(10);
    s.removeDrawing(d.id);
    expect(useChartStore.getState().drawings).toHaveLength(0);
    s.undoDrawings();
    expect(useChartStore.getState().drawings).toHaveLength(1);
    s.clearDrawings();
    s.undoDrawings();
    expect(useChartStore.getState().drawings).toHaveLength(1);
    s.undoDrawings(); // before the add
    expect(useChartStore.getState().drawings).toHaveLength(0);
    expect(s.undoDrawings()).toBe(false);
  });
});
