import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { candlesKeyOf, useMarketStore } from '@/stores/useMarketStore';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { activeTabOf, CHART_LAYOUTS, paneCount, useChartTabsStore, type ChartLayoutId, type ChartPane } from '@/stores/useChartTabsStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { fmtPct, fmtPrice } from '@/lib/format';
import type { Timeframe } from '@/types';
import { PriceChart } from './PriceChart';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
/** Extra height for the panes' headers when the terminal scrolls instead of fitting the screen. */
const GRID_EXTRA_H = 150;

/**
 * Several charts on one page. Each pane keeps its own symbol and timeframe; clicking a pane
 * focuses it, and the focused pane drives the ticket, book and tape (outlined in green).
 */
export function ChartGrid({ fill }: { fill: boolean }) {
  const tab = useChartTabsStore((s) => activeTabOf(s));
  const chartHeight = useLayoutStore((s) => s.chartHeight);
  if (!tab) return null;
  const n = paneCount(tab.layout);
  return (
    <div className={`chart-grid l-${tab.layout}`} style={fill ? undefined : { height: chartHeight + GRID_EXTRA_H }} data-testid="chart-grid" data-layout={tab.layout}>
      {tab.panes.slice(0, n).map((p, i) => (
        <GridPane key={i} index={i} pane={p} focused={i === tab.active} />
      ))}
    </div>
  );
}

function GridPane({ index, pane, focused }: { index: number; pane: ChartPane; focused: boolean }) {
  const providerId = useMarketStore((s) => s.providerId);
  const asset = useMarketStore((s) => s.assets[pane.symbol]);
  const key = candlesKeyOf(pane.symbol, pane.tf, providerId);
  const entry = useSeriesStore((s) => s.series[key]);
  const { activatePane, setPaneSymbol, setPaneTf } = useChartTabsStore.getState();
  return (
    <div
      className={`cg-pane ${focused ? 'focused' : ''}`}
      onPointerDownCapture={() => !focused && activatePane(index)}
      data-testid="chart-pane"
      data-symbol={pane.symbol}
      data-focused={focused ? 'true' : 'false'}
    >
      <div className="cg-head">
        <select className="cg-sym mono" value={pane.symbol} onChange={(e) => setPaneSymbol(index, e.target.value)} aria-label={`Chart ${index + 1} symbol`} data-testid="pane-symbol">
          {ASSET_UNIVERSE.map((a) => (
            <option key={a.symbol} value={a.symbol}>
              {a.symbol}
            </option>
          ))}
        </select>
        <select className="cg-tf mono" value={pane.tf} onChange={(e) => setPaneTf(index, e.target.value as Timeframe)} aria-label={`Chart ${index + 1} timeframe`} data-testid="pane-tf">
          {TIMEFRAMES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        {asset && (
          <>
            <span className="cg-price mono">{fmtPrice(asset.price)}</span>
            <span className={`cg-chg mono ${asset.change24h >= 0 ? 'up' : 'down'}`}>{fmtPct(asset.change24h)}</span>
          </>
        )}
        {focused && <span className="cg-focus" title="This chart drives the order ticket, book and tape">trading</span>}
      </div>
      <PriceChart fill compact pane={focused ? undefined : { symbol: pane.symbol, tf: pane.tf, candles: entry?.candles ?? [], candlesKey: key, error: entry?.error ?? null }} />
    </div>
  );
}

/** Tiny glyph of each layout for the picker. */
export function LayoutGlyph({ id, size = 14 }: { id: ChartLayoutId; size?: number }) {
  const r = (x: number, y: number, w: number, h: number, k: number) => <rect key={k} x={x} y={y} width={w} height={h} rx={1.2} />;
  const cells: Record<ChartLayoutId, [number, number, number, number][]> = {
    '1': [[1, 1, 12, 12]],
    '2v': [[1, 1, 5.5, 12], [7.5, 1, 5.5, 12]],
    '2h': [[1, 1, 12, 5.5], [1, 7.5, 12, 5.5]],
    '3': [[1, 1, 7, 12], [9, 1, 4, 5.5], [9, 7.5, 4, 5.5]],
    '4': [[1, 1, 5.5, 5.5], [7.5, 1, 5.5, 5.5], [1, 7.5, 5.5, 5.5], [7.5, 7.5, 5.5, 5.5]],
  };
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.2} aria-hidden className="layout-glyph">
      {cells[id].map(([x, y, w, h], k) => r(x, y, w, h, k))}
    </svg>
  );
}

/** Chart layout presets for the active tab: 1, 2, 3 or 4 charts on one page. */
export function LayoutPicker() {
  const tab = useChartTabsStore((s) => activeTabOf(s));
  const setLayout = useChartTabsStore((s) => s.setLayout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!tab) return null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn sm icon ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Chart layout" title="Chart layout: 1–4 charts on one page" data-testid="chart-layout">
        <LayoutGlyph id={tab.layout} />
      </button>
      {open && (
        <div className="menu layout-menu" style={{ right: 0, top: 30, width: 230 }} role="menu">
          <div className="menu-group">Layout · this tab</div>
          {CHART_LAYOUTS.map((l) => (
            <button
              key={l.id}
              className={`menu-item ${tab.layout === l.id ? 'hl' : ''}`}
              role="menuitemradio"
              aria-checked={tab.layout === l.id}
              onClick={() => {
                setLayout(l.id);
                setOpen(false);
              }}
              data-testid={`layout-${l.id}`}
            >
              <LayoutGlyph id={l.id} size={16} />
              <span className="grow">{l.label}</span>
              {tab.layout === l.id && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
