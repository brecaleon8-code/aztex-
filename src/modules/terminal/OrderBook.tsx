import { useMemo } from 'react';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { useMarketStore } from '@/stores/useMarketStore';
import { useOrderStore } from '@/stores/useOrderStore';
import { imbalance } from '@/lib/mock/orderbook';
import { fmtPct, fmtPrice, fmtQty, priceDecimals } from '@/lib/format';
import type { OrderBookLevel } from '@/types';
import { useTickFlash } from '@/app/useTickFlash';

const LEVELS = 10;

/** DOM-style depth ladder. Clicking a price sets it as the ticket's limit price (Limit mode). */
export function OrderBook({ drag }: { drag?: PanelDragProps }) {
  const book = useMarketStore((s) => s.book);
  const version = useMarketStore((s) => s.bookVersion);
  const symbol = useMarketStore((s) => s.selected);
  const last = useMarketStore((s) => s.assets[s.selected].price);
  const limitPrice = useOrderStore((s) => s.limitPrice);
  const orderType = useOrderStore((s) => s.orderType);
  const limitFromBook = useOrderStore((s) => s.limitFromBook);

  const view = useMemo(() => {
    if (!book) return null;
    const asks = book.asks.slice(0, LEVELS);
    const bids = book.bids.slice(0, LEVELS);
    const maxCum = Math.max(asks.at(-1)?.cumulative ?? 0, bids.at(-1)?.cumulative ?? 0) || 1;
    const spread = (asks[0]?.price ?? 0) - (bids[0]?.price ?? 0);
    const mid = ((asks[0]?.price ?? 0) + (bids[0]?.price ?? 0)) / 2;
    return { asks, bids, maxCum, spread, spreadPct: mid ? (spread / mid) * 100 : 0, imb: imbalance(book) };
  }, [book]);

  const dec = priceDecimals(last);
  const flash = useTickFlash(last);
  const row = (l: OrderBookLevel, side: 'bid' | 'ask', i: number) => (
    <button
      key={`${side}-${i}`}
      className={`ob-row ${side} ${orderType === 'limit' && limitPrice != null && Math.abs(limitPrice - l.price) < 1e-9 ? 'chosen' : ''}`}
      onClick={() => limitFromBook(l.price)}
      title="Set as limit price"
      data-testid={`ob-${side}-${i}`}
    >
      <span className="ob-depth" style={{ width: `${(l.cumulative / (view?.maxCum ?? 1)) * 100}%` }} />
      <span className="ob-price num" key={version}>{fmtPrice(l.price, dec)}</span>
      <span className="ob-size num">{fmtQty(l.size)}</span>
      <span className="ob-cum num faint">{fmtQty(l.cumulative)}</span>
    </button>
  );

  return (
    <Panel title="Order book" sub={`${symbol}/USDT`} drag={drag} flush testId="orderbook">
      <div className="ob no-select">
        <div className="ob-head label">
          <span>Price</span>
          <span>Size</span>
          <span>Total</span>
        </div>
        {!view ? (
          <div className="empty">Loading book…</div>
        ) : (
          <>
            <div className="ob-side asks">{[...view.asks].reverse().map((l, i) => row(l, 'ask', view.asks.length - 1 - i))}</div>
            <div className="ob-divider">
              <span className={`num ob-last ${flash.cls}`} key={flash.key}>
                {fmtPrice(last, dec)}
              </span>
              <span className="spacer" />
              <span className="label">Spread</span>
              <span className="num">{fmtPrice(view.spread, dec)}</span>
              <span className="num faint">{fmtPct(view.spreadPct, 3, false)}</span>
            </div>
            <div className="ob-side bids">{view.bids.map((l, i) => row(l, 'bid', i))}</div>
            <div className="ob-foot">
              <span className="label">IMB</span>
              <div className="imb-bar">
                <span className="imb-bid" style={{ width: `${((view.imb + 1) / 2) * 100}%` }} />
              </div>
              <span className={`num ${view.imb >= 0 ? 'up' : 'down'}`}>{fmtPct(view.imb * 100, 1)}</span>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
