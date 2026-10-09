import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { DepthChart, LiquidityHeatmap } from './DepthViews';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { useMarketStore } from '@/stores/useMarketStore';
import { useOrderStore } from '@/stores/useOrderStore';
import { imbalance, tickSize } from '@/lib/mock/orderbook';
import { usePositionStore } from '@/stores/usePositionStore';
import { fmtPct, fmtPrice, fmtQty, priceDecimals, splitPrice } from '@/lib/format';
import type { OrderBookLevel } from '@/types';
import { useTickFlash } from '@/app/useTickFlash';
import { useTicketPreview } from './useTicket';
import { useTerminalFit } from './fitContext';

const LEVELS = 10;

/** DOM-style depth ladder. Clicking a price sets it as the ticket's limit price (Limit mode). */
export function OrderBook({ drag }: { drag?: PanelDragProps }) {
  const book = useMarketStore((s) => s.book);
  const history = useMarketStore((s) => s.bookHistory);
  const [view, setView] = useState<'dom' | 'depth' | 'heat'>('dom');
  const version = useMarketStore((s) => s.bookVersion);
  const symbol = useMarketStore((s) => s.selected);
  const last = useMarketStore((s) => s.assets[s.selected].price);
  const limitPrice = useOrderStore((s) => s.limitPrice);
  const orderType = useOrderStore((s) => s.orderType);
  const limitFromBook = useOrderStore((s) => s.limitFromBook);
  // What the ticket's order would take right now — marked on the ladder and the depth chart.
  const { t, pv } = useTicketPreview();
  const taking = pv.ok && pv.take.filled > 0 && t.symbol === symbol;
  const takeSide: 'bid' | 'ask' = t.side === 'Long' ? 'ask' : 'bid';
  const takenAt = (price: number) => (taking ? (pv.take.legs.find((l) => !l.estimated && Math.abs(l.price - price) <= Math.abs(price) * 1e-9)?.qty ?? 0) : 0);
  const depthMark =
    taking && pv.take.avgPx != null && pv.take.worstPx != null
      ? { buy: t.side === 'Long', qty: pv.take.filled, avgPx: pv.take.avgPx, worstPx: pv.take.worstPx, label: `${fmtQty(pv.take.filled)} → avg ${fmtPrice(pv.take.avgPx)} · ${Math.abs(pv.slippageBps) < 0.05 ? '0.0' : pv.slippageBps.toFixed(1)} bp` }
      : null;

  // Fit-to-screen: show as many levels per side as the panel has room for (no inner scrolling).
  const fit = useTerminalFit();
  const obRef = useRef<HTMLDivElement>(null);
  const [levels, setLevels] = useState(LEVELS);
  useLayoutEffect(() => {
    const ob = obRef.current;
    const body = ob?.parentElement;
    if (!fit || !ob || !body) {
      setLevels(LEVELS);
      return;
    }
    const measure = () => {
      const fixed = ['.ob-head', '.ob-divider', '.ob-foot'].reduce((s, q) => s + ((ob.querySelector(q) as HTMLElement | null)?.offsetHeight ?? 30), 0);
      const row = (ob.querySelector('.ob-row') as HTMLElement | null)?.offsetHeight || 21;
      setLevels(Math.max(3, Math.min(20, Math.floor((body.clientHeight - fixed - 2) / row / 2))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    return () => ro.disconnect();
  }, [fit, view, book == null]);

  const ladder = useMemo(() => {
    if (!book) return null;
    const asks = book.asks.slice(0, levels);
    const bids = book.bids.slice(0, levels);
    const maxCum = Math.max(asks.at(-1)?.cumulative ?? 0, bids.at(-1)?.cumulative ?? 0) || 1;
    const spread = (asks[0]?.price ?? 0) - (bids[0]?.price ?? 0);
    const mid = ((asks[0]?.price ?? 0) + (bids[0]?.price ?? 0)) / 2;
    return { asks, bids, maxCum, spread, spreadPct: mid ? (spread / mid) * 100 : 0, imb: imbalance(book) };
  }, [book, levels]);

  const dec = priceDecimals(last);
  const flash = useTickFlash(last);
  const working = usePositionStore((s) => s.workingOrders);
  /** Size of the user's own resting orders at this price level (within half a tick). */
  const mineAt = (price: number) => {
    const half = tickSize(price) / 2 + 1e-12;
    return working.filter((o) => o.symbol === symbol && Math.abs(o.limitPrice - price) <= half).reduce((s, o) => s + o.size, 0);
  };
  const row = (l: OrderBookLevel, side: 'bid' | 'ask', i: number) => (
    <button
      key={`${side}-${i}`}
      className={`ob-row ${side} ${orderType === 'limit' && limitPrice != null && Math.abs(limitPrice - l.price) < 1e-9 ? 'chosen' : ''} ${side === takeSide && takenAt(l.price) > 0 ? 'taken' : ''}`}
      onClick={() => limitFromBook(l.price)}
      title={side === takeSide && takenAt(l.price) > 0 ? `Your ticket would take ${fmtQty(takenAt(l.price))} here · click to set as limit price` : 'Set as limit price'}
      data-testid={`ob-${side}-${i}`}
    >
      <span className="ob-depth" style={{ width: `${(l.cumulative / (ladder?.maxCum ?? 1)) * 100}%` }} />
      <PriceCell key={version} text={fmtPrice(l.price, dec)} mine={mineAt(l.price)} />
      <span className="ob-size num">{fmtQty(l.size)}</span>
      <span className="ob-cum num faint">{fmtQty(l.cumulative)}</span>
    </button>
  );

  return (
    <Panel
      code="DOM"
      title="Depth of Market"
      sub={`${symbol}/USDT`}
      drag={drag}
      flush
      testId="orderbook"
      actions={
        <Segmented
          value={view}
          onChange={setView}
          ariaLabel="Book view"
          options={[
            { value: 'dom', label: 'Ladder' },
            { value: 'depth', label: 'Depth' },
            { value: 'heat', label: 'Heatmap' },
          ]}
        />
      }
    >
      {view === 'depth' && book && <DepthChart book={book} order={depthMark} />}
      {view === 'heat' && <LiquidityHeatmap history={history} />}
      <div className="ob no-select" hidden={view !== 'dom'} ref={obRef}>
        <div className="ob-head label">
          <span>Price</span>
          <span>Size</span>
          <span>Total</span>
        </div>
        {!ladder ? (
          <div className="empty">Loading book…</div>
        ) : (
          <>
            <div className="ob-side asks">{[...ladder.asks].reverse().map((l, i) => row(l, 'ask', ladder.asks.length - 1 - i))}</div>
            <div className="ob-divider">
              <span className={`num ob-last ${flash.cls}`} key={flash.key}>
                {fmtPrice(last, dec)}
              </span>
              <span className="spacer" />
              <span className="label">Spread</span>
              <span className="num">{fmtPrice(ladder.spread, dec)}</span>
              <span className="num faint">{fmtPct(ladder.spreadPct, 3, false)}</span>
            </div>
            <div className="ob-side bids">{ladder.bids.map((l, i) => row(l, 'bid', i))}</div>
            <div className="ob-foot">
              <span className="label">IMB</span>
              <div className="imb-bar">
                <span className="imb-bid" style={{ width: `${((ladder.imb + 1) / 2) * 100}%` }} />
              </div>
              <span className={`num ${ladder.imb >= 0 ? 'up' : 'down'}`}>{fmtPct(ladder.imb * 100, 1)}</span>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/** Price with the moving digits emphasised; flags levels where the user has a resting order. */
function PriceCell({ text, mine }: { text: string; mine: number }) {
  const [lead, tail] = splitPrice(text);
  return (
    <span className="ob-price num">
      {mine > 0 && <span className="ob-mine" title={`Your order: ${fmtQty(mine)}`} data-testid="ob-mine" />}
      <span className="ob-lead">{lead}</span>
      {tail}
    </span>
  );
}
