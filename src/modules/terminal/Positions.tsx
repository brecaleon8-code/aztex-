import { X } from 'lucide-react';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { usePositionStore, totalUnrealized } from '@/stores/usePositionStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { cancelWorkingOrder, closePosition } from '@/stores/trading';
import { fmtPct, fmtPrice, fmtQty, fmtSigned } from '@/lib/format';
import { pnlPct, progressOnRange } from '@/lib/trading/pnl';
import type { Position } from '@/types';

export function Positions({ drag }: { drag?: PanelDragProps }) {
  const positions = usePositionStore((s) => s.positions);
  const working = usePositionStore((s) => s.workingOrders);
  const total = totalUnrealized(positions);

  return (
    <Panel
      title="Positions"
      sub={`${positions.length} open${working.length ? ` · ${working.length} working` : ''}`}
      drag={drag}
      flush
      testId="positions"
      actions={
        positions.length > 0 && (
          <span className={`num ${total >= 0 ? 'up' : 'down'}`} data-testid="positions-total">
            {fmtSigned(total)} USDT
          </span>
        )
      }
    >
      <div className="positions">
        {positions.length === 0 && working.length === 0 && <div className="empty">No open positions. Place an order from the ticket, the book, or the CLI.</div>}
        {positions.map((p) => (
          <PositionRow key={p.id} p={p} />
        ))}
        {working.length > 0 && (
          <>
            <div className="pos-section label">Working orders</div>
            {working.map((o) => (
              <div key={o.id} className="pos-working" data-testid="working-order">
                <span className="mono" style={{ fontWeight: 600 }}>{o.symbol}</span>
                <span className={`badge ${o.side === 'Long' ? 'long' : 'short'}`}>{o.side}</span>
                <span className="badge neutral">Limit</span>
                <span className="num">{fmtQty(o.size)}</span>
                <span className="label">@</span>
                <span className="num">{fmtPrice(o.limitPrice)}</span>
                <span className="spacer" />
                <button className="btn sm ghost" onClick={() => cancelWorkingOrder(o.id)}>Cancel</button>
              </div>
            ))}
          </>
        )}
      </div>
    </Panel>
  );
}

function PositionRow({ p }: { p: Position }) {
  const closing = usePositionStore((s) => !!s.closing[p.id]);
  const pulseAt = usePositionStore((s) => s.highlight[p.id]);
  const select = useMarketStore((s) => s.select);
  const pos = progressOnRange(p.side, p.sl, p.entry, p.tp, p.current);
  const pct = pnlPct(p.side, p.entry, p.current);

  return (
    <div className={`pos-row ${closing ? 'closing' : ''}`} data-testid="position-row">
      {pulseAt && <span className="pulse-ring" key={pulseAt} />}
      <div className="row">
        <button className="pos-sym" onClick={() => select(p.symbol)} title="Show on chart">
          {p.symbol}
        </button>
        <span className={`badge ${p.side === 'Long' ? 'long' : 'short'}`}>{p.side}</span>
        <span className="num faint">{fmtQty(p.size)}</span>
        {p.tpHit && <span className="badge long">TP hit</span>}
        {p.slHit && <span className="badge short">SL hit</span>}
        <span className="spacer" />
        <span className={`num pos-pnl ${p.pnl >= 0 ? 'up' : 'down'}`} data-testid="position-pnl">
          {fmtSigned(p.pnl)}
        </span>
        <span className={`num ${pct >= 0 ? 'up' : 'down'}`} style={{ width: 62, textAlign: 'right' }}>{fmtPct(pct)}</span>
        <button className="btn sm" onClick={() => closePosition(p.id)} disabled={closing} data-testid="close-position">
          <X size={12} /> Close
        </button>
      </div>
      <div className="pos-bar" aria-hidden>
        <span className="pos-bar-loss" />
        <span className="pos-bar-profit" />
        <span className="pos-bar-entry" />
        <span className="pos-bar-marker" style={{ left: `${pos * 100}%` }} />
      </div>
      <div className="row pos-levels">
        <span className="label">SL</span>
        <span className="num down">{fmtPrice(p.sl)}</span>
        <span className="spacer" />
        <span className="label">Entry</span>
        <span className="num">{fmtPrice(p.entry)}</span>
        <span className="label" style={{ marginLeft: 8 }}>Mark</span>
        <span className="num">{fmtPrice(p.current)}</span>
        <span className="spacer" />
        <span className="label">TP</span>
        <span className="num up">{fmtPrice(p.tp)}</span>
      </div>
    </div>
  );
}
