import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Check, Plus, Bell, CandlestickChart, Trash2, Eye, EyeOff, X, SlidersHorizontal, Crosshair, TrendingUp, Minus, AlignJustify, Square, Brush, Type, Ruler, ZoomIn, Magnet, Lock, LockOpen, Undo2, type LucideIcon } from 'lucide-react';
import { useMarketStore } from '@/stores/useMarketStore';
import { usePositionStore } from '@/stores/usePositionStore';
import { useChartStore } from '@/stores/useChartStore';
import { toChartIndicator, useStudioStore } from '@/stores/useStudioStore';
import { closePosition, modifyLevels } from '@/stores/trading';
import { alertAt } from '@/stores/quickTrade';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { tickSize } from '@/lib/mock/orderbook';
import { indicatorLabel } from '@/lib/indicators/compute';
import { rMultiple } from '@/lib/trading/risk';
import { fmtPct, fmtPrice, fmtQty, fmtSigned, fmtTime, fmtUsd } from '@/lib/format';
import { PRESETS } from '@/modules/terminal/chart/IndicatorMenu';
import { ChartSettingsSections } from '@/modules/terminal/chart/ChartSettingsMenu';
import type { DrawingTool } from '@/types';
import { useMobileStore, type MobileSheet } from '../useMobileStore';
import { BottomSheet } from '../BottomSheet';
import { OrderSheet } from './OrderSheet';
import { Stepper, decimalsOf } from './Stepper';

/** Whichever sheet is open (one at a time). */
export function MobileSheets() {
  const sheet = useMobileStore((s) => s.sheet);
  const close = useMobileStore((s) => s.close);
  if (!sheet) return null;
  return <SheetFor key={JSON.stringify(sheet)} sheet={sheet} close={close} />;
}

function SheetFor({ sheet, close }: { sheet: MobileSheet; close: () => void }) {
  switch (sheet.kind) {
    case 'order':
      return <OrderSheet onClose={close} side={sheet.side} type={sheet.type} price={sheet.price} symbol={sheet.symbol} />;
    case 'position':
      return <PositionSheet id={sheet.id} onClose={close} />;
    case 'symbol':
      return <SymbolSheet purpose={sheet.purpose} onClose={close} />;
    case 'quote':
      return <QuoteSheet symbol={sheet.symbol} onClose={close} />;
    case 'indicators':
      return <IndicatorsSheet onClose={close} />;
    case 'tools':
      return <ToolsSheet onClose={close} />;
    case 'chart-settings':
      return (
        <BottomSheet title="Chart settings" onClose={close} testId="m-chart-settings-sheet" tall>
          <div className="m-settings">
            <ChartSettingsSections />
          </div>
        </BottomSheet>
      );
  }
}

/** Position details (MT5): entry → now, P/L, R, move SL / TP, close. */
function PositionSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const p = usePositionStore((s) => s.positions.find((x) => x.id === id));
  const [tp, setTp] = useState<number | null>(null);
  const [sl, setSl] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  if (!p)
    return (
      <BottomSheet title="Position closed" onClose={onClose}>
        <p className="m-hint">This position is no longer open — see History for the fill.</p>
      </BottomSheet>
    );
  const step = tickSize(p.current) * 10;
  const pct = ((p.current - p.entry) / p.entry) * 100 * (p.side === 'Long' ? 1 : -1);
  const r = rMultiple(p.side, p.entry, p.sl, p.current);
  const changed = (tp != null && tp !== p.tp) || (sl != null && sl !== p.sl);
  return (
    <BottomSheet
      title={
        <span>
          {p.symbol} <span className={p.side === 'Long' ? 'up' : 'down'}>{p.side === 'Long' ? 'buy' : 'sell'}</span> <span className="mono">{fmtQty(p.size)}</span>
        </span>
      }
      sub={`Opened ${fmtTime(p.openedAt, false)}${p.bracket ? ' · SL/TP live (OCO)' : ' · SL/TP alerts'}`}
      onClose={onClose}
      testId="m-position-sheet"
      footer={
        <button
          className={`m-confirm close ${p.pnl >= 0 ? 'win' : 'loss'}`}
          onClick={() => {
            void closePosition(p.id);
            onClose();
          }}
          data-testid="m-close-position"
        >
          Close position · {fmtSigned(p.pnl)} USDT
        </button>
      }
    >
      <dl className="m-preview big">
        <div>
          <dt>Entry</dt>
          <dd className="mono">{fmtPrice(p.entry)}</dd>
        </div>
        <div>
          <dt>Now</dt>
          <dd className="mono">{fmtPrice(p.current)}</dd>
        </div>
        <div>
          <dt>P/L</dt>
          <dd className={`mono ${p.pnl >= 0 ? 'up' : 'down'}`}>
            {fmtSigned(p.pnl)} <small>({fmtPct(pct)})</small>
          </dd>
        </div>
        <div>
          <dt>R multiple</dt>
          <dd className="mono">{r == null ? '—' : `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`}</dd>
        </div>
        <div>
          <dt>Notional</dt>
          <dd className="mono">{fmtUsd(p.entry * p.size)}</dd>
        </div>
      </dl>
      <div className="m-field two">
        <Stepper label="Stop loss" value={sl ?? p.sl} step={step} onChange={setSl} testId="m-pos-sl" decimals={decimalsOf(step / 10)} />
        <Stepper label="Take profit" value={tp ?? p.tp} step={step} onChange={setTp} testId="m-pos-tp" decimals={decimalsOf(step / 10)} />
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="m-actions">
        <button
          className="m-btn"
          disabled={!changed}
          onClick={() => {
            const res = modifyLevels(p.id, tp ?? p.tp, sl ?? p.sl);
            if (res.ok) {
              setTp(null);
              setSl(null);
              setError(null);
            } else setError(res.error);
          }}
          data-testid="m-save-levels"
        >
          <SlidersHorizontal size={15} /> Save SL / TP
        </button>
        <button
          className="m-btn"
          onClick={() => {
            useMarketStore.getState().select(p.symbol);
            onClose();
            navigate('/terminal');
          }}
        >
          <CandlestickChart size={15} /> Chart
        </button>
      </div>
    </BottomSheet>
  );
}

/** Symbol search: pick the chart's symbol, or add / remove watchlist symbols. */
function SymbolSheet({ purpose, onClose }: { purpose: 'chart' | 'watch'; onClose: () => void }) {
  const [q, setQ] = useState('');
  const assets = useMarketStore((s) => s.assets);
  const watchlist = useMarketStore((s) => s.watchlist);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ASSET_UNIVERSE.filter((a) => !s || a.symbol.toLowerCase().includes(s) || a.name.toLowerCase().includes(s));
  }, [q]);
  return (
    <BottomSheet title={purpose === 'chart' ? 'Symbol' : 'Add to quotes'} onClose={onClose} testId="m-symbol-sheet" tall>
      <label className="m-search">
        <Search size={16} />
        <input autoFocus placeholder="Search crypto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search crypto" />
      </label>
      <ul className="m-list flush">
        {results.map((a) => {
          const px = assets[a.symbol];
          const inList = watchlist.includes(a.symbol);
          return (
            <li key={a.symbol}>
              <button
                className="m-row"
                onClick={() => {
                  if (purpose === 'chart') {
                    useMarketStore.getState().select(a.symbol);
                    onClose();
                  } else useMarketStore.getState().toggleWatch(a.symbol);
                }}
                data-testid={`m-pick-${a.symbol}`}
              >
                <span className="m-q-badge">{a.symbol.slice(0, 1)}</span>
                <span className="m-row-main">
                  <b>{a.symbol}</b>
                  <span className="m-row-sub">{a.name}</span>
                </span>
                {px && (
                  <span className="m-row-right">
                    <span className="mono">{fmtPrice(px.price)}</span>
                    <span className={`mono ${px.change24h >= 0 ? 'up' : 'down'}`}>{fmtPct(px.change24h)}</span>
                  </span>
                )}
                {purpose === 'watch' && <span className={`m-add ${inList ? 'on' : ''}`}>{inList ? <Check size={16} /> : <Plus size={16} />}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}

/** Long-press / ⋯ on a quote (MT5): trade, chart, alert, remove. */
function QuoteSheet({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const a = useMarketStore((s) => s.assets[symbol]);
  const navigate = useNavigate();
  const { open } = useMobileStore.getState();
  return (
    <BottomSheet
      title={symbol}
      sub={
        <span className="mono">
          {fmtPrice(a.bid)} / {fmtPrice(a.ask)} · <span className={a.change24h >= 0 ? 'up' : 'down'}>{fmtPct(a.change24h)}</span>
        </span>
      }
      onClose={onClose}
      testId="m-quote-sheet"
    >
      <div className="m-card">
        <button className="m-item" onClick={() => open({ kind: 'order', symbol })} data-testid="m-quote-trade">
          <span className="m-item-icon">
            <Plus size={18} />
          </span>
          <span className="m-item-label">New order</span>
        </button>
        <button
          className="m-item"
          onClick={() => {
            useMarketStore.getState().select(symbol);
            onClose();
            navigate('/terminal');
          }}
        >
          <span className="m-item-icon">
            <CandlestickChart size={18} />
          </span>
          <span className="m-item-label">Chart</span>
        </button>
        <button
          className="m-item"
          onClick={() => {
            alertAt(symbol, a.price);
            onClose();
          }}
          data-testid="m-quote-alert"
        >
          <span className="m-item-icon">
            <Bell size={18} />
          </span>
          <span className="m-item-label">Alert at {fmtPrice(a.price)}</span>
        </button>
        <button
          className="m-item danger"
          onClick={() => {
            useMarketStore.getState().removeWatch(symbol);
            onClose();
          }}
          data-testid="m-quote-remove"
        >
          <span className="m-item-icon">
            <Trash2 size={18} />
          </span>
          <span className="m-item-label">Remove from quotes</span>
        </button>
      </div>
    </BottomSheet>
  );
}

/** Indicators on the chart (show / edit / remove) and the ones you can add. */
function IndicatorsSheet({ onClose }: { onClose: () => void }) {
  const { indicators, addIndicator, removeIndicator, toggleIndicatorHidden, openEditor } = useChartStore();
  const mine = useStudioStore((s) => s.indicators);
  return (
    <BottomSheet title="Indicators" sub={`${indicators.length} on the chart`} onClose={onClose} testId="m-indicators-sheet" tall>
      <div className="m-section-head">On the chart</div>
      <ul className="m-list flush">
        {indicators.map((i) => (
          <li key={i.id} className="m-row">
            <span className="m-dot-swatch" style={{ background: i.color }} />
            <button
              className="m-row-main link"
              onClick={(e) => {
                const el = e.currentTarget;
                onClose();
                openEditor(i.id, el);
              }}
            >
              <b>{indicatorLabel(i)}</b>
              <span className="m-row-sub">Tap to edit</span>
            </button>
            <button className="m-icon-btn" onClick={() => toggleIndicatorHidden(i.id)} aria-label={`${i.hidden ? 'Show' : 'Hide'} ${indicatorLabel(i)}`}>
              {i.hidden ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
            <button className="m-icon-btn" onClick={() => removeIndicator(i.id)} aria-label={`Remove ${indicatorLabel(i)}`}>
              <X size={17} />
            </button>
          </li>
        ))}
        {indicators.length === 0 && <li className="m-empty">No indicators yet.</li>}
      </ul>
      <div className="m-section-head">Add</div>
      <div className="m-grid-btns">
        {PRESETS.map(({ label, ...p }) => (
          <button key={label} onClick={() => addIndicator(p)} data-testid={`m-add-ind-${label}`}>
            <i style={{ background: p.color }} />
            {label}
          </button>
        ))}
        {mine.map((u) => (
          <button key={u.id} onClick={() => addIndicator(toChartIndicator(u))}>
            <i style={{ background: u.color }} />
            {u.name}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

const TOOLS: { tool: DrawingTool; icon: LucideIcon; label: string }[] = [
  { tool: 'cursor', icon: Crosshair, label: 'Cross' },
  { tool: 'trend', icon: TrendingUp, label: 'Trend line' },
  { tool: 'ray', icon: Minus, label: 'Horizontal' },
  { tool: 'fib', icon: AlignJustify, label: 'Fib' },
  { tool: 'rect', icon: Square, label: 'Rectangle' },
  { tool: 'brush', icon: Brush, label: 'Brush' },
  { tool: 'text', icon: Type, label: 'Text' },
  { tool: 'measure', icon: Ruler, label: 'Measure' },
  { tool: 'zoom', icon: ZoomIn, label: 'Zoom' },
];

/** Drawing tools (TradingView app's pencil): pick a tool, then draw on the chart. */
function ToolsSheet({ onClose }: { onClose: () => void }) {
  const { tool, setTool, magnet, toggleMagnet, drawingsLocked, toggleDrawingsLocked, drawingsHidden, toggleDrawingsHidden, drawings, clearDrawings, drawingUndo, undoDrawings } = useChartStore();
  return (
    <BottomSheet title="Drawing tools" sub={`${drawings.length} drawing${drawings.length === 1 ? '' : 's'} on this chart`} onClose={onClose} testId="m-tools-sheet">
      <div className="m-tools">
        {TOOLS.map(({ tool: t, icon: Icon, label }) => (
          <button
            key={t}
            className={tool === t ? 'on' : ''}
            aria-pressed={tool === t}
            onClick={() => {
              setTool(t);
              onClose();
            }}
            data-testid={`m-tool-${t}`}
          >
            <Icon size={22} strokeWidth={1.6} />
            {label}
          </button>
        ))}
      </div>
      <div className="m-tools toggles">
        <button className={magnet ? 'on' : ''} aria-pressed={magnet} onClick={toggleMagnet}>
          <Magnet size={20} strokeWidth={1.6} /> Magnet
        </button>
        <button className={drawingsLocked ? 'on' : ''} aria-pressed={drawingsLocked} onClick={toggleDrawingsLocked}>
          {drawingsLocked ? <Lock size={20} strokeWidth={1.6} /> : <LockOpen size={20} strokeWidth={1.6} />} Lock
        </button>
        <button className={drawingsHidden ? 'on' : ''} aria-pressed={drawingsHidden} onClick={toggleDrawingsHidden}>
          {drawingsHidden ? <EyeOff size={20} strokeWidth={1.6} /> : <Eye size={20} strokeWidth={1.6} />} Hide
        </button>
        <button onClick={() => undoDrawings()} disabled={drawingUndo.length === 0}>
          <Undo2 size={20} strokeWidth={1.6} /> Undo
        </button>
        <button onClick={clearDrawings} disabled={drawings.length === 0 || drawingsLocked} data-testid="m-clear-drawings">
          <Trash2 size={20} strokeWidth={1.6} /> Clear
        </button>
      </div>
    </BottomSheet>
  );
}
