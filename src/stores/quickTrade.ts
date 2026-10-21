/**
 * One-click trading from the chart (right-click menu and Alt+Shift+B / Alt+Shift+S): the order goes
 * in at the clicked price, sized like the ticket, with the ticket's TP/SL offsets and bracket choice.
 */
import type { Side } from '@/types';
import { positionSize, suggestedLevels } from '@/lib/trading/pnl';
import { placeOrder, placeStopOrder, type OrderResult } from './trading';
import { useMarketStore } from './useMarketStore';
import { useOrderStore } from './useOrderStore';
import { useWalletStore } from './useWalletStore';
import { usePositionStore, committedNotional, totalUnrealized } from './usePositionStore';
import { priceOf } from './useHoldingsValue';
import { tickSize } from '@/lib/mock/orderbook';
import { usePriceAlertStore } from './usePriceAlertStore';
import { toast } from './useToastStore';
import { fmtPrice } from '@/lib/format';

/** A chart price snapped to the venue's tick (so orders and alerts sit on real price levels). */
export function onTick(price: number): number {
  const t = tickSize(price);
  const dp = Math.max(0, Math.ceil(-Math.log10(t)));
  return Number((Math.round(price / t) * t).toFixed(dp));
}

/** Alt+A / right-click › Add alert: notify when `symbol` reaches `price`. */
export function alertAt(symbol: string, price: number) {
  const last = useMarketStore.getState().assets[symbol]?.price;
  if (last == null) return null;
  const a = usePriceAlertStore.getState().add(symbol, onTick(price), last);
  toast({ kind: 'success', title: `Alert set · ${symbol} ${a.direction === 'above' ? '≥' : '≤'} ${fmtPrice(a.price)}`, detail: 'You will be notified once, on any page.' });
  return a;
}

export type QuickKind = 'limit' | 'stop';

/** Below the market you buy on a limit and sell on a stop; above it, the reverse (as on TradingView). */
export function quickKinds(price: number, last: number): Record<'buy' | 'sell', QuickKind> {
  return price <= last ? { buy: 'limit', sell: 'stop' } : { buy: 'stop', sell: 'limit' };
}

/** The ticket's size (its % of equity or USDT amount) at `price`. */
export function ticketSizeAt(price: number): number {
  const t = useOrderStore.getState();
  const { balance, holdings } = useWalletStore.getState();
  const { positions } = usePositionStore.getState();
  const assets = useMarketStore.getState().assets;
  const holdingsValue = Object.entries(holdings).reduce((s, [sym, q]) => s + q * priceOf(sym, assets), 0);
  const equity = balance + committedNotional(positions) + totalUnrealized(positions) + holdingsValue;
  return positionSize(t.sizingMode, t.sizingMode === 'pct' ? t.pctValue : t.usdtValue, equity, price).size;
}

export function quickOrder(symbol: string, side: Side, price: number): OrderResult {
  const last = useMarketStore.getState().assets[symbol]?.price;
  if (last == null) return { ok: false, error: `Unknown symbol ${symbol}` };
  const kind = quickKinds(price, last)[side === 'Long' ? 'buy' : 'sell'];
  const size = ticketSizeAt(price);
  const { tp, sl } = suggestedLevels(side, price);
  const bracket = useOrderStore.getState().bracket;
  return kind === 'limit'
    ? placeOrder({ symbol, side, orderType: 'limit', size, limitPrice: price, tp, sl, tif: 'GTC', bracket, source: 'chart' })
    : placeStopOrder({ symbol, side, size, triggerPrice: price, tp, sl, bracket, source: 'chart' });
}

/** Shift+T: load the ticket with a limit order at `price` on that symbol. */
export function ticketAt(symbol: string, price: number) {
  const m = useMarketStore.getState();
  if (m.selected !== symbol) m.select(symbol);
  useOrderStore.getState().limitFromBook(price);
}
