import { useState } from 'react';
import { X } from 'lucide-react';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { useExecutionStore, isLive } from '@/stores/useExecutionStore';
import { usePositionStore } from '@/stores/usePositionStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { cancelBracketLeg, cancelWorkingOrder } from '@/stores/trading';
import { executionQuality, orderSlippage } from '@/lib/trading/quality';
import { fmtPrice, fmtQty, fmtTime, fmtUsd } from '@/lib/format';
import type { OrderRecord } from '@/types';

type Tab = 'open' | 'orders' | 'fills' | 'tca';

const KIND: Record<OrderRecord['kind'], string> = { market: 'MKT', limit: 'LMT', take_profit: 'TP', stop_loss: 'STOP', twap: 'TWAP', close: 'CLOSE' };
const STATUS: Record<OrderRecord['status'], string> = { new: 'Working', partially_filled: 'Partial', filled: 'Filled', cancelled: 'Cancelled', rejected: 'Rejected' };

function statusLabel(o: OrderRecord) {
  if (o.status === 'cancelled' && o.filledQty > 0) return 'Part-filled · rest cancelled';
  return STATUS[o.status];
}

const fmtBp = (v: number | null) => (v == null ? '—' : Math.abs(v) < 0.05 ? '0.0' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`);

function Flags({ o }: { o: OrderRecord }) {
  const f: string[] = [];
  if (o.kind === 'limit') f.push(o.tif);
  if (o.postOnly) f.push('PO');
  if (o.reduceOnly && o.source !== 'bracket' && o.kind !== 'close') f.push('RO');
  if (o.source === 'bracket') f.push('OCO');
  else if (o.bracket) f.push('BRKT');
  return (
    <span className="bl-flags">
      {f.map((x) => (
        <span key={x} className="bl-flag" title={{ GTC: 'Good till cancelled', IOC: 'Immediate or cancel', FOK: 'Fill or kill', PO: 'Post-only', RO: 'Reduce-only', OCO: 'One-cancels-other exit', BRKT: 'Entry with bracket exits' }[x]}>
          {x}
        </span>
      ))}
    </span>
  );
}

/** Orders & fills blotter: working orders, full lifecycle history, fills, and execution quality (TCA). */
export function Blotter({ drag }: { drag?: PanelDragProps }) {
  const [tab, setTab] = useState<Tab>('open');
  const [onlySel, setOnlySel] = useState(false);
  const orders = useExecutionStore((s) => s.orders);
  const fills = useExecutionStore((s) => s.fills);
  const working = usePositionStore((s) => s.workingOrders);
  const positions = usePositionStore((s) => s.positions);
  const selected = useMarketStore((s) => s.selected);
  const select = useMarketStore((s) => s.select);
  const mine = <T extends { symbol: string }>(xs: T[]) => (onlySel ? xs.filter((x) => x.symbol === selected) : xs);

  const live = mine(orders.filter(isLive));
  const q = executionQuality(mine(orders), mine(fills));
  const posSize = (id?: string) => positions.find((p) => p.id === id)?.size;

  return (
    <Panel
      code="OMS"
      title="Orders & fills"
      sub={`${live.length} working`}
      drag={drag}
      flush
      testId="blotter"
      actions={
        <>
          <button className={`btn sm ${onlySel ? 'active' : ''}`} onClick={() => setOnlySel((v) => !v)} aria-pressed={onlySel} title="Only the selected symbol">
            {selected}
          </button>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            ariaLabel="Blotter view"
            options={[
              { value: 'open', label: `Open${live.length ? ` ${live.length}` : ''}` },
              { value: 'orders', label: 'Orders' },
              { value: 'fills', label: 'Fills' },
              { value: 'tca', label: 'Quality' },
            ]}
          />
        </>
      }
    >
      <div className="blotter">
        {tab === 'open' && (
          <table className="bl-table" data-testid="blotter-open">
            <thead>
              <tr>
                <th>Time</th>
                <th>Symbol</th>
                <th>Type</th>
                <th className="r">Qty</th>
                <th className="r">Price</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {live.map((o) => {
                const w = working.find((x) => x.id === o.id);
                const qty = o.source === 'bracket' ? posSize(o.positionId) ?? o.qty : o.qty;
                return (
                  <tr key={o.id} data-testid="blotter-open-row">
                    <td className="mono faint">{fmtTime(o.createdAt, false)}</td>
                    <td>
                      <button className="bl-sym" onClick={() => select(o.symbol)}>
                        {o.symbol}
                      </button>{' '}
                      <span className={`bl-side ${o.side === 'Long' ? 'buy' : 'sell'}`}>{o.side === 'Long' ? 'BUY' : 'SELL'}</span>
                    </td>
                    <td>
                      <span className="bl-kind">{KIND[o.kind]}</span> <Flags o={o} />
                    </td>
                    <td className="r mono">
                      {o.filledQty > 0 && o.source !== 'bracket' ? `${fmtQty(o.filledQty)}/` : ''}
                      {fmtQty(qty)}
                    </td>
                    <td className="r mono">{fmtPrice(o.limitPrice ?? o.triggerPrice ?? 0)}</td>
                    <td>
                      <span className={`bl-status s-${o.status}`}>{o.source === 'bracket' ? (o.kind === 'stop_loss' ? 'Armed' : 'Working') : statusLabel(o)}</span>
                    </td>
                    <td className="r">
                      <button
                        className="btn sm ghost icon"
                        aria-label={`Cancel ${KIND[o.kind]} ${o.symbol}`}
                        onClick={() => (o.source === 'bracket' ? cancelBracketLeg(o.id) : w ? cancelWorkingOrder(o.id) : null)}
                        data-testid="blotter-cancel"
                      >
                        <X size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {live.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    No working orders. Resting limits and bracket exits show here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'orders' && (
          <table className="bl-table" data-testid="blotter-orders">
            <thead>
              <tr>
                <th>Time</th>
                <th>Symbol</th>
                <th>Type</th>
                <th className="r">Filled</th>
                <th className="r">Avg</th>
                <th className="r" title="Average fill vs mid when the order was sent, bps (+ = cost)">
                  Slip bp
                </th>
                <th className="r">Fee</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {mine(orders).map((o) => {
                const slip = orderSlippage(o);
                return (
                  <tr key={o.id} data-testid="blotter-order-row" data-status={o.status} title={o.reason}>
                    <td className="mono faint">{fmtTime(o.createdAt, false)}</td>
                    <td>
                      <span className="bl-sym-text">{o.symbol}</span> <span className={`bl-side ${o.side === 'Long' ? 'buy' : 'sell'}`}>{o.side === 'Long' ? 'BUY' : 'SELL'}</span>
                    </td>
                    <td>
                      <span className="bl-kind">{KIND[o.kind]}</span> <Flags o={o} />
                    </td>
                    <td className="r mono">
                      {fmtQty(o.filledQty)}/{fmtQty(o.qty)}
                    </td>
                    <td className="r mono">{o.avgPx != null ? fmtPrice(o.avgPx) : '—'}</td>
                    <td className={`r mono ${slip == null ? 'faint' : slip > 2 ? 'down' : slip < 0 ? 'up' : ''}`}>{fmtBp(slip)}</td>
                    <td className={`r mono ${o.fees < 0 ? 'up' : ''}`}>{o.fees ? fmtUsd(o.fees, 2) : '—'}</td>
                    <td>
                      <span className={`bl-status s-${o.status}`}>{statusLabel(o)}</span>
                      {o.reason && (o.status === 'rejected' || o.status === 'cancelled') && <span className="bl-reason">{o.reason}</span>}
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'fills' && (
          <table className="bl-table" data-testid="blotter-fills">
            <thead>
              <tr>
                <th>Time</th>
                <th>Symbol</th>
                <th className="r">Price</th>
                <th className="r">Qty</th>
                <th className="r">Notional</th>
                <th>Liq.</th>
                <th className="r">Fee</th>
              </tr>
            </thead>
            <tbody>
              {mine(fills).map((f) => (
                <tr key={f.id} data-testid="blotter-fill-row">
                  <td className="mono faint">{fmtTime(f.time)}</td>
                  <td>
                    <span className="bl-sym-text">{f.symbol}</span> <span className={`bl-side ${f.side === 'Long' ? 'buy' : 'sell'}`}>{f.side === 'Long' ? 'BUY' : 'SELL'}</span>
                  </td>
                  <td className="r mono">
                    {fmtPrice(f.price)}
                    {f.estimated && (
                      <span className="bl-est" title="Priced beyond the visible book (model estimate)">
                        ~
                      </span>
                    )}
                  </td>
                  <td className="r mono">{fmtQty(f.qty)}</td>
                  <td className="r mono">{fmtUsd(f.price * f.qty, 2)}</td>
                  <td>
                    <span className={`bl-liq ${f.liquidity}`} title={f.liquidity === 'maker' ? 'Added liquidity (resting order)' : 'Took liquidity'}>
                      {f.liquidity === 'maker' ? 'M' : 'T'}
                    </span>
                  </td>
                  <td className={`r mono ${f.fee < 0 ? 'up' : ''}`}>{fmtUsd(f.fee, 2)}</td>
                </tr>
              ))}
              {fills.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    No fills yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'tca' && (
          <div className="tca" data-testid="blotter-tca">
            <Stat label="Avg slippage vs arrival" value={q.avgSlippageBps == null ? '—' : `${fmtBp(q.avgSlippageBps)} bp`} tone={q.avgSlippageBps != null && q.avgSlippageBps > 2 ? 'down' : undefined} hint="Qty-weighted, fills vs the mid when each order was sent" />
            <Stat label="Implementation shortfall" value={fmtUsd(q.shortfall, 2)} tone={q.shortfall > 0 ? 'down' : 'up'} hint="Price slippage vs arrival + fees, in USDT" />
            <Stat label="Fees (net of rebates)" value={fmtUsd(q.fees, 2)} />
            <Stat label="Maker share" value={q.makerShare == null ? '—' : `${(q.makerShare * 100).toFixed(0)}%`} hint="Share of filled notional that added liquidity" />
            <Stat label="Fill rate" value={q.fillRate == null ? '—' : `${(q.fillRate * 100).toFixed(1)}%`} hint="Filled / requested, finished orders" />
            <Stat label="Orders · rejected" value={`${q.orders} · ${q.rejected}`} />
            <Stat label="Traded notional" value={fmtUsd(q.notional, 0)} />
            <div className="tca-stat tca-actions">
              <button className="btn sm ghost" onClick={() => useExecutionStore.getState().clearHistory()} disabled={!orders.length}>
                Clear history
              </button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: 'up' | 'down'; hint?: string }) {
  return (
    <div className="tca-stat" title={hint}>
      <span className="label">{label}</span>
      <span className={`num ${tone ?? ''}`}>{value}</span>
    </div>
  );
}
