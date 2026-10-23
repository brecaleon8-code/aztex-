import { Plus, X } from 'lucide-react';
import { useWalletStore } from '@/stores/useWalletStore';
import { usePositionStore, committedNotional, totalUnrealized } from '@/stores/usePositionStore';
import { useHoldingsValue } from '@/stores/useHoldingsValue';
import { useFeeStore } from '@/stores/useFeeStore';
import { useExecutionStore, isLive } from '@/stores/useExecutionStore';
import { cancelStopOrder, cancelWorkingOrder, flattenAll } from '@/stores/trading';
import { FEE_TIERS } from '@/lib/account/fees';
import { fmtPrice, fmtQty, fmtSigned, fmtTime, fmtUsd } from '@/lib/format';
import { useMobileStore } from '../useMobileStore';
import { MHeader } from '../MobileApp';

/**
 * Trade (MT5): the account line-up — balance, equity, used and free — then open positions with
 * live P/L (tap for details / close / modify) and pending orders (tap × to cancel).
 */
export function TradeScreen() {
  const balance = useWalletStore((s) => s.balance);
  const positions = usePositionStore((s) => s.positions);
  const working = usePositionStore((s) => s.workingOrders);
  const stops = usePositionStore((s) => s.stopOrders);
  const realized = usePositionStore((s) => s.realized);
  const legs = useExecutionStore((s) => s.orders).filter((o) => o.source === 'bracket' && isLive(o)).length;
  const holdings = useHoldingsValue();
  const tier = useFeeStore((s) => s.tier);
  const upnl = totalUnrealized(positions);
  const used = committedNotional(positions);
  const equity = balance + used + upnl + holdings;
  const open = useMobileStore((s) => s.open);

  return (
    <div className="m-page">
      <MHeader
        title="Trade"
        sub={`${FEE_TIERS[tier].label} account · USDT`}
        left={
          positions.length > 0 ? (
            <button className="m-text-btn danger" onClick={() => void flattenAll()} data-testid="m-close-all">
              Close all
            </button>
          ) : undefined
        }
        right={
          <button className="m-icon-btn" onClick={() => open({ kind: 'order' })} aria-label="New order" data-testid="m-new-order">
            <Plus size={21} />
          </button>
        }
      />
      <div className="m-scroll">
        <section className="m-acct" data-testid="m-account">
          <div className="m-acct-main">
            <span className="m-label">Equity</span>
            <b className="mono">{fmtUsd(equity)}</b>
            <span className={`mono ${upnl >= 0 ? 'up' : 'down'}`}>{fmtSigned(upnl)} unrealized</span>
          </div>
          <dl className="m-acct-grid">
            <div>
              <dt>Balance</dt>
              <dd className="mono">{fmtUsd(balance)}</dd>
            </div>
            <div>
              <dt>In positions</dt>
              <dd className="mono">{fmtUsd(used)}</dd>
            </div>
            <div>
              <dt>Holdings</dt>
              <dd className="mono">{fmtUsd(holdings)}</dd>
            </div>
            <div>
              <dt>Realized</dt>
              <dd className={`mono ${realized >= 0 ? 'up' : 'down'}`}>{fmtSigned(realized)}</dd>
            </div>
          </dl>
        </section>

        <div className="m-section-head">
          Positions <span className="mono">{positions.length}</span>
        </div>
        <ul className="m-list" data-testid="m-positions">
          {positions.map((p) => (
            <li key={p.id}>
              <button className="m-row" onClick={() => open({ kind: 'position', id: p.id })} data-testid="m-position">
                <span className="m-row-main">
                  <span>
                    <b>{p.symbol}</b>, <span className={p.side === 'Long' ? 'up' : 'down'}>{p.side === 'Long' ? 'buy' : 'sell'}</span> <span className="mono">{fmtQty(p.size)}</span>
                  </span>
                  <span className="m-row-sub mono">
                    {fmtPrice(p.entry)} → {fmtPrice(p.current)}
                  </span>
                </span>
                <span className={`m-row-pnl mono ${p.pnl >= 0 ? 'up' : 'down'}`}>{fmtSigned(p.pnl)}</span>
              </button>
            </li>
          ))}
          {positions.length === 0 && <li className="m-empty">No open positions. Use Buy / Sell on the chart or + above.</li>}
        </ul>

        <div className="m-section-head">
          Orders <span className="mono">{working.length + stops.length}</span>
          {legs > 0 && <span className="faint"> · {legs} bracket legs on positions</span>}
        </div>
        <ul className="m-list" data-testid="m-orders">
          {working.map((o) => (
            <li key={o.id} className="m-row" data-testid="m-order">
              <span className="m-row-main">
                <span>
                  <b>{o.symbol}</b>, <span className={o.side === 'Long' ? 'up' : 'down'}>{o.side === 'Long' ? 'buy' : 'sell'} limit</span> <span className="mono">{fmtQty(o.size)}</span>
                </span>
                <span className="m-row-sub mono">
                  at {fmtPrice(o.limitPrice)} · {fmtTime(o.createdAt, false)}
                </span>
              </span>
              <button className="m-icon-btn" onClick={() => cancelWorkingOrder(o.id)} aria-label={`Cancel ${o.symbol} limit`}>
                <X size={17} />
              </button>
            </li>
          ))}
          {stops.map((o) => (
            <li key={o.id} className="m-row" data-testid="m-order">
              <span className="m-row-main">
                <span>
                  <b>{o.symbol}</b>, <span className={o.side === 'Long' ? 'up' : 'down'}>{o.side === 'Long' ? 'buy' : 'sell'} stop</span> <span className="mono">{fmtQty(o.size)}</span>
                </span>
                <span className="m-row-sub mono">
                  at {fmtPrice(o.triggerPrice)} · {fmtTime(o.createdAt, false)}
                </span>
              </span>
              <button className="m-icon-btn" onClick={() => cancelStopOrder(o.id)} aria-label={`Cancel ${o.symbol} stop`}>
                <X size={17} />
              </button>
            </li>
          ))}
          {working.length + stops.length === 0 && <li className="m-empty">No pending orders.</li>}
        </ul>
      </div>
    </div>
  );
}
