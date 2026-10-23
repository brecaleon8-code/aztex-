import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GripVertical, Minus, Pencil, Plus } from 'lucide-react';
import { useMarketStore } from '@/stores/useMarketStore';
import { fmtPct, fmtPrice, fmtTime } from '@/lib/format';
import { Segmented } from '@/components/ui/Segmented';
import { useSpark } from '@/modules/terminal/useSpark';
import { useMobileStore, type QuotesMode } from '../useMobileStore';
import { MHeader } from '../MobileApp';
import { splitQuote, spreadPoints } from '../quoteFormat';

const LONG_PRESS_MS = 450;
const EDIT_ROW_H = 56;

/**
 * Quotes, laid out like MT5's: Simple (symbol, bid, ask) or Advanced (tick time, spread, and the
 * day's low / high under the prices). Prices are coloured by their last tick and the digits that
 * move are enlarged, with the last digit raised. Tap a row for its chart, hold it for actions; the
 * pencil edits the list (remove, drag to reorder).
 */
export function QuotesScreen() {
  const watchlist = useMarketStore((s) => s.watchlist);
  const mode = useMobileStore((s) => s.quotesMode);
  const { open, setQuotesMode } = useMobileStore.getState();
  const [editing, setEditing] = useState(false);
  return (
    <div className="m-page">
      <MHeader
        title={
          <div className="m-quotes-mode" data-testid="m-quotes-mode">
            <Segmented<QuotesMode>
              value={mode}
              onChange={setQuotesMode}
              ariaLabel="Quotes view"
              options={[
                { value: 'simple', label: 'Simple' },
                { value: 'advanced', label: 'Advanced' },
              ]}
            />
          </div>
        }
        left={
          <button className={`m-icon-btn ${editing ? 'on' : ''}`} onClick={() => setEditing(!editing)} aria-pressed={editing} aria-label="Edit symbols" data-testid="m-edit-quotes">
            <Pencil size={18} />
          </button>
        }
        right={
          editing ? (
            <button className="m-text-btn" onClick={() => setEditing(false)} data-testid="m-edit-done">
              Done
            </button>
          ) : (
            <button className="m-icon-btn" onClick={() => open({ kind: 'symbol', purpose: 'watch' })} aria-label="Add symbol" data-testid="m-add-symbol">
              <Plus size={21} />
            </button>
          )
        }
      />
      <div className="m-scroll">
        {editing ? (
          <EditList watchlist={watchlist} />
        ) : (
          <>
            {mode === 'simple' && (
              <div className="m-quotes-cols" aria-hidden>
                <span>Symbol</span>
                <span>Bid</span>
                <span>Ask</span>
              </div>
            )}
            <ul className={`m-quotes ${mode}`} data-testid="m-quotes">
              {watchlist.map((s) => (
                <QuoteRow key={s} symbol={s} mode={mode} />
              ))}
            </ul>
          </>
        )}
        {watchlist.length === 0 && <div className="m-empty">No symbols. Tap + to add some.</div>}
      </div>
    </div>
  );
}

function Quote({ v, dir }: { v: number; dir: string }) {
  const { head, big, sup } = splitQuote(fmtPrice(v));
  return (
    <span className={`m-px ${dir}`}>
      {head}
      <b>{big}</b>
      {sup && <sup>{sup}</sup>}
    </span>
  );
}

/** Direction and time of the last price change. The colour holds until the next tick, as in MT5. */
function useLastTick(price: number | undefined) {
  const last = useRef<{ p?: number; dir: '' | 'up' | 'down'; time: number }>({ dir: '', time: Date.now() });
  const l = last.current;
  if (price != null && l.p != null && price !== l.p) {
    l.dir = price > l.p ? 'up' : 'down';
    l.time = Date.now();
  }
  l.p = price;
  return l;
}

function QuoteRow({ symbol, mode }: { symbol: string; mode: QuotesMode }) {
  const a = useMarketStore((s) => s.assets[symbol]);
  const spark = useSpark(symbol);
  const tick = useLastTick(a?.price);
  const navigate = useNavigate();
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const held = useRef(false);
  if (!a) return null;
  const actions = () => useMobileStore.getState().open({ kind: 'quote', symbol });
  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const advanced = mode === 'advanced';
  return (
    <li
      className={`m-quote ${mode}`}
      data-testid={`m-quote-${symbol}`}
      onPointerDown={(e) => {
        held.current = false;
        cancel();
        press.current = {
          x: e.clientX,
          y: e.clientY,
          timer: setTimeout(() => {
            held.current = true;
            press.current = null;
            navigator.vibrate?.(8);
            actions();
          }, LONG_PRESS_MS),
        };
      }}
      onPointerMove={(e) => {
        if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!held.current) actions();
        held.current = true;
      }}
      onClick={() => {
        if (held.current) return;
        useMarketStore.getState().select(symbol);
        navigate('/terminal');
      }}
    >
      <span className="m-q-sym">
        {advanced && <span className="m-q-meta">{fmtTime(tick.time)}</span>}
        <b>{symbol}</b>
        {advanced ? (
          <span className="m-q-meta">Spread: {spreadPoints(a.bid, a.ask)}</span>
        ) : (
          <span className={`m-q-meta ${a.change24h >= 0 ? 'up' : 'down'}`}>{fmtPct(a.change24h)}</span>
        )}
      </span>
      <span className="m-q-side" data-testid="m-bid">
        <Quote v={a.bid} dir={tick.dir} />
        {advanced && <span className="m-q-meta">Low: {fmtPrice(Math.min(spark.low ?? a.bid, a.bid))}</span>}
      </span>
      <span className="m-q-side" data-testid="m-ask">
        <Quote v={a.ask} dir={tick.dir} />
        {advanced && <span className="m-q-meta">High: {fmtPrice(Math.max(spark.high ?? a.ask, a.ask))}</span>}
      </span>
    </li>
  );
}

/** MT5's edit list: remove with the red button, drag the handle to reorder. */
function EditList({ watchlist }: { watchlist: string[] }) {
  const { removeWatch, moveWatch } = useMarketStore.getState();
  const [drag, setDrag] = useState<{ symbol: string; from: number; y0: number; dy: number } | null>(null);
  const to = drag ? Math.max(0, Math.min(watchlist.length - 1, drag.from + Math.round(drag.dy / EDIT_ROW_H))) : -1;
  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < i && i <= to) return -EDIT_ROW_H;
    if (to <= i && i < drag.from) return EDIT_ROW_H;
    return 0;
  };
  return (
    <ul className="m-quotes-edit" data-testid="m-quotes-edit">
      {watchlist.map((s, i) => (
        <li
          key={s}
          className={`m-edit-row ${drag?.symbol === s ? 'dragging' : ''}`}
          style={{ height: EDIT_ROW_H, transform: `translateY(${drag?.symbol === s ? drag.dy : shift(i)}px)` }}
          data-testid={`m-edit-${s}`}
        >
          <button className="m-edit-remove" onClick={() => removeWatch(s)} aria-label={`Remove ${s}`}>
            <Minus size={14} strokeWidth={3} />
          </button>
          <b>{s}</b>
          <span
            className="m-edit-handle"
            role="button"
            aria-label={`Drag to reorder ${s}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ symbol: s, from: i, y0: e.clientY, dy: 0 });
            }}
            onPointerMove={(e) => drag?.symbol === s && setDrag({ ...drag, dy: e.clientY - drag.y0 })}
            onPointerUp={() => {
              if (drag?.symbol === s && to !== drag.from) moveWatch(s, to);
              setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
          >
            <GripVertical size={18} />
          </span>
        </li>
      ))}
    </ul>
  );
}
