import { useMemo } from 'react';
import { X } from 'lucide-react';
import { DenseTable, type Column, type SortState } from '@/components/ui/DenseTable/DenseTable';
import { Segmented } from '@/components/ui/Segmented';
import { usePositionStore, totalUnrealized } from '@/stores/usePositionStore';
import { useExecutionStore, isLive } from '@/stores/useExecutionStore';
import { useOtcStore } from '@/stores/useOtcStore';
import { cancelAlgo, cancelAllOrders, cancelBracketLeg, cancelStopOrder, cancelWorkingOrder, closePosition, flattenAll } from '@/stores/trading';
import { executionQuality, orderSlippage } from '@/lib/trading/quality';
import { pnlPct, progressOnRange } from '@/lib/trading/pnl';
import { fmtDuration, rMultiple } from '@/lib/trading/risk';
import { fmtPct, fmtPrice, fmtQty, fmtSigned, fmtTime, fmtUsd } from '@/lib/format';
import type { FillRecord as Fill, OrderRecord, OtcFill, Position } from '@/types';
import { useSetWindowSymbol, useWindowSettings } from '@/workspace/WindowContext';

type Tab = 'positions' | 'open' | 'orders' | 'fills' | 'otc' | 'tca';
type Settings = { tab: Tab; sorts: Partial<Record<Tab, SortState>>; widths: Partial<Record<Tab, Record<string, number>>> };

const KIND: Record<OrderRecord['kind'], string> = { market: 'MKT', limit: 'LMT', stop: 'STP', take_profit: 'TP', stop_loss: 'STOP', twap: 'TWAP', close: 'CLOSE' };
const STATUS: Record<OrderRecord['status'], string> = { new: 'Working', partially_filled: 'Partial', filled: 'Filled', cancelled: 'Cancelled', rejected: 'Rejected' };
const statusLabel = (o: OrderRecord) => (o.status === 'cancelled' && o.filledQty > 0 ? 'Part-filled · rest cancelled' : STATUS[o.status]);
const fmtBp = (v: number | null) => (v == null ? '—' : Math.abs(v) < 0.05 ? '0.0' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`);
const Side = ({ side }: { side: 'Long' | 'Short' }) => <span className={`bl-side ${side === 'Long' ? 'buy' : 'sell'}`}>{side === 'Long' ? 'BUY' : 'SELL'}</span>;

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
        <span key={x} className="bl-flag">
          {x}
        </span>
      ))}
    </span>
  );
}

/**
 * Blotter: one window, tabs for Positions, Open orders, Orders, Fills, OTC and execution quality.
 * Every table is the shared dense table (sortable, 24px rows). Positions keep the SL → TP bar,
 * Close and Flatten all; Open orders have Cancel and Cancel all.
 */
export function BlotterWindow() {
  const [settings, patch] = useWindowSettings<Settings>();
  const tab = settings.tab ?? 'positions';
  const positions = usePositionStore((s) => s.positions);
  const algos = usePositionStore((s) => s.algos);
  const orders = useExecutionStore((s) => s.orders);
  const fills = useExecutionStore((s) => s.fills);
  const otc = useOtcStore((s) => s.blotter);
  const live = useMemo(() => orders.filter(isLive), [orders]);
  const total = totalUnrealized(positions);
  const tableProps = (t: Tab) => ({
    sort: settings.sorts?.[t] ?? null,
    onSort: (s: SortState) => patch({ sorts: { ...settings.sorts, [t]: s } }),
    widths: settings.widths?.[t],
    onWidths: (w: Record<string, number>) => patch({ widths: { ...settings.widths, [t]: w } }),
  });
  return (
    <div className="blot" data-testid="blotter-window">
      <div className="blot-bar">
        <Segmented<Tab>
          value={tab}
          onChange={(t) => patch({ tab: t })}
          ariaLabel="Blotter view"
          options={[
            { value: 'positions', label: `Positions${positions.length ? ` ${positions.length}` : ''}` },
            { value: 'open', label: `Open orders${live.length ? ` ${live.length}` : ''}` },
            { value: 'orders', label: 'Orders' },
            { value: 'fills', label: 'Fills' },
            { value: 'otc', label: 'OTC' },
            { value: 'tca', label: 'Quality' },
          ]}
        />
        <span className="spacer" />
        {tab === 'positions' && positions.length > 0 && (
          <>
            <span className={`num ${total >= 0 ? 'up' : 'down'}`} data-testid="positions-total">
              {fmtSigned(total)} USDT
            </span>
            <button className="btn sm danger" onClick={() => void flattenAll()} data-testid="flatten-all">
              Flatten all
            </button>
          </>
        )}
        {tab === 'open' && (
          <button className="btn sm ghost" onClick={() => cancelAllOrders()} disabled={!live.some((o) => o.source !== 'bracket')} title="Cancel every working limit and stop order (bracket exits stay)" data-testid="cancel-all">
            Cancel all
          </button>
        )}
        {tab === 'tca' && (
          <button className="btn sm ghost" onClick={() => useExecutionStore.getState().clearHistory()} disabled={!orders.length}>
            Clear history
          </button>
        )}
      </div>
      <div className="blot-body">
        {tab === 'positions' && (
          <>
            {algos.length > 0 && <Algos />}
            <PositionsTable positions={positions} {...tableProps('positions')} />
          </>
        )}
        {tab === 'open' && <OpenOrdersTable orders={live} {...tableProps('open')} />}
        {tab === 'orders' && <OrdersTable orders={orders} {...tableProps('orders')} />}
        {tab === 'fills' && <FillsTable fills={fills} {...tableProps('fills')} />}
        {tab === 'otc' && <OtcTable fills={otc} {...tableProps('otc')} />}
        {tab === 'tca' && <Quality orders={orders} fills={fills} />}
      </div>
    </div>
  );
}

type TP = { sort: SortState; onSort: (s: SortState) => void; widths?: Record<string, number>; onWidths: (w: Record<string, number>) => void };

function PositionsTable({ positions, ...tp }: { positions: Position[] } & TP) {
  const closing = usePositionStore((s) => s.closing);
  const setSymbol = useSetWindowSymbol();
  const cols: Column<Position>[] = [
    { id: 'symbol', label: 'Symbol', width: 74, sort: (p) => p.symbol, render: (p) => <button className="bl-sym" onClick={() => setSymbol(p.symbol)} title="Show in linked windows">{p.symbol}</button> },
    { id: 'side', label: 'Side', width: 56, sort: (p) => p.side, render: (p) => <span className={`badge ${p.side === 'Long' ? 'long' : 'short'}`}>{p.side}</span> },
    { id: 'size', label: 'Size', num: true, width: 80, sort: (p) => p.size, render: (p) => fmtQty(p.size) },
    { id: 'entry', label: 'Entry', num: true, width: 90, sort: (p) => p.entry, render: (p) => fmtPrice(p.entry) },
    { id: 'mark', label: 'Mark', num: true, width: 90, sort: (p) => p.current, flash: (p) => p.current, render: (p) => fmtPrice(p.current) },
    { id: 'pnl', label: 'P/L', num: true, width: 84, sort: (p) => p.pnl, render: (p) => <span className={p.pnl >= 0 ? 'up' : 'down'} data-testid="position-pnl">{fmtSigned(p.pnl)}</span> },
    { id: 'pct', label: 'P/L %', num: true, width: 64, sort: (p) => pnlPct(p.side, p.entry, p.current), render: (p) => { const v = pnlPct(p.side, p.entry, p.current); return <span className={v >= 0 ? 'up' : 'down'}>{fmtPct(v)}</span>; } },
    { id: 'r', label: 'R', num: true, width: 56, sort: (p) => rMultiple(p.side, p.entry, p.sl, p.current) ?? 0, title: 'P/L in multiples of initial risk (entry → stop)', render: (p) => { const r = rMultiple(p.side, p.entry, p.sl, p.current); return r == null ? '—' : <span className={r >= 0 ? 'up' : 'down'} data-testid="position-r">{r >= 0 ? '+' : ''}{r.toFixed(2)}R</span>; } },
    { id: 'range', label: 'SL → TP', width: 170, render: (p) => <RangeBar p={p} /> },
    { id: 'age', label: 'Time', num: true, width: 64, sort: (p) => -p.openedAt, render: (p) => fmtDuration(Date.now() - p.openedAt) },
    {
      id: 'close',
      label: '',
      width: 64,
      align: 'right',
      render: (p) => (
        <button className="btn xs" onClick={() => closePosition(p.id)} disabled={!!closing[p.id]} data-testid="close-position">
          <X size={11} /> Close
        </button>
      ),
    },
  ];
  return (
    <DenseTable
      columns={cols}
      rows={positions}
      rowKey={(p) => p.id}
      rowClass={(p) => (closing[p.id] ? 'closing' : '')}
      rowProps={() => ({ 'data-testid': 'position-row' })}
      empty="No open positions. Place an order from the ticket, the book, or the command line."
      testId="positions"
      {...tp}
    />
  );
}

/** SL on the left, TP on the right, entry tick, and where the mark sits between them. */
function RangeBar({ p }: { p: Position }) {
  const pos = progressOnRange(p.side, p.sl, p.entry, p.tp, p.current);
  return (
    <span className="bl-range" title={`SL ${fmtPrice(p.sl)} · entry ${fmtPrice(p.entry)} · TP ${fmtPrice(p.tp)}`}>
      <span className="num down">{fmtPrice(p.sl)}</span>
      <span className="pos-bar" aria-hidden>
        <span className="pos-bar-loss" />
        <span className="pos-bar-profit" />
        <span className="pos-bar-entry" />
        <span className="pos-bar-marker" style={{ left: `${pos * 100}%` }} />
      </span>
      <span className="num up">{fmtPrice(p.tp)}</span>
      {p.tpHit && <span className="badge long">TP</span>}
      {p.slHit && <span className="badge short">SL</span>}
    </span>
  );
}

function Algos() {
  const algos = usePositionStore((s) => s.algos);
  return (
    <div className="bl-algos">
      {algos.map((a) => (
        <div key={a.id} className={`pos-working algo ${a.status}`} data-testid="algo-row">
          <span className="badge accent">{a.kind}</span>
          <span className="mono" style={{ fontWeight: 600 }}>{a.symbol}</span>
          <span className={`badge ${a.side === 'Long' ? 'long' : 'short'}`}>{a.side}</span>
          <span className="num">
            {fmtQty(a.filledSize)}/{fmtQty(a.totalSize)}
          </span>
          <span className="algo-bar">
            <span style={{ width: `${(a.slicesDone / a.slices) * 100}%` }} />
          </span>
          <span className="num faint">
            {a.slicesDone}/{a.slices}
          </span>
          <span className="label">AVG</span>
          <span className="num">{a.avgPx ? fmtPrice(a.avgPx) : '—'}</span>
          <span className="spacer" />
          {a.status === 'running' ? (
            <button className="btn xs danger" onClick={() => cancelAlgo(a.id)}>
              Cancel
            </button>
          ) : (
            <span className="label">{a.status}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function OpenOrdersTable({ orders, ...tp }: { orders: OrderRecord[] } & TP) {
  const working = usePositionStore((s) => s.workingOrders);
  const positions = usePositionStore((s) => s.positions);
  const posSize = (id?: string) => positions.find((p) => p.id === id)?.size;
  const cancel = (o: OrderRecord) => (o.source === 'bracket' ? cancelBracketLeg(o.id) : o.kind === 'stop' ? cancelStopOrder(o.id) : working.some((w) => w.id === o.id) ? cancelWorkingOrder(o.id) : null);
  const cols: Column<OrderRecord>[] = [
    { id: 'time', label: 'Time', num: true, width: 64, sort: (o) => o.createdAt, render: (o) => <span className="faint">{fmtTime(o.createdAt, false)}</span> },
    { id: 'symbol', label: 'Symbol', width: 96, sort: (o) => o.symbol, render: (o) => <><b className="mono">{o.symbol}</b> <Side side={o.side} /></> },
    { id: 'type', label: 'Type', width: 110, sort: (o) => o.kind, render: (o) => <><span className="bl-kind">{KIND[o.kind]}</span> <Flags o={o} /></> },
    { id: 'qty', label: 'Qty', num: true, width: 90, sort: (o) => o.qty, render: (o) => `${o.filledQty > 0 && o.source !== 'bracket' ? `${fmtQty(o.filledQty)}/` : ''}${fmtQty(o.source === 'bracket' ? posSize(o.positionId) ?? o.qty : o.qty)}` },
    { id: 'price', label: 'Price', num: true, width: 90, sort: (o) => o.limitPrice ?? o.triggerPrice ?? 0, render: (o) => fmtPrice(o.limitPrice ?? o.triggerPrice ?? 0) },
    { id: 'status', label: 'Status', width: 80, render: (o) => <span className={`bl-status s-${o.status}`}>{o.source === 'bracket' ? (o.kind === 'stop_loss' ? 'Armed' : 'Working') : statusLabel(o)}</span> },
    {
      id: 'cancel',
      label: '',
      width: 40,
      align: 'right',
      render: (o) => (
        <button className="btn xs ghost icon" aria-label={`Cancel ${KIND[o.kind]} ${o.symbol}`} onClick={() => cancel(o)} data-testid="blotter-cancel">
          <X size={11} />
        </button>
      ),
    },
  ];
  return <DenseTable columns={cols} rows={orders} rowKey={(o) => o.id} rowProps={() => ({ 'data-testid': 'blotter-open-row' })} empty="No open orders. Resting limits, stops and bracket exits show here." testId="blotter-open" {...tp} />;
}

function OrdersTable({ orders, ...tp }: { orders: OrderRecord[] } & TP) {
  const cols: Column<OrderRecord>[] = [
    { id: 'time', label: 'Time', num: true, width: 64, sort: (o) => o.createdAt, render: (o) => <span className="faint">{fmtTime(o.createdAt, false)}</span> },
    { id: 'symbol', label: 'Symbol', width: 96, sort: (o) => o.symbol, render: (o) => <><b className="mono">{o.symbol}</b> <Side side={o.side} /></> },
    { id: 'type', label: 'Type', width: 110, sort: (o) => o.kind, render: (o) => <><span className="bl-kind">{KIND[o.kind]}</span> <Flags o={o} /></> },
    { id: 'filled', label: 'Filled', num: true, width: 110, sort: (o) => o.filledQty, render: (o) => `${fmtQty(o.filledQty)}/${fmtQty(o.qty)}` },
    { id: 'avg', label: 'Avg', num: true, width: 90, sort: (o) => o.avgPx ?? 0, render: (o) => (o.avgPx != null ? fmtPrice(o.avgPx) : '—') },
    { id: 'slip', label: 'Slip bp', num: true, width: 66, sort: (o) => orderSlippage(o) ?? 0, title: 'Average fill vs mid when the order was sent, bps (+ = cost)', render: (o) => { const s = orderSlippage(o); return <span className={s == null ? 'faint' : s > 2 ? 'down' : s < 0 ? 'up' : ''}>{fmtBp(s)}</span>; } },
    { id: 'fee', label: 'Fee', num: true, width: 66, sort: (o) => o.fees, render: (o) => <span className={o.fees < 0 ? 'up' : ''}>{o.fees ? fmtUsd(o.fees, 2) : '—'}</span> },
    { id: 'status', label: 'Status', width: 150, sort: (o) => o.status, render: (o) => <><span className={`bl-status s-${o.status}`}>{statusLabel(o)}</span>{o.reason && (o.status === 'rejected' || o.status === 'cancelled') && <span className="bl-reason">{o.reason}</span>}</> },
  ];
  return <DenseTable columns={cols} rows={orders} rowKey={(o) => o.id} rowProps={(o) => ({ 'data-testid': 'blotter-order-row', 'data-status': o.status, title: o.reason })} empty="No orders yet." testId="blotter-orders" {...tp} />;
}

function FillsTable({ fills, ...tp }: { fills: Fill[] } & TP) {
  const cols: Column<Fill>[] = [
    { id: 'time', label: 'Time', num: true, width: 72, sort: (f) => f.time, render: (f) => <span className="faint">{fmtTime(f.time)}</span> },
    { id: 'symbol', label: 'Symbol', width: 96, sort: (f) => f.symbol, render: (f) => <><b className="mono">{f.symbol}</b> <Side side={f.side} /></> },
    { id: 'price', label: 'Price', num: true, width: 96, sort: (f) => f.price, render: (f) => <>{fmtPrice(f.price)}{f.estimated && <span className="bl-est" title="Priced beyond the visible book (model estimate)">~</span>}</> },
    { id: 'qty', label: 'Qty', num: true, width: 84, sort: (f) => f.qty, render: (f) => fmtQty(f.qty) },
    { id: 'notional', label: 'Notional', num: true, width: 96, sort: (f) => f.price * f.qty, render: (f) => fmtUsd(f.price * f.qty, 2) },
    { id: 'liq', label: 'Liq.', width: 44, align: 'center', sort: (f) => f.liquidity, render: (f) => <span className={`bl-liq ${f.liquidity}`} title={f.liquidity === 'maker' ? 'Added liquidity (resting order)' : 'Took liquidity'}>{f.liquidity === 'maker' ? 'M' : 'T'}</span> },
    { id: 'fee', label: 'Fee', num: true, width: 66, sort: (f) => f.fee, render: (f) => <span className={f.fee < 0 ? 'up' : ''}>{fmtUsd(f.fee, 2)}</span> },
  ];
  return <DenseTable columns={cols} rows={fills} rowKey={(f) => f.id} rowProps={() => ({ 'data-testid': 'blotter-fill-row' })} empty="No fills yet." testId="blotter-fills" {...tp} />;
}

function OtcTable({ fills, ...tp }: { fills: OtcFill[] } & TP) {
  const cols: Column<OtcFill>[] = [
    { id: 'time', label: 'Time', num: true, width: 72, sort: (f) => f.executedAt, render: (f) => <span className="faint">{fmtTime(f.executedAt)}</span> },
    { id: 'symbol', label: 'Asset', width: 64, sort: (f) => f.symbol, render: (f) => <b className="mono">{f.symbol}</b> },
    { id: 'side', label: 'Side', width: 52, sort: (f) => f.side, render: (f) => <span className={`badge ${f.side === 'buy' ? 'long' : 'short'}`}>{f.side === 'buy' ? 'Buy' : 'Sell'}</span> },
    { id: 'amount', label: 'Amount', num: true, width: 86, sort: (f) => f.amount, render: (f) => fmtQty(f.amount) },
    { id: 'price', label: 'Price', num: true, width: 96, sort: (f) => f.price, render: (f) => fmtPrice(f.price) },
    { id: 'total', label: 'Total (USDT)', num: true, width: 110, sort: (f) => f.total, render: (f) => fmtUsd(f.total) },
    { id: 'desk', label: 'Desk', width: 120, sort: (f) => f.desk, render: (f) => <span className="dim">{f.desk}</span> },
  ];
  return <DenseTable columns={cols} rows={fills} rowKey={(f) => f.id} rowProps={() => ({ 'data-testid': 'blotter-row' })} empty="Accepted OTC quotes land here." testId="otc-blotter" {...tp} />;
}

function Quality({ orders, fills }: { orders: OrderRecord[]; fills: Fill[] }) {
  const q = executionQuality(orders, fills);
  const stat = (label: string, value: string, tone?: 'up' | 'down', hint?: string) => (
    <div className="tca-stat" title={hint}>
      <span className="label">{label}</span>
      <span className={`num ${tone ?? ''}`}>{value}</span>
    </div>
  );
  return (
    <div className="tca" data-testid="blotter-tca">
      {stat('Avg slippage vs arrival', q.avgSlippageBps == null ? '—' : `${fmtBp(q.avgSlippageBps)} bp`, q.avgSlippageBps != null && q.avgSlippageBps > 2 ? 'down' : undefined, 'Qty-weighted, fills vs the mid when each order was sent')}
      {stat('Implementation shortfall', fmtUsd(q.shortfall, 2), q.shortfall > 0 ? 'down' : 'up', 'Price slippage vs arrival + fees, in USDT')}
      {stat('Fees (net of rebates)', fmtUsd(q.fees, 2))}
      {stat('Maker share', q.makerShare == null ? '—' : `${(q.makerShare * 100).toFixed(0)}%`, undefined, 'Share of filled notional that added liquidity')}
      {stat('Fill rate', q.fillRate == null ? '—' : `${(q.fillRate * 100).toFixed(1)}%`, undefined, 'Filled / requested, finished orders')}
      {stat('Orders · rejected', `${q.orders} · ${q.rejected}`)}
      {stat('Traded notional', fmtUsd(q.notional, 0))}
    </div>
  );
}
