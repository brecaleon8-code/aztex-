import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, EyeOff, Lock, Bell, TrendingUp, Minus, AlignJustify, Square, Brush, Type, CircleDot } from 'lucide-react';
import { useUiStore } from '@/stores/useUiStore';
import { useChartStore } from '@/stores/useChartStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { usePositionStore } from '@/stores/usePositionStore';
import { usePriceAlertStore } from '@/stores/usePriceAlertStore';
import { cancelStopOrder, cancelWorkingOrder } from '@/stores/trading';
import { indicatorLabel } from '@/lib/indicators/compute';
import { fmtPrice, fmtQty } from '@/lib/format';
import type { Drawing } from '@/types';

const DRAWING: Record<Drawing['tool'], { label: string; icon: ReactNode }> = {
  trend: { label: 'Trend line', icon: <TrendingUp size={13} /> },
  ray: { label: 'Horizontal line', icon: <Minus size={13} /> },
  fib: { label: 'Fib retracement', icon: <AlignJustify size={13} /> },
  rect: { label: 'Rectangle', icon: <Square size={13} /> },
  brush: { label: 'Brush', icon: <Brush size={13} /> },
  text: { label: 'Text', icon: <Type size={13} /> },
};

/** Everything on the focused chart in one list — indicators, drawings, alerts and resting orders. */
export function ObjectTree() {
  const at = useUiStore((s) => s.objectTree);
  const close = useUiStore((s) => s.closeObjectTree);
  const symbol = useMarketStore((s) => s.selected);
  const tf = useMarketStore((s) => s.timeframe);
  const { indicators, drawings, drawingsLocked, drawingsHidden, selectedDrawing, toggleIndicatorHidden, removeIndicator, removeDrawing, selectDrawing, toggleDrawingsHidden } = useChartStore();
  const alerts = usePriceAlertStore((s) => s.alerts).filter((a) => a.symbol === symbol);
  const working = usePositionStore((s) => s.workingOrders).filter((o) => o.symbol === symbol);
  const stops = usePositionStore((s) => s.stopOrders).filter((o) => o.symbol === symbol);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!at || !ref.current) {
      setPos(null);
      return;
    }
    const r = ref.current.getBoundingClientRect();
    setPos({ left: at.x + r.width + 8 > window.innerWidth ? Math.max(8, at.x - r.width) : at.x, top: Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)) });
  }, [at]);
  useEffect(() => {
    if (!at) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, close]);

  if (!at) return null;
  return createPortal(
    <div
      ref={ref}
      className="object-tree"
      role="dialog"
      aria-label="Object tree"
      style={pos ? { left: pos.left, top: pos.top } : { left: at.x, top: at.y, visibility: 'hidden' }}
      data-testid="object-tree"
    >
      <div className="ot-head">
        <span className="ot-title">Object tree</span>
        <span className="mono faint">
          {symbol}/USDT · {tf}
        </span>
        <span className="spacer" />
        <button className="btn sm icon ghost" onClick={close} aria-label="Close object tree">
          <X size={13} />
        </button>
      </div>
      <Section title="Indicators" count={indicators.length}>
        {indicators.map((i) => (
          <Row key={i.id} icon={<span className="ot-swatch" style={{ background: i.color }} />} label={indicatorLabel(i)} dim={i.hidden} testId="ot-indicator">
            <button className="btn sm icon ghost" onClick={() => toggleIndicatorHidden(i.id)} aria-label={`${i.hidden ? 'Show' : 'Hide'} ${indicatorLabel(i)}`}>
              {i.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
            <button className="btn sm icon ghost" onClick={() => removeIndicator(i.id)} aria-label={`Remove ${indicatorLabel(i)}`}>
              <X size={12} />
            </button>
          </Row>
        ))}
      </Section>
      <Section
        title="Drawings"
        count={drawings.length}
        extra={
          <>
            {drawingsLocked && <Lock size={11} className="faint" aria-label="Locked" />}
            <button className="btn sm icon ghost" onClick={toggleDrawingsHidden} aria-label={drawingsHidden ? 'Show drawings' : 'Hide drawings'}>
              {drawingsHidden ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </>
        }
      >
        {drawings.map((d) => (
          <Row
            key={d.id}
            icon={DRAWING[d.tool].icon}
            label={d.tool === 'text' ? `Text “${d.text}”` : d.tool === 'ray' ? `Horizontal line ${fmtPrice(d.p1.price)}` : DRAWING[d.tool].label}
            active={d.id === selectedDrawing}
            onClick={drawingsLocked || drawingsHidden ? undefined : () => selectDrawing(d.id)}
            dim={drawingsHidden}
            testId="ot-drawing"
          >
            <button className="btn sm icon ghost" onClick={() => removeDrawing(d.id)} disabled={drawingsLocked} aria-label={`Remove ${DRAWING[d.tool].label}`}>
              <X size={12} />
            </button>
          </Row>
        ))}
      </Section>
      <Section title="Alerts" count={alerts.length}>
        {alerts.map((a) => (
          <Row key={a.id} icon={<Bell size={13} />} label={`${a.symbol} ${a.direction === 'above' ? '≥' : '≤'} ${fmtPrice(a.price)}`} testId="ot-alert">
            <button className="btn sm icon ghost" onClick={() => usePriceAlertStore.getState().remove(a.id)} aria-label={`Remove alert at ${fmtPrice(a.price)}`}>
              <X size={12} />
            </button>
          </Row>
        ))}
      </Section>
      <Section title="Orders" count={working.length + stops.length}>
        {working.map((o) => (
          <Row key={o.id} icon={<CircleDot size={13} />} label={`${o.side === 'Long' ? 'Buy' : 'Sell'} limit ${fmtQty(o.size)} @ ${fmtPrice(o.limitPrice)}`}>
            <button className="btn sm icon ghost" onClick={() => cancelWorkingOrder(o.id)} aria-label="Cancel order">
              <X size={12} />
            </button>
          </Row>
        ))}
        {stops.map((o) => (
          <Row key={o.id} icon={<CircleDot size={13} />} label={`${o.side === 'Long' ? 'Buy' : 'Sell'} stop ${fmtQty(o.size)} @ ${fmtPrice(o.triggerPrice)}`}>
            <button className="btn sm icon ghost" onClick={() => cancelStopOrder(o.id)} aria-label="Cancel stop">
              <X size={12} />
            </button>
          </Row>
        ))}
      </Section>
    </div>,
    document.body,
  );
}

function Section({ title, count, extra, children }: { title: string; count: number; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="ot-section">
      <div className="ot-group">
        <span>
          {title} <span className="mono">{count}</span>
        </span>
        <span className="spacer" />
        {extra}
      </div>
      {count === 0 ? <div className="ot-empty">None</div> : children}
    </div>
  );
}

function Row({ icon, label, children, dim, active, onClick, testId }: { icon: ReactNode; label: string; children: ReactNode; dim?: boolean; active?: boolean; onClick?: () => void; testId?: string }) {
  return (
    <div className={`ot-row ${dim ? 'dim' : ''} ${active ? 'active' : ''}`} data-testid={testId}>
      <span className="ot-icon">{icon}</span>
      {onClick ? (
        <button className="ot-label" onClick={onClick}>
          {label}
        </button>
      ) : (
        <span className="ot-label">{label}</span>
      )}
      {children}
    </div>
  );
}
