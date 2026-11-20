import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Maximize, Minus, Plus, Settings2, Star, X } from 'lucide-react';
import { candlesKeyOf, useMarketStore } from '@/stores/useMarketStore';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { useChartStore } from '@/stores/useChartStore';
import { useStudioStore } from '@/stores/useStudioStore';
import { useUiStore } from '@/stores/useUiStore';
import { indicatorLabel } from '@/lib/indicators/compute';
import { atrBox } from '@/lib/chart/renko';
import { fmtPct, fmtPrice, fmtStep } from '@/lib/format';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import type { ChartMode, Timeframe } from '@/types';
import { useTickFlash } from '@/app/useTickFlash';
import { useWindow, useWindowSettings, useWindowSymbol, useSetWindowSymbol } from '@/workspace/WindowContext';
import { useWorkspaceStore, type ChartView } from '@/workspace/useWorkspaceStore';
import { PriceChart, type PaneSource } from '../chart/PriceChart';
import { DrawingToolbar } from '../chart/DrawingToolbar';
import { IndicatorMenu } from '../chart/IndicatorMenu';
import { QuickEdit } from '../chart/QuickEdit';
import { zoomChart } from '../chart/chartCursor';
import { PopMenu } from '@/workspace/PopMenu';
import '../chart/chart.css';
import './windows.css';

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const CHART_MODES: { value: ChartMode; label: string }[] = [
  { value: 'candles', label: 'Candles' },
  { value: 'heikin', label: 'Heikin-Ashi' },
  { value: 'bars', label: 'OHLC bars' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'renko', label: 'Renko' },
  { value: 'footprint', label: 'Footprint' },
];

type ChartSettings = { tf: Timeframe; view: ChartView };

/**
 * A docked chart. One line of header (symbol, bid / ask, OHLC under the cursor), one 28px toolbar
 * (timeframe, type, zoom, indicators), the drawing rail inside the window. The focused chart
 * window owns the chart store (indicators, drawings, tools) and streams from the terminal feed;
 * the others draw their own symbol, timeframe and look from a candle stream of their own.
 */
export function ChartWindow() {
  const win = useWindow();
  const symbol = useWindowSymbol();
  const setSymbol = useSetWindowSymbol();
  const [settings, patch] = useWindowSettings<ChartSettings>();
  const tf = settings.tf ?? '1m';
  const id = win?.id ?? 'chart';
  const selected = useMarketStore((s) => s.selected);
  const mTf = useMarketStore((s) => s.timeframe);
  const isActive = useWorkspaceStore((s) => s.activeChart === id);
  const focused = isActive && selected === symbol && mTf === tf;
  const asset = useMarketStore((s) => s.assets[symbol]);
  const flash = useTickFlash(asset?.price ?? 0);
  const store = useChartStore();
  const look: ChartView = focused ? store : (settings.view ?? store);
  const [readout, setReadout] = useState<HTMLElement | null>(null);
  // Unfocused: its own candle stream, or the terminal's when it shows the same series.
  const providerId = useMarketStore((s) => s.providerId);
  const key = candlesKeyOf(symbol, tf, providerId);
  const series = useSeriesStore((s) => s.series[key]);
  const mKey = useMarketStore((s) => s.candlesKey);
  const mCandles = useMarketStore((s) => s.candles);
  const mError = useMarketStore((s) => s.candlesError);
  const pane: PaneSource | undefined = focused
    ? undefined
    : key === mKey
      ? { symbol, tf, candles: mCandles, candlesKey: key, error: mError, view: look }
      : { symbol, tf, candles: series?.candles ?? [], candlesKey: key, error: series?.error ?? null, view: look };

  // The focused chart's drawings follow its symbol / timeframe.
  useEffect(() => {
    if (focused) useChartStore.getState().switchDrawings(`${symbol}:${tf}`);
  }, [focused, symbol, tf]);

  const setTf = (t: Timeframe) => {
    patch({ tf: t });
    if (isActive) useMarketStore.getState().focusChart(symbol, t);
  };
  const setMode = (m: ChartMode) => (focused ? store.setMode(m) : patch({ view: { ...look, mode: m } }));

  return (
    <div className={`chart-win ${focused ? 'focused' : ''}`} data-testid="chart-window" data-symbol={symbol} data-focused={focused ? 'true' : 'false'}>
      <div className="cw-head no-select">
        <SymbolPicker symbol={symbol} onPick={setSymbol} />
        {asset && (
          <>
            <span className={`cw-last mono ${flash.cls}`} key={flash.key}>
              {fmtPrice(asset.price)}
            </span>
            <span className={`mono ${asset.change24h >= 0 ? 'up' : 'down'}`}>{fmtPct(asset.change24h)}</span>
            <span className="cw-ba mono" title="Bid / ask">
              <span className="down">{fmtPrice(asset.bid)}</span>
              <span className="faint">/</span>
              <span className="up">{fmtPrice(asset.ask)}</span>
            </span>
          </>
        )}
        <span className="cw-readout" ref={setReadout} />
        <span className="spacer" />
        <WatchStar symbol={symbol} />
      </div>
      <div className="cw-toolbar no-select" role="toolbar" aria-label="Chart toolbar">
        <div className="cw-tfs" role="group" aria-label="Timeframe">
          {TIMEFRAMES.map((t) => (
            <button key={t} className={`cw-tf ${tf === t ? 'on' : ''}`} aria-pressed={tf === t} onClick={() => setTf(t)} data-testid={`tf-${t}`}>
              {t}
            </button>
          ))}
        </div>
        <span className="cw-sep" />
        <select className="cw-select" value={look.mode} onChange={(e) => setMode(e.target.value as ChartMode)} aria-label="Chart mode" data-testid="chart-mode">
          {CHART_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        {look.mode === 'renko' && focused && <RenkoBoxControl />}
        <span className="cw-sep" />
        <button className="cw-btn" onClick={() => zoomChart(id, 'out')} aria-label="Zoom out" title="Zoom out">
          <Minus size={13} />
        </button>
        <button className="cw-btn" onClick={() => zoomChart(id, 'in')} aria-label="Zoom in" title="Zoom in">
          <Plus size={13} />
        </button>
        <button className="cw-btn" onClick={() => zoomChart(id, 'reset')} aria-label="Reset chart view" title="Reset view (Alt+R)">
          <Maximize size={12} />
        </button>
        <span className="cw-sep" />
        <button className={`cw-btn txt ${look.profile ? 'on' : ''}`} onClick={() => (focused ? store.toggleProfile() : patch({ view: { ...look, profile: !look.profile } }))} aria-pressed={look.profile} title="Volume profile (POC / value area)" data-testid="toggle-vp">
          VP
        </button>
        <button className={`cw-btn txt ${look.bookProfile ? 'on' : ''}`} onClick={() => (focused ? store.toggleBookProfile() : patch({ view: { ...look, bookProfile: !look.bookProfile } }))} aria-pressed={look.bookProfile} title="Order-book profile: resting liquidity by price" data-testid="toggle-ob">
          OB
        </button>
        <IndicatorMenu />
        <IndicatorChips focused={focused} />
        <span className="spacer" />
        <button
          className="cw-btn"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            useUiStore.getState().openChartMenu({ x: r.right, y: r.bottom + 6 });
          }}
          aria-label="Chart settings"
          title="Chart settings: colours, theme, data feed (F8 · or right-click the chart)"
          data-testid="chart-settings"
        >
          <Settings2 size={13} />
        </button>
      </div>
      <div
        className="chart-stage"
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('input, textarea, select')) return;
          e.preventDefault();
          useUiStore.getState().openChartContext({ x: e.clientX, y: e.clientY, symbol, price: null });
        }}
      >
        <DrawingToolbar />
        <div className="chart-canvas">
          <PriceChart fill readoutSlot={readout} controlId={id} pane={pane} />
        </div>
      </div>
      {focused && <QuickEdit />}
      <StrategyChip />
    </div>
  );
}

function SymbolPicker({ symbol, onPick }: { symbol: string; onPick: (s: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState('');
  const list = useMemo(() => ASSET_UNIVERSE.filter((a) => !q || a.symbol.includes(q.toUpperCase()) || a.name.toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <>
      <button className="cw-sym" onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} aria-haspopup="listbox" aria-expanded={!!anchor} data-testid="chart-symbol">
        {symbol}
        <span className="faint">/USDT</span>
        <ChevronDown size={12} />
      </button>
      {anchor && (
        <PopMenu anchor={anchor} onClose={() => setAnchor(null)} width={220}>
          <input autoFocus className="input pm-search" placeholder="Search crypto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search symbols" />
          <div className="pm-list" role="listbox">
            {list.map((a) => (
              <button
                key={a.symbol}
                role="option"
                aria-selected={a.symbol === symbol}
                className={`menu-item ${a.symbol === symbol ? 'hl' : ''}`}
                onClick={() => {
                  onPick(a.symbol);
                  setAnchor(null);
                }}
                data-testid={`chart-pick-${a.symbol}`}
              >
                <b className="mono">{a.symbol}</b>
                <span className="grow faint">{a.name}</span>
              </button>
            ))}
          </div>
        </PopMenu>
      )}
    </>
  );
}

function WatchStar({ symbol }: { symbol: string }) {
  const inWatch = useMarketStore((s) => s.watchlist.includes(symbol));
  return (
    <button className={`cw-btn ${inWatch ? 'starred' : ''}`} onClick={() => useMarketStore.getState().toggleWatch(symbol)} aria-label={inWatch ? 'Remove from watchlist' : 'Add to watchlist'} aria-pressed={inWatch} data-testid="star">
      <Star size={13} fill={inWatch ? 'currentColor' : 'none'} />
    </button>
  );
}

function IndicatorChips({ focused }: { focused: boolean }) {
  const { indicators, removeIndicator, openEditor, toggleIndicatorHidden } = useChartStore();
  const editingId = useChartStore((s) => s.editing?.id);
  if (!focused) return null;
  return (
    <div className="cw-chips">
      {indicators.map((i) => (
        <span key={i.id} className={`chip ind-chip ${i.hidden ? 'off' : ''} ${editingId === i.id ? 'editing' : ''}`} data-testid="indicator-chip" data-qe-anchor>
          <button className="ind-chip-main" onClick={(e) => openEditor(i.id, e.currentTarget.parentElement!)} title="Edit settings" aria-label={`Edit ${indicatorLabel(i)}`} data-testid="indicator-edit">
            <span className="swatch" style={{ background: i.color }} />
            {indicatorLabel(i)}
          </button>
          <button aria-label={`${i.hidden ? 'Show' : 'Hide'} ${indicatorLabel(i)}`} title={i.hidden ? 'Show' : 'Hide'} onClick={() => toggleIndicatorHidden(i.id)} className="ind-chip-eye" data-testid="indicator-eye">
            {i.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
          </button>
          <button aria-label={`Remove ${indicatorLabel(i)}`} onClick={() => removeIndicator(i.id)}>
            <X size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}

function StrategyChip() {
  const chartStrategy = useStudioStore((s) => s.strategies.find((x) => x.id === s.chartStrategyId) ?? null);
  if (!chartStrategy) return null;
  return (
    <span className="chip strat-chip cw-strat" data-testid="chart-strategy-chip" title="Strategy signals from Studio">
      <span className="swatch" style={{ background: chartStrategy.color }} />
      {chartStrategy.name}
      <button aria-label="Hide strategy signals" onClick={() => useStudioStore.getState().setChartStrategy(null)}>
        <X size={11} />
      </button>
    </span>
  );
}

/** Renko box size: automatic (ATR 14 of the loaded history) or a fixed price step. */
function RenkoBoxControl() {
  const candles = useMarketStore((s) => s.candles);
  const renkoBox = useChartStore((s) => s.renkoBox);
  const setRenkoBox = useChartStore((s) => s.setRenkoBox);
  const auto = useMemo(() => atrBox(candles), [candles]);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    setDraft(renkoBox == null ? '' : String(renkoBox));
  }, [renkoBox]);
  const commit = () => {
    const v = parseFloat(draft);
    setRenkoBox(Number.isFinite(v) && v > 0 ? v : null);
  };
  return (
    <label className="renko-box" title="Renko box size. Leave empty for automatic (ATR 14).">
      <span className="faint">Box</span>
      <input
        className="input mono"
        inputMode="decimal"
        value={draft}
        placeholder={auto ? `auto ${fmtStep(auto)}` : 'auto'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        aria-label="Renko box size"
        data-testid="renko-box"
      />
      {renkoBox != null && (
        <button className="cw-btn" onClick={() => setRenkoBox(null)} title="Back to automatic (ATR)">
          Auto
        </button>
      )}
    </label>
  );
}
