/**
 * Order router: every order is priced against the live book with the same model the ticket previews
 * (lib/trading/execution), then filled, rested or rejected — with an order record and fills kept for
 * the blotter. The mock venue is this module; a real build routes through a venue order API and
 * reflects acknowledgements and fills from its stream into the same records.
 */
import type { AlgoOrder, FillRecord, OrderRecord, Position, Side, TimeInForce, WorkingOrder } from '@/types';
import { fmtPrice, fmtQty, fmtSigned, fmtUsd, uid } from '@/lib/format';
import { FEE_TIERS, feeFor, type Liquidity } from '@/lib/account/fees';
import { previewOrder, slippageVs, type ExecPreview, type Leg } from '@/lib/trading/execution';
import { useFeeStore } from './useFeeStore';
import { unrealizedPnl } from '@/lib/trading/pnl';
import { useMarketStore } from './useMarketStore';
import { usePositionStore } from './usePositionStore';
import { useWalletStore } from './useWalletStore';
import { useExecutionStore, isLive } from './useExecutionStore';
import { toast } from './useToastStore';

export const CLOSE_ANIM_MS = 320;
const EPS = 1e-9;

export interface OrderRequest {
  symbol: string;
  side: Side;
  orderType: 'market' | 'limit';
  size: number;
  limitPrice?: number;
  tp: number;
  sl: number;
  /** Limit orders only; market orders are immediate-or-cancel by nature. Default GTC. */
  tif?: TimeInForce;
  postOnly?: boolean;
  reduceOnly?: boolean;
  /** Attach TP (limit) and SL (stop) as live OCO exit orders. Off = TP/SL are alert levels only. */
  bracket?: boolean;
  /** Market-order price protection from the touch, in bps. */
  maxSlippageBps?: number;
  source?: OrderRecord['source'];
}

export type OrderResult = { ok: true; id: string; fee?: number } | { ok: false; error: string };

const sideWord = (side: Side) => (side === 'Long' ? 'Buy' : 'Sell');
const opposite = (side: Side): Side => (side === 'Long' ? 'Short' : 'Long');
const ex = () => useExecutionStore.getState();

/** " · fee 0.60" / " · rebate 0.12" for toasts. */
function feeNote(fee: number | undefined): string {
  if (!fee) return '';
  return fee > 0 ? ` · fee ${fmtUsd(fee, 2)}` : ` · rebate ${fmtUsd(-fee, 2)}`;
}

function rates() {
  const t = FEE_TIERS[useFeeStore.getState().tier];
  return { maker: t.maker, taker: t.taker };
}

/** The live book is only streamed for the selected symbol; other symbols price off the ticker. */
export function bookFor(symbol: string) {
  const m = useMarketStore.getState();
  return m.selected === symbol ? m.book : null;
}

/** Size of opposite-side positions a reduce-only order on `side` could close. */
export function reducibleFor(symbol: string, side: Side): number {
  const { positions, closing } = usePositionStore.getState();
  return positions.filter((p) => p.symbol === symbol && p.side === opposite(side) && !closing[p.id]).reduce((s, p) => s + p.size, 0);
}

/** Pre-trade preview with the account's current fees, book and positions. */
export function previewFor(req: OrderRequest): ExecPreview {
  const a = useMarketStore.getState().assets[req.symbol];
  return previewOrder({
    side: req.side,
    type: req.orderType,
    qty: req.size,
    limitPrice: req.limitPrice,
    tif: req.orderType === 'market' ? 'IOC' : (req.tif ?? 'GTC'),
    postOnly: !!req.postOnly && req.orderType === 'limit',
    reduceOnly: !!req.reduceOnly,
    reducible: req.reduceOnly ? reducibleFor(req.symbol, req.side) : undefined,
    maxSlippageBps: req.orderType === 'market' ? req.maxSlippageBps : undefined,
    book: bookFor(req.symbol),
    bid: a?.bid ?? 0,
    ask: a?.ask ?? 0,
    rates: rates(),
  });
}

/* ── Records ─────────────────────────────────────────────────────────────────────────────── */

function newRecord(p: Omit<OrderRecord, 'id' | 'filledQty' | 'avgPx' | 'fees' | 'createdAt' | 'updatedAt' | 'status'> & { id?: string }): OrderRecord {
  const now = Date.now();
  return { ...p, id: p.id ?? uid('ord_'), filledQty: 0, avgPx: null, fees: 0, createdAt: now, updatedAt: now, status: 'new' };
}

/** Record fills against an order and roll up its filled qty / average price / fees. */
function recordFills(orderId: string, symbol: string, side: Side, legs: Leg[], liq: Liquidity) {
  if (!legs.length) return;
  const tier = useFeeStore.getState().tier;
  const time = Date.now();
  // Collapse modelled (beyond-book) legs into one fill so a large order doesn't spam the blotter.
  const real = legs.filter((l) => !l.estimated);
  const est = legs.filter((l) => l.estimated);
  const merged: Leg[] = [...real];
  if (est.length) {
    const q = est.reduce((s, l) => s + l.qty, 0);
    merged.push({ price: est.reduce((s, l) => s + l.price * l.qty, 0) / q, qty: q, estimated: true });
  }
  const fills: FillRecord[] = merged.map((l) => ({ id: uid('fill_'), orderId, symbol, side, price: l.price, qty: l.qty, fee: feeFor(l.price * l.qty, tier, liq), liquidity: liq, time, estimated: l.estimated }));
  ex().addFills(fills);
  const o = ex().orders.find((x) => x.id === orderId);
  if (!o) return;
  const addQty = fills.reduce((s, f) => s + f.qty, 0);
  const addNotional = fills.reduce((s, f) => s + f.price * f.qty, 0);
  const filledQty = o.filledQty + addQty;
  ex().patch(orderId, { filledQty, avgPx: ((o.avgPx ?? 0) * o.filledQty + addNotional) / filledQty, fees: o.fees + fills.reduce((s, f) => s + f.fee, 0) });
}

function reject(rec: OrderRecord, reason: string): OrderResult {
  ex().upsert({ ...rec, status: 'rejected', reason, updatedAt: Date.now() });
  toast({ kind: 'error', title: 'Order rejected', detail: reason });
  return { ok: false, error: reason };
}

/* ── Positions ───────────────────────────────────────────────────────────────────────────── */

interface OpenArgs {
  symbol: string;
  side: Side;
  size: number;
  tp: number;
  sl: number;
  orderType: 'market' | 'limit';
  bracket?: boolean;
  orderId?: string;
}

function openPosition(req: OpenArgs, entry: number, liq: Liquidity = 'taker'): OrderResult {
  const notional = entry * req.size;
  const fee = feeFor(notional, useFeeStore.getState().tier, liq);
  if (notional + Math.max(0, fee) > useWalletStore.getState().balance + EPS) return { ok: false, error: 'Insufficient balance (incl. fees)' };
  if (!useWalletStore.getState().reserve(notional)) return { ok: false, error: 'Insufficient balance' };
  const charged = useFeeStore.getState().charge(notional, liq);
  const p: Position = {
    id: uid('pos_'),
    symbol: req.symbol,
    side: req.side,
    size: req.size,
    entry,
    current: entry,
    tp: req.tp,
    sl: req.sl,
    pnl: 0,
    tpHit: false,
    slHit: false,
    orderType: req.orderType,
    openedAt: Date.now(),
    bracket: !!req.bracket,
    orderId: req.orderId,
  };
  usePositionStore.getState().add(p);
  if (p.bracket) attachBracket(p);
  return { ok: true, id: p.id, fee: charged };
}

/** TP (limit) + SL (stop-market) as reduce-only children of the position, one-cancels-the-other. */
function attachBracket(p: Position) {
  const common = { symbol: p.symbol, side: opposite(p.side), qty: p.size, tif: 'GTC' as const, postOnly: false, reduceOnly: true, bracket: true, parentId: p.orderId, positionId: p.id, arrivalMid: p.entry, source: 'bracket' as const };
  ex().upsert(newRecord({ ...common, kind: 'take_profit', limitPrice: p.tp }));
  ex().upsert(newRecord({ ...common, kind: 'stop_loss', triggerPrice: p.sl }));
}

function bracketLegs(positionId: string) {
  return ex().orders.filter((o) => o.positionId === positionId && o.source === 'bracket' && isLive(o));
}

function cancelBracket(positionId: string, reason: string) {
  for (const o of bracketLegs(positionId)) ex().patch(o.id, { status: 'cancelled', reason });
}

/** Adds to an existing position at `px`, re-averaging the entry. */
function increasePosition(id: string, add: number, px: number, liq: Liquidity = 'taker'): boolean {
  const p = usePositionStore.getState().positions.find((x) => x.id === id);
  if (!p || !useWalletStore.getState().reserve(px * add)) return false;
  useFeeStore.getState().charge(px * add, liq);
  const size = p.size + add;
  usePositionStore.getState().patch(id, { size, entry: (p.entry * p.size + px * add) / size });
  return true;
}

/** Close `qty` of a position at `px`: settle notional + P/L, charge the fee. Returns realized P/L. */
function reducePosition(p: Position, qty: number, px: number, liq: Liquidity, reason = 'Position closed'): number {
  const q = Math.min(qty, p.size);
  const pnl = unrealizedPnl(p.side, p.entry, px, q);
  useWalletStore.getState().settle(p.entry * q + pnl);
  useFeeStore.getState().charge(px * q, liq);
  usePositionStore.getState().addRealized(pnl);
  if (q >= p.size - p.size * EPS) {
    usePositionStore.getState().remove(p.id);
    cancelBracket(p.id, reason);
  } else {
    usePositionStore.getState().patch(p.id, { size: p.size - q, pnl: unrealizedPnl(p.side, p.entry, p.current, p.size - q) });
  }
  return pnl;
}

/** Reduce opposite-side positions FIFO (oldest first). Returns realized P/L and the qty applied. */
function reduceOpposite(symbol: string, side: Side, qty: number, px: number, liq: Liquidity): { pnl: number; applied: number } {
  const { positions, closing } = usePositionStore.getState();
  const targets = positions.filter((p) => p.symbol === symbol && p.side === opposite(side) && !closing[p.id]).sort((a, b) => a.openedAt - b.openedAt);
  let rem = qty;
  let pnl = 0;
  for (const p of targets) {
    if (rem <= qty * EPS) break;
    const q = Math.min(rem, p.size);
    pnl += reducePosition(p, q, px, liq, 'Reduced by a reduce-only order');
    rem -= q;
  }
  return { pnl, applied: qty - rem };
}

/* ── Placing orders ──────────────────────────────────────────────────────────────────────── */

export function placeOrder(req: OrderRequest): OrderResult {
  if (!(req.size > 0)) return { ok: false, error: 'Size must be greater than zero' };
  const asset = useMarketStore.getState().assets[req.symbol];
  if (!asset) return { ok: false, error: `Unknown symbol ${req.symbol}` };
  if (req.orderType === 'limit' && !(req.limitPrice != null && req.limitPrice > 0)) return { ok: false, error: 'Enter a limit price' };

  const reduceOnly = !!req.reduceOnly;
  const bracket = !!req.bracket && !reduceOnly;
  const pv = previewFor(req);
  const rec = newRecord({
    symbol: req.symbol,
    side: req.side,
    kind: req.orderType,
    qty: req.size,
    limitPrice: req.orderType === 'limit' ? req.limitPrice : undefined,
    tif: req.orderType === 'market' ? 'IOC' : (req.tif ?? 'GTC'),
    postOnly: !!req.postOnly && req.orderType === 'limit',
    reduceOnly,
    bracket,
    arrivalMid: pv.mid,
    source: req.source ?? 'ticket',
  });
  if (!pv.ok) return reject(rec, pv.reject ?? 'Rejected');
  if (!reduceOnly && pv.required > useWalletStore.getState().balance + EPS) return reject(rec, pv.take.filled > 0 ? 'Insufficient balance (incl. fees)' : 'Insufficient balance');
  ex().upsert({ ...rec, qty: pv.qty, reason: pv.qty < req.size - req.size * EPS ? `Reduce-only: clamped from ${fmtQty(req.size)} to the open size` : undefined });

  // 1. The marketable part takes liquidity now.
  let positionId: string | undefined;
  let fee = 0;
  if (pv.take.filled > 0) {
    const px = pv.take.avgPx!;
    if (reduceOnly) {
      const r = reduceOpposite(req.symbol, req.side, pv.take.filled, px, 'taker');
      fee = feeFor(px * r.applied, useFeeStore.getState().tier, 'taker');
    } else {
      const r = openPosition({ symbol: req.symbol, side: req.side, size: pv.take.filled, tp: req.tp, sl: req.sl, orderType: req.orderType, bracket, orderId: rec.id }, px, 'taker');
      if (!r.ok) return reject(rec, r.error);
      positionId = r.id;
      fee = r.fee ?? 0;
    }
    recordFills(rec.id, req.symbol, req.side, pv.take.legs, 'taker');
  }

  // 2. A GTC remainder rests on the book (maker if it fills later).
  if (pv.restQty > 0 && pv.restPx != null) {
    const o: WorkingOrder = { id: rec.id, symbol: req.symbol, side: req.side, size: pv.restQty, limitPrice: pv.restPx, tp: req.tp, sl: req.sl, createdAt: Date.now(), postOnly: rec.postOnly, reduceOnly, bracket, positionId };
    usePositionStore.getState().addWorking(o);
  }

  // 3. Final status for this event.
  const filled = pv.take.filled;
  const status: OrderRecord['status'] = pv.restQty > 0 ? (filled > 0 ? 'partially_filled' : 'new') : pv.cancelQty > 0 ? 'cancelled' : 'filled';
  const reason = pv.cancelQty > 0 ? (req.orderType === 'market' ? `Slippage limit: ${fmtQty(pv.cancelQty)} cancelled` : `IOC: ${fmtQty(pv.cancelQty)} unfilled, cancelled`) : ex().orders.find((x) => x.id === rec.id)?.reason;
  ex().patch(rec.id, { status, reason, positionId });

  const what = `${req.orderType === 'market' ? 'market' : 'limit'} order`;
  if (filled > 0) {
    const slip = pv.slippageBps;
    toast({
      kind: 'success',
      title: req.orderType === 'market' ? `${sideWord(req.side)} ${what} placed` : `${sideWord(req.side)} ${what} ${pv.restQty > 0 ? 'placed' : 'filled'}`,
      detail: `${fmtQty(filled)} ${req.symbol} @ ${fmtPrice(pv.take.avgPx!)}${Math.abs(slip) >= 0.05 ? ` · slip ${slip.toFixed(1)} bp` : ''}${feeNote(fee)}${pv.restQty > 0 ? ` · ${fmtQty(pv.restQty)} resting @ ${fmtPrice(pv.restPx!)}` : ''}${reduceOnly ? ' · reduce-only' : ''}`,
    });
  } else {
    toast({ kind: 'success', title: `${sideWord(req.side)} ${what} placed`, detail: `${fmtQty(pv.restQty)} ${req.symbol} @ ${fmtPrice(pv.restPx!)}${rec.postOnly ? ' · post-only' : ''}${reduceOnly ? ' · reduce-only' : ''}` });
  }
  return { ok: true, id: positionId ?? rec.id, fee };
}

export function cancelWorkingOrder(id: string) {
  const o = usePositionStore.getState().removeWorking(id);
  if (!o) return;
  const rec = ex().orders.find((x) => x.id === id);
  if (rec) ex().patch(id, { status: 'cancelled', reason: rec.filledQty > 0 ? 'Cancelled by user · rest of a partial fill' : 'Cancelled by user' });
  toast({ kind: 'info', title: 'Order cancelled', detail: `${sideWord(o.side)} ${fmtQty(o.size)} ${o.symbol} @ ${fmtPrice(o.limitPrice)}` });
}

/** Cancel one leg of a bracket; the position keeps the other leg. */
export function cancelBracketLeg(orderId: string) {
  const o = ex().orders.find((x) => x.id === orderId);
  if (!o || !isLive(o)) return;
  ex().patch(orderId, { status: 'cancelled', reason: 'Cancelled by user' });
  const legs = o.positionId ? bracketLegs(o.positionId) : [];
  if (o.positionId && legs.length === 0) usePositionStore.getState().patch(o.positionId, { bracket: false });
  toast({ kind: 'info', title: `${o.kind === 'take_profit' ? 'Take-profit' : 'Stop-loss'} cancelled`, detail: `${o.symbol} · ${fmtPrice(o.limitPrice ?? o.triggerPrice ?? 0)}` });
}

/** A market close recorded as its own order (manual close / flatten / bracket exit). */
function recordClose(p: Position, px: number, liq: Liquidity, kind: OrderRecord['kind'], source: OrderRecord['source'], reason?: string) {
  const m = useMarketStore.getState().assets[p.symbol];
  const rec = newRecord({ symbol: p.symbol, side: opposite(p.side), kind, qty: p.size, tif: 'IOC', postOnly: false, reduceOnly: true, bracket: false, positionId: p.id, parentId: p.orderId, arrivalMid: m ? (m.bid + m.ask) / 2 : px, source, reason, limitPrice: kind === 'take_profit' ? p.tp : undefined, triggerPrice: kind === 'stop_loss' ? p.sl : undefined });
  ex().upsert(rec);
  recordFills(rec.id, p.symbol, opposite(p.side), [{ price: px, qty: p.size, estimated: false }], liq);
  ex().patch(rec.id, { status: 'filled' });
}

/** Close one position: fade/shrink, then remove and settle P/L into the wallet. */
export function closePosition(id: string): Promise<void> {
  const store = usePositionStore.getState();
  const p = store.positions.find((x) => x.id === id);
  if (!p || store.closing[id]) return Promise.resolve();
  store.markClosing(id);
  return new Promise((resolve) =>
    setTimeout(() => {
      const live = usePositionStore.getState().positions.find((x) => x.id === id);
      if (live) {
        const asset = useMarketStore.getState().assets[live.symbol];
        const px = asset ? (live.side === 'Long' ? asset.bid : asset.ask) : live.current;
        recordClose(live, px, 'taker', 'close', 'close');
        const pnl = reducePosition(live, live.size, px, 'taker', 'Position closed manually');
        toast({ kind: pnl >= 0 ? 'success' : 'info', title: `Closed ${live.side.toLowerCase()} ${live.symbol}`, detail: `${fmtQty(live.size)} @ ${fmtPrice(px)} · P/L ${fmtSigned(pnl)} USDT${feeNote(feeFor(px * live.size, useFeeStore.getState().tier, 'taker'))}` });
      }
      resolve();
    }, CLOSE_ANIM_MS),
  );
}

export function flattenAll(): Promise<number> {
  const { positions, closing, markClosing } = usePositionStore.getState();
  const open = positions.filter((p) => !closing[p.id]);
  if (open.length === 0) return Promise.resolve(0);
  open.forEach((p) => markClosing(p.id));
  return new Promise((resolve) =>
    setTimeout(() => {
      const assets = useMarketStore.getState().assets;
      let total = 0;
      for (const p of open) {
        const live = usePositionStore.getState().positions.find((x) => x.id === p.id);
        if (!live) continue;
        const a = assets[live.symbol];
        const px = a ? (live.side === 'Long' ? a.bid : a.ask) : live.current;
        recordClose(live, px, 'taker', 'close', 'close', 'Flatten all');
        total += reducePosition(live, live.size, px, 'taker', 'Flattened');
      }
      toast({ kind: total >= 0 ? 'success' : 'info', title: `Flattened ${open.length} position${open.length > 1 ? 's' : ''}`, detail: `Realized P/L ${fmtSigned(total)} USDT` });
      resolve(open.length);
    }, CLOSE_ANIM_MS),
  );
}

/** Called on every ticker batch: mark positions, fill resting limits, run bracket exits, announce TP/SL. */
export function onPrices() {
  const assets = useMarketStore.getState().assets;
  const prices = Object.fromEntries(Object.values(assets).map((a) => [a.symbol, a.price]));
  const ps = usePositionStore.getState();

  for (const o of ps.workingOrders) {
    const a = assets[o.symbol];
    if (!a) continue;
    if (!(o.side === 'Long' ? a.ask <= o.limitPrice : a.bid >= o.limitPrice)) continue;
    usePositionStore.getState().removeWorking(o.id);
    let rec = ex().orders.find((x) => x.id === o.id);
    if (!rec) {
      // Orders persisted before the blotter existed.
      rec = newRecord({ id: o.id, symbol: o.symbol, side: o.side, kind: 'limit', qty: o.size, limitPrice: o.limitPrice, tif: 'GTC', postOnly: !!o.postOnly, reduceOnly: !!o.reduceOnly, bracket: !!o.bracket, arrivalMid: (a.bid + a.ask) / 2, source: 'ticket' });
      ex().upsert(rec);
    }
    // A resting order that gets filled added liquidity: maker rate (a rebate for LPs).
    if (o.reduceOnly) {
      const q = Math.min(o.size, reducibleFor(o.symbol, o.side));
      if (q <= 0) {
        ex().patch(o.id, { status: 'cancelled', reason: 'Reduce-only: nothing left to reduce' });
        toast({ kind: 'info', title: 'Reduce-only order cancelled', detail: `No ${opposite(o.side).toLowerCase()} ${o.symbol} position left to reduce` });
        continue;
      }
      const r = reduceOpposite(o.symbol, o.side, q, o.limitPrice, 'maker');
      recordFills(o.id, o.symbol, o.side, [{ price: o.limitPrice, qty: r.applied, estimated: false }], 'maker');
      ex().patch(o.id, { status: 'filled' });
      toast({ kind: 'success', title: 'Limit order filled', detail: `${sideWord(o.side)} ${fmtQty(r.applied)} ${o.symbol} @ ${fmtPrice(o.limitPrice)} · reduce-only · P/L ${fmtSigned(r.pnl)}` });
      continue;
    }
    const merged = o.positionId && usePositionStore.getState().positions.some((p) => p.id === o.positionId) ? increasePosition(o.positionId, o.size, o.limitPrice, 'maker') : false;
    const r = merged ? ({ ok: true, id: o.positionId!, fee: feeFor(o.limitPrice * o.size, useFeeStore.getState().tier, 'maker') } as const) : openPosition({ symbol: o.symbol, side: o.side, orderType: 'limit', size: o.size, tp: o.tp, sl: o.sl, bracket: o.bracket, orderId: o.id }, o.limitPrice, 'maker');
    if (r.ok) {
      recordFills(o.id, o.symbol, o.side, [{ price: o.limitPrice, qty: o.size, estimated: false }], 'maker');
      ex().patch(o.id, { status: 'filled', positionId: r.id });
      toast({ kind: 'success', title: `Limit order filled`, detail: `${sideWord(o.side)} ${fmtQty(o.size)} ${o.symbol} @ ${fmtPrice(o.limitPrice)}${feeNote(r.fee)}` });
    } else {
      ex().patch(o.id, { status: 'rejected', reason: r.error });
      toast({ kind: 'error', title: 'Limit fill rejected', detail: r.error });
    }
  }

  const { tp, sl } = usePositionStore.getState().markToMarket(prices);

  // Bracket exits: TP is a resting limit (fills at its price, maker); SL is a stop-market (fills at
  // the touch when triggered, taker). Whichever fills first cancels the other.
  const handled = new Set<string>();
  for (const p of usePositionStore.getState().positions) {
    if (!p.bracket || usePositionStore.getState().closing[p.id]) continue;
    const a = assets[p.symbol];
    if (!a) continue;
    const long = p.side === 'Long';
    const exitTouch = long ? a.bid : a.ask;
    const tpFill = long ? exitTouch >= p.tp : exitTouch <= p.tp;
    const slFill = long ? exitTouch <= p.sl : exitTouch >= p.sl;
    if (!tpFill && !slFill) continue;
    handled.add(p.id);
    const legs = bracketLegs(p.id);
    const tpLeg = legs.find((o) => o.kind === 'take_profit');
    const slLeg = legs.find((o) => o.kind === 'stop_loss');
    const leg = tpFill ? tpLeg : slLeg;
    if (!leg) continue; // that leg was cancelled; the level is an alert only now
    const px = tpFill ? p.tp : exitTouch;
    const liq: Liquidity = tpFill ? 'maker' : 'taker';
    ex().patch(leg.id, { qty: p.size });
    recordFills(leg.id, p.symbol, opposite(p.side), [{ price: px, qty: p.size, estimated: false }], liq);
    ex().patch(leg.id, { status: 'filled', reason: tpFill ? undefined : `Stop triggered at ${fmtPrice(p.sl)}` });
    const pnl = reducePosition(p, p.size, px, liq, tpFill ? 'OCO: take-profit filled' : 'OCO: stop-loss filled');
    toast({
      kind: tpFill ? 'success' : 'error',
      title: `${tpFill ? 'Take-profit' : 'Stop-loss'} filled · ${p.side} ${p.symbol} closed`,
      detail: `${fmtQty(p.size)} @ ${fmtPrice(px)}${tpFill ? '' : ` (stop ${fmtPrice(p.sl)}, slip ${slippageVs(opposite(p.side), px, p.sl).toFixed(1)} bp)`} · P/L ${fmtSigned(pnl)} USDT`,
    });
  }

  // Alert-only levels (no bracket) just notify.
  tp.filter((p) => !handled.has(p.id) && !p.bracket).forEach((p) => toast({ kind: 'success', title: `TP reached · ${p.side} ${p.symbol}`, detail: `${fmtPrice(p.tp)} · P/L ${fmtSigned(p.pnl)} USDT` }));
  sl.filter((p) => !handled.has(p.id) && !p.bracket).forEach((p) => toast({ kind: 'error', title: `SL reached · ${p.side} ${p.symbol}`, detail: `${fmtPrice(p.sl)} · P/L ${fmtSigned(p.pnl)} USDT` }));
}

/* ── Execution algos ─────────────────────────────────────────────────────────────────────── */

const algoTimers = new Map<string, ReturnType<typeof setInterval>>();

export interface TwapRequest {
  symbol: string;
  side: Side;
  size: number;
  durationMs: number;
  slices: number;
  tp: number;
  sl: number;
  bracket?: boolean;
}

/** TWAP: split the parent into equal child market orders spaced evenly over the duration. */
export function startTwap(req: TwapRequest): OrderResult {
  const slices = Math.max(2, Math.min(200, Math.round(req.slices)));
  if (!(req.size > 0) || !(req.durationMs > 0)) return { ok: false, error: 'Invalid TWAP parameters' };
  const asset = useMarketStore.getState().assets[req.symbol];
  const arrival = req.side === 'Long' ? asset.ask : asset.bid;
  const rec = newRecord({ symbol: req.symbol, side: req.side, kind: 'twap', qty: req.size, tif: 'GTC', postOnly: false, reduceOnly: false, bracket: !!req.bracket, arrivalMid: (asset.bid + asset.ask) / 2, source: 'algo' });
  if (arrival * req.size > useWalletStore.getState().balance + EPS) {
    reject(rec, 'Insufficient balance for full parent size');
    return { ok: false, error: 'Insufficient balance' };
  }
  ex().upsert(rec);
  const algo: AlgoOrder = {
    id: rec.id, kind: 'TWAP', symbol: req.symbol, side: req.side, totalSize: req.size, slices, slicesDone: 0,
    intervalMs: req.durationMs / slices, filledSize: 0, avgPx: 0, arrivalPx: arrival, tp: req.tp, sl: req.sl,
    positionId: null, status: 'running', startedAt: Date.now(),
  };
  usePositionStore.getState().upsertAlgo(algo);
  toast({ kind: 'success', title: `TWAP started · ${sideWord(req.side)} ${req.symbol}`, detail: `${fmtQty(req.size)} in ${slices} slices over ${Math.round(req.durationMs / 60_000)}m` });
  const child = () => {
    const a = usePositionStore.getState().algos.find((x) => x.id === algo.id);
    if (!a || a.status !== 'running') return stopAlgo(algo.id);
    const q = useMarketStore.getState().assets[a.symbol];
    const px = a.side === 'Long' ? q.ask : q.bid;
    const size = a.totalSize / a.slices;
    let positionId = a.positionId;
    let ok: boolean;
    if (positionId && usePositionStore.getState().positions.some((p) => p.id === positionId)) ok = increasePosition(positionId, size, px);
    else {
      const r = openPosition({ symbol: a.symbol, side: a.side, orderType: 'market', size, tp: a.tp, sl: a.sl, bracket: req.bracket, orderId: rec.id }, px);
      ok = r.ok;
      if (r.ok) positionId = r.id;
    }
    if (!ok) {
      usePositionStore.getState().upsertAlgo({ ...a, status: 'cancelled' });
      ex().patch(rec.id, { status: 'cancelled', reason: 'Child order rejected (balance)' });
      toast({ kind: 'error', title: 'TWAP halted', detail: 'Child order rejected (balance)' });
      return stopAlgo(a.id);
    }
    recordFills(rec.id, a.symbol, a.side, [{ price: px, qty: size, estimated: false }], 'taker');
    const filled = a.filledSize + size;
    const next: AlgoOrder = { ...a, positionId, slicesDone: a.slicesDone + 1, filledSize: filled, avgPx: (a.avgPx * a.filledSize + px * size) / filled };
    if (next.slicesDone >= next.slices) {
      next.status = 'done';
      stopAlgo(a.id);
      ex().patch(rec.id, { status: 'filled', positionId: positionId ?? undefined });
      const slip = ((next.avgPx - next.arrivalPx) / next.arrivalPx) * 10_000 * (a.side === 'Long' ? 1 : -1);
      toast({ kind: 'success', title: `TWAP complete · ${a.symbol}`, detail: `avg ${fmtPrice(next.avgPx)} · slippage vs arrival ${slip.toFixed(1)} bp` });
    } else ex().patch(rec.id, { status: 'partially_filled', positionId: positionId ?? undefined });
    usePositionStore.getState().upsertAlgo(next);
  };
  child();
  algoTimers.set(algo.id, setInterval(child, algo.intervalMs));
  return { ok: true, id: algo.id };
}

function stopAlgo(id: string) {
  const t = algoTimers.get(id);
  if (t) clearInterval(t);
  algoTimers.delete(id);
}

export function cancelAlgo(id: string) {
  const a = usePositionStore.getState().algos.find((x) => x.id === id);
  if (!a || a.status !== 'running') return;
  stopAlgo(id);
  usePositionStore.getState().upsertAlgo({ ...a, status: 'cancelled' });
  ex().patch(id, { status: 'cancelled', reason: `Cancelled by user after ${a.slicesDone}/${a.slices} slices` });
  toast({ kind: 'info', title: 'TWAP cancelled', detail: `${fmtQty(a.filledSize)} / ${fmtQty(a.totalSize)} ${a.symbol} filled` });
}
