import { useEffect, useRef } from 'react';
import { Star, Maximize2, Minimize2, MousePointer2, TrendingUp, MoveRight, Square, Type, AlignJustify, Trash2, X } from 'lucide-react';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { useMarketStore } from '@/stores/useMarketStore';
import { useChartStore } from '@/stores/useChartStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { indicatorLabel } from '@/lib/indicators/compute';
import { fmtPct, fmtPrice } from '@/lib/format';
import type { ChartMode, DrawingTool, Timeframe } from '@/types';
import { PriceChart } from './PriceChart';
import { useTickFlash } from '@/app/useTickFlash';
import { IndicatorMenu } from './IndicatorMenu';
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

export function ChartPanel({ drag }: { drag?: PanelDragProps }) {
  const symbol = useMarketStore((s) => s.selected);
  const asset = useMarketStore((s) => s.assets[s.selected]);
  const tf = useMarketStore((s) => s.timeframe);
  const inWatch = useMarketStore((s) => s.watchlist.includes(s.selected));
  const { mode, setMode, tool, setTool, indicators, removeIndicator, drawings, clearDrawings, profile, toggleProfile } = useChartStore();
  const { chartMaximized, toggleChartMaximized } = useLayoutStore();
  const flash = useTickFlash(asset.price);

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
        <IndicatorMenu />
        <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
          {indicators.map((i) => (
            <span key={i.id} className="chip" data-testid="indicator-chip">
              <span className="swatch" style={{ background: i.color }} />
              {indicatorLabel(i)}
              <button aria-label={`Remove ${indicatorLabel(i)}`} onClick={() => removeIndicator(i.id)}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <span className="spacer" />
        <Segmented<ChartMode>
          ariaLabel="Chart mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'candles', label: 'Candles' },
            { value: 'heikin', label: 'HA', title: 'Heikin-Ashi' },
            { value: 'bars', label: 'Bars' },
            { value: 'line', label: 'Line' },
            { value: 'area', label: 'Area' },
          ]}
        />
      </div>
      <PriceChart />
      <ResizeHandle />
    </Panel>
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
