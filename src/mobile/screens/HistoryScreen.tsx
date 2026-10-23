import { useMemo, useState } from 'react';
import { useExecutionStore } from '@/stores/useExecutionStore';
import { Segmented } from '@/components/ui/Segmented';
import { fmtDate, fmtPrice, fmtQty, fmtSigned, fmtTime, fmtUsd } from '@/lib/format';
import type { OrderRecord } from '@/types';
import { MHeader } from '../MobileApp';

type Period = 'day' | 'week' | 'month' | 'all';
type View = 'deals' | 'orders';
const SPAN: Record<Period, number> = { day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000, all: Infinity };
const KIND: Record<OrderRecord['kind'], string> = { market: 'market', limit: 'limit', stop: 'stop', take_profit: 'take profit', stop_loss: 'stop loss', twap: 'TWAP', close: 'close' };

/**
 * History (MT5): realized profit, fees and deal count for the period, then every executed deal —
 * or every order with its final status.
 */
export function HistoryScreen() {
  const orders = useExecutionStore((s) => s.orders);
  const [period, setPeriod] = useState<Period>('week');
  const [view, setView] = useState<View>('deals');
  const since = Date.now() - SPAN[period];
  const inPeriod = useMemo(() => orders.filter((o) => o.updatedAt >= since).sort((a, b) => b.updatedAt - a.updatedAt), [orders, since]);
  const deals = inPeriod.filter((o) => o.filledQty > 0);
  const shown = view === 'deals' ? deals : inPeriod;
  const profit = deals.reduce((s, o) => s + (o.pnl ?? 0), 0);
  const fees = deals.reduce((s, o) => s + o.fees, 0);
  const closes = deals.filter((o) => o.pnl != null);
  const wins = closes.filter((o) => (o.pnl ?? 0) > 0).length;

  let lastDay = '';
  return (
    <div className="m-page">
      <MHeader title="History" sub={view === 'deals' ? `${deals.length} deals` : `${inPeriod.length} orders`} />
      <div className="m-scroll">
        <div className="m-filters">
          <Segmented<Period>
            full
            value={period}
            onChange={setPeriod}
            ariaLabel="Period"
            options={[
              { value: 'day', label: 'Today' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        <section className="m-hist-sum" data-testid="m-history-summary">
          <div>
            <span className="m-label">Profit</span>
            <b className={`mono ${profit >= 0 ? 'up' : 'down'}`}>{fmtSigned(profit)}</b>
          </div>
          <div>
            <span className="m-label">Fees</span>
            <b className="mono">{fmtUsd(fees)}</b>
          </div>
          <div>
            <span className="m-label">Win rate</span>
            <b className="mono">{closes.length ? `${Math.round((wins / closes.length) * 100)}%` : '—'}</b>
          </div>
        </section>
        <div className="m-filters">
          <Segmented<View>
            full
            value={view}
            onChange={setView}
            ariaLabel="History view"
            options={[
              { value: 'deals', label: 'Deals' },
              { value: 'orders', label: 'Orders' },
            ]}
          />
        </div>
        <ul className="m-list" data-testid="m-history">
          {shown.map((o) => {
            const day = fmtDate(o.updatedAt);
            const header = day !== lastDay ? (lastDay = day) : null;
            return (
              <li key={o.id} className="m-hist-item">
                {header && <div className="m-day">{header}</div>}
                <div className="m-row" data-testid="m-deal">
                  <span className="m-row-main">
                    <span>
                      <b>{o.symbol}</b>, <span className={o.side === 'Long' ? 'up' : 'down'}>{o.side === 'Long' ? 'buy' : 'sell'}</span> <span className="faint">{KIND[o.kind]}</span>
                    </span>
                    <span className="m-row-sub mono">
                      {fmtQty(o.filledQty || o.qty)} @ {o.avgPx != null ? fmtPrice(o.avgPx) : fmtPrice(o.limitPrice ?? o.triggerPrice ?? 0)} · {fmtTime(o.updatedAt, false)}
                    </span>
                  </span>
                  {o.pnl != null ? (
                    <span className={`m-row-pnl mono ${o.pnl >= 0 ? 'up' : 'down'}`}>{fmtSigned(o.pnl)}</span>
                  ) : (
                    <span className={`m-status s-${o.status}`}>{o.status === 'filled' ? 'filled' : o.status.replace('_', ' ')}</span>
                  )}
                </div>
              </li>
            );
          })}
          {shown.length === 0 && <li className="m-empty">Nothing in this period yet.</li>}
        </ul>
      </div>
    </div>
  );
}
