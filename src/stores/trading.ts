/**
 * Trading actions that span stores (positions, wallet, toasts). The mock fills at the current
 * price; a real build routes these through a venue order API and reflects fills from its stream.
 */
import type { Position, Side, WorkingOrder } from '@/types';
import { fmtPrice, fmtQty, fmtSigned, uid } from '@/lib/format';
import { unrealizedPnl } from '@/lib/trading/pnl';
import { useMarketStore } from './useMarketStore';
import { usePositionStore } from './usePositionStore';
import { useWalletStore } from './useWalletStore';
import { toast } from './useToastStore';

export const CLOSE_ANIM_MS = 320;

export interface OrderRequest {
  symbol: string;
  side: Side;
  orderType: 'market' | 'limit';
  size: number;
  limitPrice?: number;
  tp: number;
  sl: number;
}

export type OrderResult = { ok: true; id: string } | { ok: false; error: string };

function sideWord(side: Side) {
  return side === 'Long' ? 'Buy' : 'Sell';
}

function openPosition(req: Omit<OrderRequest, 'limitPrice'>, entry: number): OrderResult {
  if (!useWalletStore.getState().reserve(entry * req.size)) return { ok: false, error: 'Insufficient balance' };
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
  };
  usePositionStore.getState().add(p);
  return { ok: true, id: p.id };
}

export function placeOrder(req: OrderRequest): OrderResult {
  if (!(req.size > 0)) return { ok: false, error: 'Size must be greater than zero' };
  const asset = useMarketStore.getState().assets[req.symbol];
  if (!asset) return { ok: false, error: `Unknown symbol ${req.symbol}` };
  const fillPx = req.side === 'Long' ? asset.ask : asset.bid;

  if (req.orderType === 'market') {
    const r = openPosition(req, fillPx);
    if (r.ok) toast({ kind: 'success', title: `${sideWord(req.side)} market order placed`, detail: `${fmtQty(req.size)} ${req.symbol} @ ${fmtPrice(fillPx)}` });
    else toast({ kind: 'error', title: 'Order rejected', detail: r.error });
    return r;
  }

  const lp = req.limitPrice;
  if (lp == null || !(lp > 0)) return { ok: false, error: 'Enter a limit price' };
  // Marketable limit: fills immediately at the limit (or better).
  const marketable = req.side === 'Long' ? lp >= asset.ask : lp <= asset.bid;
  if (marketable) {
    const r = openPosition(req, req.side === 'Long' ? Math.min(lp, asset.ask) : Math.max(lp, asset.bid));
    if (r.ok) toast({ kind: 'success', title: `${sideWord(req.side)} limit order filled`, detail: `${fmtQty(req.size)} ${req.symbol} @ ${fmtPrice(lp)}` });
    else toast({ kind: 'error', title: 'Order rejected', detail: r.error });
    return r;
  }
  if (lp * req.size > useWalletStore.getState().balance + 1e-9) {
    toast({ kind: 'error', title: 'Order rejected', detail: 'Insufficient balance' });
    return { ok: false, error: 'Insufficient balance' };
  }
  const o: WorkingOrder = { id: uid('ord_'), symbol: req.symbol, side: req.side, size: req.size, limitPrice: lp, tp: req.tp, sl: req.sl, createdAt: Date.now() };
  usePositionStore.getState().addWorking(o);
  toast({ kind: 'success', title: `${sideWord(req.side)} limit order placed`, detail: `${fmtQty(req.size)} ${req.symbol} @ ${fmtPrice(lp)}` });
  return { ok: true, id: o.id };
}

export function cancelWorkingOrder(id: string) {
  const o = usePositionStore.getState().removeWorking(id);
  if (o) toast({ kind: 'info', title: 'Order cancelled', detail: `${sideWord(o.side)} ${fmtQty(o.size)} ${o.symbol} @ ${fmtPrice(o.limitPrice)}` });
}

function settle(p: Position, price: number): number {
  const pnl = unrealizedPnl(p.side, p.entry, price, p.size);
  useWalletStore.getState().settle(p.entry * p.size + pnl);
  usePositionStore.getState().addRealized(pnl);
  return pnl;
}

/** Close one position: fade/shrink, then remove and settle P/L into the wallet. */
export function closePosition(id: string): Promise<void> {
  const store = usePositionStore.getState();
  const p = store.positions.find((x) => x.id === id);
  if (!p || store.closing[id]) return Promise.resolve();
  store.markClosing(id);
  return new Promise((resolve) =>
    setTimeout(() => {
      const live = usePositionStore.getState().remove(id);
      if (live) {
        const asset = useMarketStore.getState().assets[live.symbol];
        const px = asset ? (live.side === 'Long' ? asset.bid : asset.ask) : live.current;
        const pnl = settle(live, px);
        toast({ kind: pnl >= 0 ? 'success' : 'info', title: `Closed ${live.side.toLowerCase()} ${live.symbol}`, detail: `${fmtQty(live.size)} @ ${fmtPrice(px)} · P/L ${fmtSigned(pnl)} USDT` });
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
        const live = usePositionStore.getState().remove(p.id);
        if (!live) continue;
        const a = assets[live.symbol];
        total += settle(live, a ? (live.side === 'Long' ? a.bid : a.ask) : live.current);
      }
      toast({ kind: total >= 0 ? 'success' : 'info', title: `Flattened ${open.length} position${open.length > 1 ? 's' : ''}`, detail: `Realized P/L ${fmtSigned(total)} USDT` });
      resolve(open.length);
    }, CLOSE_ANIM_MS),
  );
}

/** Called on every ticker batch: mark positions, fill resting limits, announce TP/SL hits. */
export function onPrices() {
  const assets = useMarketStore.getState().assets;
  const prices = Object.fromEntries(Object.values(assets).map((a) => [a.symbol, a.price]));
  const ps = usePositionStore.getState();
  for (const o of ps.workingOrders) {
    const a = assets[o.symbol];
    if (!a) continue;
    if (o.side === 'Long' ? a.ask <= o.limitPrice : a.bid >= o.limitPrice) {
      ps.removeWorking(o.id);
      const r = openPosition({ symbol: o.symbol, side: o.side, orderType: 'limit', size: o.size, tp: o.tp, sl: o.sl }, o.limitPrice);
      toast(r.ok ? { kind: 'success', title: `Limit order filled`, detail: `${sideWord(o.side)} ${fmtQty(o.size)} ${o.symbol} @ ${fmtPrice(o.limitPrice)}` } : { kind: 'error', title: 'Limit fill rejected', detail: r.error });
    }
  }
  const { tp, sl } = usePositionStore.getState().markToMarket(prices);
  tp.forEach((p) => toast({ kind: 'success', title: `TP reached · ${p.side} ${p.symbol}`, detail: `${fmtPrice(p.tp)} · P/L ${fmtSigned(p.pnl)} USDT` }));
  sl.forEach((p) => toast({ kind: 'error', title: `SL reached · ${p.side} ${p.symbol}`, detail: `${fmtPrice(p.sl)} · P/L ${fmtSigned(p.pnl)} USDT` }));
}
