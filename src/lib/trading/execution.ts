/**
 * Pre-trade execution model: walks the visible order book to price an order before it is sent,
 * and applies time-in-force / post-only / reduce-only rules the way a venue's matching engine would.
 * Pure — the ticket uses it for the live preview and the order router uses the same result to fill.
 */
import type { OrderBookLevel, OrderBookSnapshot, Side } from '@/types';
import { fmtPrice, fmtQty } from '@/lib/format';

export type TimeInForce = 'GTC' | 'IOC' | 'FOK';
export type ExecType = 'market' | 'limit';

export interface Leg {
  price: number;
  qty: number;
  /** Beyond the visible book: liquidity assumed from the book's average level size and spacing. */
  estimated: boolean;
}

export interface Sweep {
  legs: Leg[];
  filled: number;
  notional: number;
  avgPx: number | null;
  worstPx: number | null;
  /** Visible levels touched. */
  levels: number;
  beyondBook: boolean;
}

const EPS = 1e-12;

/**
 * Take liquidity from one side of the book. Buys lift asks (ascending), sells hit bids (descending);
 * `limit` caps the worst acceptable price. With `extrapolate`, size beyond the last visible level is
 * assumed to continue at the book's average level size and spacing (and flagged as estimated).
 */
export function sweepBook(levels: OrderBookLevel[], qty: number, buy: boolean, limit?: number, extrapolate = false): Sweep {
  const legs: Leg[] = [];
  const tol = (p: number) => Math.abs(p) * 1e-9;
  const acceptable = (p: number) => limit == null || (buy ? p <= limit + tol(limit) : p >= limit - tol(limit));
  let rem = qty;
  let visible = 0;
  let stoppedByLimit = false;
  for (const l of levels) {
    if (rem <= qty * EPS) break;
    if (!acceptable(l.price)) {
      stoppedByLimit = true;
      break;
    }
    const q = Math.min(rem, l.size);
    if (q > 0) {
      legs.push({ price: l.price, qty: q, estimated: false });
      visible++;
      rem -= q;
    }
  }
  let beyondBook = false;
  if (rem > qty * EPS && extrapolate && !stoppedByLimit && levels.length >= 2) {
    const first = levels[0].price;
    const last = levels[levels.length - 1].price;
    const gap = Math.abs(last - first) / (levels.length - 1) || Math.abs(first) * 1e-4;
    const avgSize = levels.reduce((s, l) => s + l.size, 0) / levels.length || 1;
    let p = last;
    for (let i = 0; i < 5000 && rem > qty * EPS; i++) {
      p = buy ? p + gap : p - gap;
      if (p <= 0 || !acceptable(p)) break;
      const q = Math.min(rem, avgSize);
      legs.push({ price: +p.toPrecision(12), qty: q, estimated: true });
      rem -= q;
      beyondBook = true;
    }
  }
  const filled = qty - Math.max(0, rem);
  const notional = legs.reduce((s, l) => s + l.price * l.qty, 0);
  return { legs, filled: filled > qty * EPS ? filled : 0, notional, avgPx: filled > qty * EPS ? notional / filled : null, worstPx: legs.length ? legs[legs.length - 1].price : null, levels: visible, beyondBook };
}

export interface PreviewInput {
  side: Side;
  type: ExecType;
  qty: number;
  limitPrice?: number;
  tif: TimeInForce;
  postOnly: boolean;
  reduceOnly: boolean;
  /** Size of opposite-side positions a reduce-only order may close. */
  reducible?: number;
  /** Market-order price protection, in bps from the touch. */
  maxSlippageBps?: number;
  book: OrderBookSnapshot | null;
  bid: number;
  ask: number;
  rates: { maker: number; taker: number };
}

export interface ExecPreview {
  ok: boolean;
  reject?: string;
  warnings: string[];
  /** Quantity after reduce-only clamping. */
  qty: number;
  take: Sweep;
  restQty: number;
  restPx: number | null;
  cancelQty: number;
  touch: number;
  mid: number;
  spreadBps: number;
  /** Average take price vs the touch, in bps; positive = cost. */
  slippageBps: number;
  /** Average take price vs mid (half-spread + slippage), in bps; positive = cost. */
  impactBps: number;
  takerFee: number;
  /** Fee if the resting part fills (negative = rebate). */
  makerFee: number;
  liquidity: 'taker' | 'maker' | 'mixed' | 'none';
  /** Notional of what fills now plus what rests. */
  notional: number;
  /** Taker notional + resting notional + positive fees: cash a non-reducing order must have. */
  required: number;
}

const bps = (a: number, b: number) => (b ? ((a - b) / b) * 10_000 : 0);

export function previewOrder(i: PreviewInput): ExecPreview {
  const buy = i.side === 'Long';
  const warnings: string[] = [];
  const bookSide = i.book ? (buy ? i.book.asks : i.book.bids) : [];
  const hasBook = bookSide.length > 0;
  const bestBid = i.book?.bids[0]?.price ?? i.bid;
  const bestAsk = i.book?.asks[0]?.price ?? i.ask;
  const touch = buy ? bestAsk : bestBid;
  const mid = (bestBid + bestAsk) / 2;
  const spreadBps = mid ? ((bestAsk - bestBid) / mid) * 10_000 : 0;
  // Without a book (another symbol, or before the first snapshot) treat the touch as deep enough.
  const levels: OrderBookLevel[] = hasBook ? bookSide : [{ price: touch, size: Number.MAX_SAFE_INTEGER, cumulative: Number.MAX_SAFE_INTEGER }];
  const empty: Sweep = { legs: [], filled: 0, notional: 0, avgPx: null, worstPx: null, levels: 0, beyondBook: false };
  const base = { warnings, take: empty, restQty: 0, restPx: null, cancelQty: 0, touch, mid, spreadBps, slippageBps: 0, impactBps: 0, takerFee: 0, makerFee: 0, liquidity: 'none' as const, notional: 0, required: 0 };
  const reject = (reason: string, qty = i.qty): ExecPreview => ({ ...base, ok: false, reject: reason, qty });

  if (!(i.qty > 0)) return reject('Size must be greater than zero', 0);
  let qty = i.qty;
  if (i.reduceOnly) {
    const r = i.reducible ?? 0;
    if (!(r > 0)) return reject(`Reduce-only: no ${buy ? 'short' : 'long'} position to reduce`);
    if (qty > r + r * 1e-9) {
      warnings.push(`Reduce-only: clamped to the ${fmtQty(r)} open — the rest would add exposure`);
      qty = r;
    }
  }

  if (i.type === 'limit') {
    const lp = i.limitPrice;
    if (lp == null || !(lp > 0)) return reject('Enter a limit price', qty);
    const marketable = buy ? lp >= touch : lp <= touch;
    if (i.postOnly && marketable) return reject(`Post-only: a ${buy ? 'buy' : 'sell'} at ${fmtPrice(lp)} would cross the spread and take liquidity`, qty);
    const take = marketable ? sweepBook(levels, qty, buy, lp, hasBook) : empty;
    if (i.tif === 'FOK' && take.filled < qty - qty * 1e-9)
      return reject(marketable ? `FOK: only ${fmtQty(take.filled)} of ${fmtQty(qty)} available at ${fmtPrice(lp)} or better — nothing would fill` : `FOK: a limit at ${fmtPrice(lp)} doesn't cross the spread, so nothing can fill immediately`, qty);
    const remaining = Math.max(0, qty - take.filled);
    const rests = i.tif === 'GTC' && remaining > qty * 1e-9;
    const cancelQty = !rests && remaining > qty * 1e-9 ? remaining : 0;
    if (cancelQty > 0) warnings.push(`IOC: ${fmtQty(cancelQty)} can't fill at ${fmtPrice(lp)} or better and would be cancelled`);
    if (i.tif === 'IOC' && take.filled === 0) return reject(`IOC: a limit at ${fmtPrice(lp)} doesn't cross the spread — it would expire immediately`, qty);
    if (take.beyondBook) warnings.push('Part of the fill is beyond the visible book — price there is estimated');
    return finish(i, qty, take, rests ? remaining : 0, rests ? lp : null, cancelQty, touch, mid, spreadBps, warnings);
  }

  // Market: IOC by nature, optionally protected by a max-slippage limit from the touch.
  const protect = i.maxSlippageBps != null && i.maxSlippageBps > 0 ? touch * (1 + ((buy ? 1 : -1) * i.maxSlippageBps) / 10_000) : undefined;
  const take = sweepBook(levels, qty, buy, protect, hasBook);
  if (take.filled === 0) return reject('No liquidity within the slippage limit', qty);
  const cancelQty = Math.max(0, qty - take.filled);
  if (cancelQty > qty * 1e-9) warnings.push(`Slippage limit ${i.maxSlippageBps} bp reached: ${fmtQty(cancelQty)} would be cancelled`);
  if (take.beyondBook) warnings.push('Order is larger than the visible book — the tail price is estimated');
  return finish(i, qty, take, 0, null, cancelQty > qty * 1e-9 ? cancelQty : 0, touch, mid, spreadBps, warnings);
}

function finish(i: PreviewInput, qty: number, take: Sweep, restQty: number, restPx: number | null, cancelQty: number, touch: number, mid: number, spreadBps: number, warnings: string[]): ExecPreview {
  const sign = i.side === 'Long' ? 1 : -1;
  const takerFee = take.notional * i.rates.taker;
  const makerFee = restQty * (restPx ?? 0) * i.rates.maker;
  const notional = take.notional + restQty * (restPx ?? 0);
  const liquidity = take.filled > 0 && restQty > 0 ? 'mixed' : take.filled > 0 ? 'taker' : restQty > 0 ? 'maker' : 'none';
  return {
    ok: true,
    warnings,
    qty,
    take,
    restQty,
    restPx,
    cancelQty,
    touch,
    mid,
    spreadBps,
    slippageBps: take.avgPx != null ? sign * bps(take.avgPx, touch) : 0,
    impactBps: take.avgPx != null ? sign * bps(take.avgPx, mid) : 0,
    takerFee,
    makerFee,
    liquidity,
    notional,
    required: notional + Math.max(0, takerFee) + Math.max(0, makerFee),
  };
}

/** Signed slippage of a fill vs a reference (arrival mid), in bps; positive = worse for the trader. */
export function slippageVs(side: Side, fillPx: number, refPx: number): number {
  return (side === 'Long' ? 1 : -1) * bps(fillPx, refPx);
}
