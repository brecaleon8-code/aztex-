import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Copy, BellPlus, ChevronUp, ChevronDown, SquarePlus, RotateCcw, ListTree, Settings, Trash2 } from 'lucide-react';
import { useUiStore } from '@/stores/useUiStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useChartStore } from '@/stores/useChartStore';
import { usePriceAlertStore } from '@/stores/usePriceAlertStore';
import { alertAt, onTick, quickKinds, quickOrder, ticketAt, ticketSizeAt } from '@/stores/quickTrade';
import { toast } from '@/stores/useToastStore';
import { fmtPrice, fmtQty, priceDecimals } from '@/lib/format';
import { CHART_RESET_EVENT } from './chartCursor';

/**
 * Right-click on a chart, TradingView style: act at the price under the pointer — copy it, set an
 * alert, buy/sell there (limit or stop by side of the market), load the ticket — plus view and
 * cleanup actions and the chart's settings.
 */
export function ChartContextMenu() {
  const ctx = useUiStore((s) => s.chartContext);
  const close = useUiStore((s) => s.closeChartContext);
  const last = useMarketStore((s) => (ctx ? s.assets[ctx.symbol]?.price : undefined));
  const indicators = useChartStore((s) => s.indicators.length);
  const drawings = useChartStore((s) => s.drawings.length);
  const locked = useChartStore((s) => s.drawingsLocked);
  const alerts = usePriceAlertStore((s) => (ctx ? s.alerts.filter((a) => a.symbol === ctx.symbol).length : 0));
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!ctx || !ref.current) {
      setPos(null);
      return;
    }
    const r = ref.current.getBoundingClientRect();
    setPos({ left: ctx.x + r.width + 8 > window.innerWidth ? Math.max(8, ctx.x - r.width) : ctx.x, top: Math.max(8, Math.min(ctx.y, window.innerHeight - r.height - 8)) });
  }, [ctx]);

  useEffect(() => {
    if (!ctx) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [ctx, close]);

  if (!ctx) return null;
  const sym = ctx.symbol;
  const price = ctx.price != null ? onTick(ctx.price) : null;
  const px = price != null ? fmtPrice(price, priceDecimals(price)) : '';
  const kinds = price != null && last != null ? quickKinds(price, last) : null;
  const qty = price != null ? ticketSizeAt(price) : 0;
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const ui = useUiStore.getState();

  return createPortal(
    <div
      ref={ref}
      className="menu chart-ctx"
      role="menu"
      aria-label="Chart actions"
      style={pos ? { position: 'fixed', left: pos.left, top: pos.top } : { position: 'fixed', left: ctx.x, top: ctx.y, visibility: 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="chart-context-menu"
    >
      {price != null && (
        <>
          <Item
            icon={<Copy size={14} />}
            onClick={run(() => {
              void navigator.clipboard?.writeText(String(price)).catch(() => {});
              toast({ kind: 'info', title: `Copied ${px}` });
            })}
            testId="ctx-copy"
          >
            Copy price {px}
          </Item>
          <div className="divider" />
          <Item icon={<BellPlus size={14} />} kbd="Alt+A" onClick={run(() => alertAt(sym, price))} testId="ctx-alert">
            Add alert on {sym} at {px}
          </Item>
          {kinds && (
            <>
              <Item icon={<ChevronUp size={14} />} kbd="Alt+Shift+B" onClick={run(() => orderToast(quickOrder(sym, 'Long', price)))} testId="ctx-buy">
                Buy {fmtQty(qty)} {sym} @ {px} {kinds.buy}
              </Item>
              <Item icon={<ChevronDown size={14} />} kbd="Alt+Shift+S" onClick={run(() => orderToast(quickOrder(sym, 'Short', price)))} testId="ctx-sell">
                Sell {fmtQty(qty)} {sym} @ {px} {kinds.sell}
              </Item>
            </>
          )}
          <Item icon={<SquarePlus size={14} />} kbd="Shift+T" onClick={run(() => ticketAt(sym, price))} testId="ctx-ticket">
            Add order on {sym} at {px}…
          </Item>
          <div className="divider" />
        </>
      )}
      <Item icon={<RotateCcw size={14} />} kbd="Alt+R" onClick={run(() => window.dispatchEvent(new Event(CHART_RESET_EVENT)))} testId="ctx-reset">
        Reset chart view
      </Item>
      <Item icon={<ListTree size={14} />} onClick={run(() => ui.openObjectTree({ x: ctx.x, y: ctx.y }))} testId="ctx-objects">
        Object tree
      </Item>
      {(indicators > 0 || drawings > 0 || alerts > 0) && <div className="divider" />}
      {indicators > 0 && (
        <Item icon={<Trash2 size={14} />} onClick={run(() => useChartStore.getState().indicators.forEach((i) => useChartStore.getState().removeIndicator(i.id)))} testId="ctx-remove-indicators">
          Remove {indicators} indicator{indicators === 1 ? '' : 's'}
        </Item>
      )}
      {drawings > 0 && (
        <Item icon={<Trash2 size={14} />} disabled={locked} onClick={run(() => useChartStore.getState().clearDrawings())} testId="ctx-remove-drawings" title={locked ? 'Drawings are locked' : undefined}>
          Remove {drawings} drawing{drawings === 1 ? '' : 's'}
        </Item>
      )}
      {alerts > 0 && (
        <Item icon={<Trash2 size={14} />} onClick={run(() => usePriceAlertStore.getState().removeFor(sym))} testId="ctx-remove-alerts">
          Remove {alerts} alert{alerts === 1 ? '' : 's'} on {sym}
        </Item>
      )}
      <div className="divider" />
      <Item icon={<Settings size={14} />} kbd="Ctrl+," onClick={run(() => ui.openChartMenu({ x: ctx.x, y: ctx.y }))} testId="ctx-settings">
        Settings…
      </Item>
    </div>,
    document.body,
  );
}

function orderToast(r: { ok: true } | { ok: false; error: string }) {
  if (!r.ok) toast({ kind: 'error', title: 'Order rejected', detail: r.error });
}

function Item({ icon, kbd, children, onClick, disabled, testId, title }: { icon: ReactNode; kbd?: string; children: ReactNode; onClick: () => void; disabled?: boolean; testId?: string; title?: string }) {
  return (
    <button className="menu-item ctx-item" role="menuitem" onClick={onClick} disabled={disabled} data-testid={testId} title={title}>
      <span className="ctx-icon">{icon}</span>
      <span className="grow">{children}</span>
      {kbd && <span className="ctx-kbd">{kbd}</span>}
    </button>
  );
}
