import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { DepthChart, LiquidityHeatmap } from './DepthViews';
import { Panel } from '@/components/ui/Panel';
import { useMarketStore } from '@/stores/useMarketStore';
import { useOrderStore } from '@/stores/useOrderStore';
import { imbalance, tickSize } from '@/lib/mock/orderbook';
import { usePositionStore } from '@/stores/usePositionStore';
import { fmtPct, fmtPrice, fmtQty, priceDecimals, splitPrice, fmtBookQty } from '@/lib/format';
import type { OrderBookLevel } from '@/types';
import { useTickFlash } from '@/app/useTickFlash';
import { useTicketPreview } from './useTicket';
import { GROUPINGS, groupLevels } from '@/lib/orderbook/group';
import { largePrintThreshold } from '@/lib/orderflow/orderflow';
import { fmtStep, fmtTime } from '@/lib/format';
import { useWindowSettings, useWindowSymbol } from '@/workspace/WindowContext';
import { Streamed } from '@/workspace/StreamPrompt';

const LEVELS = 10;

type View = 'dom' | 'depth' | 'heat';
type Settings = { view: View; group: number; depth: 'cum' | 'size' };

/**
 * Depth of market: the ladder (click a price for a limit at it), with tick grouping and a
 * cumulative / size-only depth toggle; depth chart and liquidity heatmap views; and the last 20
 * prints underneath. The live book streams for the active link context's symbol; a book window
 * showing another symbol offers to switch the stream.
 */
export function OrderBook() {
  const symbol = useWindowSymbol();
  return (
    <Streamed testId="orderbook">
      <Ladder symbol={symbol} />
    </Streamed>
  );
}

function Ladder({ symbol }: { symbol: string }) {
  const book = useMarketStore((s) => s.book);
  const history = useMarketStore((s) => s.bookHistory);
  const [settings, patch] = useWindowSettings<Settings>();
  const [ownView, setOwnView] = useState<View>('dom');
  const view = settings.view ?? ownView;
  const setView = (v: View) => (patch({ view: v }), setOwnView(v));
  const group = settings.group ?? 1;
  const depthMode = settings.depth ?? 'cum';
  const version = useMarketStore((s) => s.bookVersion);
  const last = useMarketStore((s) => s.assets[symbol].price);
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

  // Show as many levels per side as the window has room for (no inner scrolling).
  const fit = true;
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
      const tape = (body.querySelector('.ob-tape') as HTMLElement | null)?.offsetHeight ?? 0;
      setLevels(Math.max(3, Math.min(20, Math.floor((body.clientHeight - tape - fixed - 2) / row / 2))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    return () => ro.disconnect();
  }, [fit, view, book == null]);

  const tick = tickSize(last);
  const ladder = useMemo(() => {
    if (!book) return null;
    const step = group > 1 ? tick * group : 0;
    const asks = groupLevels(book.asks, step, 'ask').slice(0, levels);
    const bids = groupLevels(book.bids, step, 'bid').slice(0, levels);
    const maxCum = Math.max(asks.at(-1)?.cumulative ?? 0, bids.at(-1)?.cumulative ?? 0) || 1;
    const maxSize = Math.max(...asks.map((l) => l.size), ...bids.map((l) => l.size), 0) || 1;
    const spread = (asks[0]?.price ?? 0) - (bids[0]?.price ?? 0);
    const mid = ((asks[0]?.price ?? 0) + (bids[0]?.price ?? 0)) / 2;
    return { asks, bids, maxCum, maxSize, spread, spreadPct: mid ? (spread / mid) * 100 : 0, imb: imbalance(book) };
  }, [book, levels, group, tick]);

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
      <span className="ob-depth" style={{ width: `${(depthMode === 'cum' ? l.cumulative / (ladder?.maxCum ?? 1) : l.size / (ladder?.maxSize ?? 1)) * 100}%` }} />
      <PriceCell key={version} text={fmtPrice(l.price, dec)} mine={mineAt(l.price)} />
      <span className="ob-size num">{fmtBookQty(l.size)}</span>
      <span className="ob-cum num faint">{fmtBookQty(l.cumulative)}</span>
    </button>
  );

  return (
    <Panel
      code="DOM"
      title="Depth of Market"
      flush
      testId="orderbook"
      className="ob-win"
      sub={
        view === 'dom' && (
          <span className="ob-controls">
            <select className="cw-select mono" value={group} onChange={(e) => patch({ group: Number(e.target.value) })} aria-label="Group price levels" title="Group price levels by ticks" data-testid="ob-group">
              {GROUPINGS.map((g) => (
                <option key={g} value={g}>
                  {fmtStep(tick * g)}
                </option>
              ))}
            </select>
            <button className={`cw-btn txt ${depthMode === 'cum' ? 'on' : ''}`} onClick={() => patch({ depth: depthMode === 'cum' ? 'size' : 'cum' })} aria-pressed={depthMode === 'cum'} title={depthMode === 'cum' ? 'Depth bars: running total (click for size only)' : 'Depth bars: size at each level (click for running total)'} data-testid="ob-depth-mode">
              {depthMode === 'cum' ? 'Σ' : 'Sz'}
            </button>
          </span>
        )
      }
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
      {view === 'dom' && <TapeStrip />}
    </Panel>
  );
}

/** The last 20 prints, under the ladder. */
function TapeStrip() {
  const trades = useMarketStore((s) => s.trades);
  const threshold = useMemo(() => largePrintThreshold(trades.slice(0, 300)), [trades]);
  const dec = priceDecimals(trades[0]?.price ?? 1);
  return (
    <div className="ob-tape" data-testid="ob-tape">
      <div className="ob-tape-head label">
        <span>Time</span>
        <span>Price</span>
        <span>Size</span>
      </div>
      {trades.slice(0, 20).map((t) => {
        const big = t.price * t.size >= threshold;
        return (
          <div key={t.id} className={`ob-tape-row ${t.side} ${big ? 'big' : ''}`} data-testid="ob-tape-row">
            <span className="num faint">{fmtTime(t.time)}</span>
            <span className={`num ${t.side === 'buy' ? 'up' : 'down'}`}>{fmtPrice(t.price, dec)}</span>
            <span className="num">
              {big ? '◆ ' : ''}
              {fmtQty(t.size)}
            </span>
          </div>
        );
      })}
      {trades.length === 0 && <div className="win-empty">Awaiting prints…</div>}
    </div>
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
