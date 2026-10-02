import { useEffect, useMemo, useState } from 'react';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { useMarketStore } from '@/stores/useMarketStore';
import { imbalance } from '@/lib/mock/orderbook';
import { flowStats } from '@/lib/orderflow/orderflow';
import { fmtCompact, fmtPct, fmtPrice, fmtQty } from '@/lib/format';

type Win = '30s' | '1m' | '5m';
const WIN_MS: Record<Win, number> = { '30s': 30_000, '1m': 60_000, '5m': 300_000 };

/** Aggressor flow + microstructure readouts over a trailing window, with a session delta trace. */
export function OrderFlow({ drag }: { drag?: PanelDragProps }) {
  const trades = useMarketStore((s) => s.trades);
  const book = useMarketStore((s) => s.book);
  const symbol = useMarketStore((s) => s.selected);
  const [win, setWin] = useState<Win>('1m');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const st = useMemo(() => flowStats(trades, now, WIN_MS[win]), [trades, now, win]);
  const imb = book ? imbalance(book) : 0;
  const bestBid = book?.bids[0]?.price ?? 0;
  const bestAsk = book?.asks[0]?.price ?? 0;
  const spreadBps = bestBid && bestAsk ? ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 10_000 : 0;

  // Session cumulative delta from the tape (oldest → newest).
  const trace = useMemo(() => {
    let acc = 0;
    return [...trades].reverse().map((t) => (acc += t.side === 'buy' ? t.size : -t.size));
  }, [trades]);

  const cells: [string, React.ReactNode][] = [
    ['BUY VOL', <span className="num up">{fmtQty(st.buyVol)}</span>],
    ['SELL VOL', <span className="num down">{fmtQty(st.sellVol)}</span>],
    ['DELTA', <span className={`num ${st.delta >= 0 ? 'up' : 'down'}`}>{st.delta >= 0 ? '+' : ''}{fmtQty(st.delta)}</span>],
    ['TRADES/S', <span className="num">{st.tradesPerSec.toFixed(2)}</span>],
    ['TAPE VWAP', <span className="num">{st.vwap ? fmtPrice(st.vwap) : '—'}</span>],
    ['LARGEST', <span className={`num ${st.largest?.side === 'buy' ? 'up' : st.largest ? 'down' : ''}`}>{st.largest ? `$${fmtCompact(st.largest.price * st.largest.size)}` : '—'}</span>],
    ['BOOK IMB', <span className={`num ${imb >= 0 ? 'up' : 'down'}`}>{fmtPct(imb * 100, 1)}</span>],
    ['SPREAD', <span className="num">{spreadBps.toFixed(2)} bp</span>],
  ];

  return (
    <Panel
      code="FLOW"
      title="Order Flow"
      sub={symbol}
      drag={drag}
      testId="order-flow"
      actions={<Segmented<Win> value={win} onChange={setWin} ariaLabel="Flow window" options={[{ value: '30s', label: '30S' }, { value: '1m', label: '1M' }, { value: '5m', label: '5M' }]} />}
    >
      <div className="flow">
        <div className="flow-pressure" aria-label={`Buy ${st.buyPct.toFixed(0)} percent`}>
          <span className="flow-buy" style={{ width: `${st.buyPct}%` }}>
            <span className="mono">B {st.buyPct.toFixed(0)}%</span>
          </span>
          <span className="flow-sell">
            <span className="mono">S {(100 - st.buyPct).toFixed(0)}%</span>
          </span>
        </div>
        <div className="flow-grid">
          {cells.map(([k, v]) => (
            <div key={k} className="flow-cell">
              <span className="label">{k}</span>
              {v}
            </div>
          ))}
        </div>
        <div className="flow-trace">
          <span className="label">SESSION Δ (TAPE)</span>
          <DeltaTrace values={trace} />
        </div>
      </div>
    </Panel>
  );
}

function DeltaTrace({ values }: { values: number[] }) {
  const w = 300;
  const h = 54;
  if (values.length < 2) return <div className="empty" style={{ padding: 8 }}>—</div>;
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const y = (v: number) => h - 2 - ((v - lo) / span) * (h - 4);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const last = values[values.length - 1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="delta-trace">
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={last >= 0 ? 'var(--profit)' : 'var(--loss)'} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
