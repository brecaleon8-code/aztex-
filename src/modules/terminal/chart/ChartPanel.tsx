import { useEffect, useMemo, useRef, useState } from 'react';
import { atrBox } from '@/lib/chart/renko';
import { Star, Maximize2, Minimize2, MousePointer2, TrendingUp, MoveRight, Square, Type, AlignJustify, Trash2, X, Eye, EyeOff } from 'lucide-react';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { useMarketStore } from '@/stores/useMarketStore';
import { useChartStore } from '@/stores/useChartStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { indicatorLabel } from '@/lib/indicators/compute';
import { fmtCompact, fmtPct, fmtPrice, fmtStep } from '@/lib/format';
import { useSpark } from '../useSpark';
import { useStudioStore } from '@/stores/useStudioStore';
import type { ChartMode, DrawingTool, Timeframe } from '@/types';
import { PriceChart } from './PriceChart';
import { useTickFlash } from '@/app/useTickFlash';
import { IndicatorMenu } from './IndicatorMenu';
import { QuickEdit } from './QuickEdit';
import { useTerminalFit } from '../fitContext';
import './chart.css';

const TOOLS: { tool: DrawingTool; icon: typeof Star; label: string }[] = [
  { tool: 'cursor', icon: MousePointer2, label: 'Cursor (pan)' },
  { tool: 'trend', icon: TrendingUp, label: 'Trendline' },
  { tool: 'ray', icon: MoveRight, label: 'Horizontal ray' },
  { tool: 'rect', icon: Square, label: 'Rectangle' },
  { tool: 'text', icon: Type, label: 'Text' },
  { tool: 'fib', icon: AlignJustify, label: 'Fib retracement' },
];

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const CHART_MODES: { value: ChartMode; label: string }[] = [
  { value: 'candles', label: 'Candles' },
  { value: 'heikin', label: 'Heikin-Ashi' },
  { value: 'bars', label: 'OHLC bars' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'renko', label: 'Renko' },
  { value: 'footprint', label: 'Footprint' },
];

export function ChartPanel({ drag }: { drag?: PanelDragProps }) {
  const symbol = useMarketStore((s) => s.selected);
  const asset = useMarketStore((s) => s.assets[s.selected]);
  const tf = useMarketStore((s) => s.timeframe);
  const inWatch = useMarketStore((s) => s.watchlist.includes(s.selected));
  const { mode, setMode, tool, setTool, indicators, removeIndicator, drawings, clearDrawings, profile, toggleProfile, bookProfile, toggleBookProfile, openEditor, toggleIndicatorHidden } = useChartStore();
  const editingId = useChartStore((s) => s.editing?.id);
  const { chartMaximized, toggleChartMaximized } = useLayoutStore();
  const fit = useTerminalFit();
  const flash = useTickFlash(asset.price);
  const chartStrategy = useStudioStore((s) => s.strategies.find((x) => x.id === s.chartStrategyId) ?? null);
  const spark = useSpark(symbol);

  // Drawings are anchored to this symbol/timeframe's candle indices — clear on switch.
  useEffect(() => {
    clearDrawings();
  }, [symbol, tf, clearDrawings]);

  return (
    <Panel
      code="GP"
      testId="chart-panel"
      drag={drag}
      flush
      bodyClassName={fit ? 'chart-body' : ''}
      title={
        <span className="chart-hero">
          <span className="chart-sym">
            {symbol}
            <span className="faint">/USDT</span>
          </span>
          <span className={`chart-price ${flash.cls}`} key={flash.key}>
            {fmtPrice(asset.price)}
          </span>
          <span className={`chart-chg ${asset.change24h >= 0 ? 'pos' : 'neg'}`}>{fmtPct(asset.change24h)}</span>
          <span className="stats24 mono" data-testid="stats24">
            <span>
              <span className="faint">24h H</span> {spark.high != null ? fmtPrice(spark.high) : '—'}
            </span>
            <span>
              <span className="faint">L</span> {spark.low != null ? fmtPrice(spark.low) : '—'}
            </span>
            <span>
              <span className="faint">Vol</span> ${fmtCompact(asset.volume24h)}
            </span>
          </span>
        </span>
      }
      actions={
        <div className="row" style={{ gap: 6 }} onMouseDown={(e) => e.stopPropagation()}>
          <button
            className={`btn sm icon ghost ${inWatch ? 'starred' : ''}`}
            onClick={() => useMarketStore.getState().toggleWatch(symbol)}
            aria-label={inWatch ? 'Remove from watchlist' : 'Add to watchlist'}
            aria-pressed={inWatch}
            data-testid="star"
          >
            <Star size={14} fill={inWatch ? 'currentColor' : 'none'} />
          </button>
          <select className="input tf-select mono" value={tf} onChange={(e) => useMarketStore.getState().setTimeframe(e.target.value as Timeframe)} aria-label="Timeframe">
            {TIMEFRAMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select className="input tf-select" value={mode} onChange={(e) => setMode(e.target.value as ChartMode)} aria-label="Chart mode" data-testid="chart-mode">
            {CHART_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <button className="btn sm icon ghost" onClick={toggleChartMaximized} aria-label={chartMaximized ? 'Restore chart' : 'Maximize chart'}>
            {chartMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      }
    >
      <div className="chart-toolbar">
        <div className="tool-group" role="toolbar" aria-label="Drawing tools">
          {TOOLS.map(({ tool: t, icon: Icon, label }) => (
            <button key={t} className={`btn sm icon ghost ${tool === t ? 'active' : ''}`} title={label} aria-label={label} aria-pressed={tool === t} onClick={() => setTool(t)} data-testid={`tool-${t}`}>
              <Icon size={14} />
            </button>
          ))}
          {drawings.length > 0 && (
            <button className="btn sm ghost" onClick={clearDrawings} title="Clear drawings">
              <Trash2 size={13} /> {drawings.length}
            </button>
          )}
        </div>
        <span className="tb-sep" />
        <button className={`btn sm ${profile ? 'active' : ''}`} onClick={toggleProfile} aria-pressed={profile} title="Volume profile (POC / value area)" data-testid="toggle-vp">
          VP
        </button>
        <button className={`btn sm ${bookProfile ? 'active' : ''}`} onClick={toggleBookProfile} aria-pressed={bookProfile} title="Order-book profile: resting liquidity by price" data-testid="toggle-ob">
          OB
        </button>
        {mode === 'renko' && <RenkoBoxControl />}
        <IndicatorMenu />
        {chartStrategy && (
          <span className="chip strat-chip" data-testid="chart-strategy-chip" title="Strategy signals from Studio">
            <span className="swatch" style={{ background: chartStrategy.color }} />
            {chartStrategy.name}
            <button aria-label="Hide strategy signals" onClick={() => useStudioStore.getState().setChartStrategy(null)}>
              <X size={11} />
            </button>
          </span>
        )}
        <div className="row chart-chips" style={{ flexWrap: 'wrap', gap: 4 }}>
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
      </div>
      <PriceChart fill={!!fit} />
      <QuickEdit />
      {fit ? fit.bottomH > 0 && !chartMaximized && <RowSplitHandle height={fit.height} bottomH={fit.bottomH} /> : <ResizeHandle />}
    </Panel>
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
        <button className="btn sm ghost" onClick={() => setRenkoBox(null)} title="Back to automatic (ATR)">
          Auto
        </button>
      )}
    </label>
  );
}

/** Fit-to-screen: dragging the chart's bottom edge moves the split between the chart row and the bottom row. */
function RowSplitHandle({ height, bottomH }: { height: number; bottomH: number }) {
  const start = useRef<{ y: number; bottomH: number } | null>(null);
  const setBottomFrac = useLayoutStore((s) => s.setBottomFrac);
  return (
    <div
      className="chart-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize chart row"
      title="Drag to resize the chart row · double-click to reset"
      data-testid="row-split"
      onPointerDown={(e) => {
        // Keep the browser from starting a native drag / text selection mid-resize.
        e.preventDefault();
        start.current = { y: e.clientY, bottomH };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start.current) setBottomFrac((start.current.bottomH - (e.clientY - start.current.y)) / height);
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onDoubleClick={() => setBottomFrac(0.26)}
    >
      <span />
    </div>
  );
}

function ResizeHandle() {
  const start = useRef<{ y: number; h: number } | null>(null);
  return (
    <div
      className="chart-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize chart"
      onPointerDown={(e) => {
        // Keep the browser from starting a native drag / text selection mid-resize.
        e.preventDefault();
        start.current = { y: e.clientY, h: useLayoutStore.getState().chartHeight };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start.current) useLayoutStore.getState().setChartHeight(start.current.h + e.clientY - start.current.y);
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
    >
      <span />
    </div>
  );
}
