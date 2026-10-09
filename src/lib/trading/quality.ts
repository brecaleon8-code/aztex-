import type { FillRecord, OrderRecord } from '@/types';
import { slippageVs } from './execution';

export interface ExecQuality {
  orders: number;
  rejected: number;
  /** Filled qty / requested qty over orders that were accepted and are finished. */
  fillRate: number | null;
  /** Qty-weighted average slippage of fills vs each order's arrival mid, bps (positive = cost). */
  avgSlippageBps: number | null;
  /** Implementation shortfall in quote: price slippage vs arrival + fees. */
  shortfall: number;
  fees: number;
  /** Share of filled notional that added liquidity. */
  makerShare: number | null;
  notional: number;
}

/** Execution-quality roll-up from the blotter (what a TCA report summarises). */
export function executionQuality(orders: OrderRecord[], fills: FillRecord[]): ExecQuality {
  const byId = new Map(orders.map((o) => [o.id, o]));
  let qtyW = 0;
  let slipW = 0;
  let shortfall = 0;
  let fees = 0;
  let notional = 0;
  let maker = 0;
  for (const f of fills) {
    const o = byId.get(f.orderId);
    const n = f.price * f.qty;
    notional += n;
    fees += f.fee;
    if (f.liquidity === 'maker') maker += n;
    if (!o || !(o.arrivalMid > 0)) continue;
    const s = slippageVs(f.side, f.price, o.arrivalMid);
    slipW += s * f.qty;
    qtyW += f.qty;
    shortfall += (s / 10_000) * o.arrivalMid * f.qty;
  }
  shortfall += fees;
  const done = orders.filter((o) => o.status === 'filled' || o.status === 'cancelled');
  const req = done.reduce((s, o) => s + o.qty, 0);
  return {
    orders: orders.length,
    rejected: orders.filter((o) => o.status === 'rejected').length,
    fillRate: req > 0 ? done.reduce((s, o) => s + o.filledQty, 0) / req : null,
    avgSlippageBps: qtyW > 0 ? slipW / qtyW : null,
    shortfall,
    fees,
    makerShare: notional > 0 ? maker / notional : null,
    notional,
  };
}

/** Slippage of an order's average fill vs its arrival mid, bps (positive = cost). */
export const orderSlippage = (o: OrderRecord) => (o.avgPx != null && o.arrivalMid > 0 && o.filledQty > 0 ? slippageVs(o.side, o.avgPx, o.arrivalMid) : null);
