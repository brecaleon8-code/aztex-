import { useMemo } from 'react';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { useMarketStore } from '@/stores/useMarketStore';
import { largePrintThreshold } from '@/lib/orderflow/orderflow';
import { fmtCompact, fmtPrice, fmtQty, fmtTime, priceDecimals } from '@/lib/format';

const ROWS = 60;

/** Time & Sales: every print with aggressor side; prints above the 95th-pct notional are flagged. */
export function TimeSales({ drag }: { drag?: PanelDragProps }) {
  const trades = useMarketStore((s) => s.trades);
  const symbol = useMarketStore((s) => s.selected);
  const threshold = useMemo(() => largePrintThreshold(trades.slice(0, 300)), [trades]);
  const dec = priceDecimals(trades[0]?.price ?? 1);
  return (
    <Panel code="T&S" title="Time & Sales" sub={symbol} drag={drag} flush testId="tape">
      <div className="tape">
        <table className="table tape-table">
          <thead>
            <tr>
              <th>Time</th>
              <th className="r">Price</th>
              <th className="r">Size</th>
              <th className="r">Notional</th>
            </tr>
          </thead>
          <tbody>
            {trades.slice(0, ROWS).map((t) => {
              const big = t.price * t.size >= threshold;
              return (
                <tr key={t.id} className={`tape-row ${t.side} ${big ? 'big' : ''}`} data-testid="tape-row">
                  <td className="num faint">{fmtTime(t.time)}</td>
                  <td className={`r num ${t.side === 'buy' ? 'up' : 'down'}`}>{fmtPrice(t.price, dec)}</td>
                  <td className="r num">{fmtQty(t.size)}</td>
                  <td className="r num">{big ? '◆ ' : ''}{fmtCompact(t.price * t.size)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {trades.length === 0 && <div className="empty">AWAITING PRINTS…</div>}
      </div>
    </Panel>
  );
}
