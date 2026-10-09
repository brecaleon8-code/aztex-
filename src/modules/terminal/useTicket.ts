import { useMarketStore } from '@/stores/useMarketStore';
import { useOrderStore } from '@/stores/useOrderStore';
import { useWalletStore } from '@/stores/useWalletStore';
import { useHoldingsValue } from '@/stores/useHoldingsValue';
import { usePositionStore, committedNotional, totalUnrealized } from '@/stores/usePositionStore';
import { positionSize, suggestedLevels } from '@/lib/trading/pnl';
import { previewFor, type OrderRequest } from '@/stores/trading';

/** Derived order-ticket values shared by the ticket and the chart's draft levels. */
export function useTicket() {
  const t = useOrderStore();
  const symbol = useMarketStore((s) => s.selected);
  const asset = useMarketStore((s) => s.assets[s.selected]);
  const balance = useWalletStore((s) => s.balance);
  const positions = usePositionStore((s) => s.positions);
  const holdingsValue = useHoldingsValue();
  const equity = balance + committedNotional(positions) + totalUnrealized(positions) + holdingsValue;

  const marketPx = t.side === 'Long' ? asset.ask : asset.bid;
  const limitPx = t.limitPrice ?? (t.side === 'Long' ? asset.bid : asset.ask);
  const entry = t.orderType === 'market' ? marketPx : limitPx;
  const suggested = suggestedLevels(t.side, entry);
  const tp = t.tp ?? suggested.tp;
  const sl = t.sl ?? suggested.sl;
  const sizingValue = t.sizingMode === 'pct' ? t.pctValue : t.usdtValue;
  const { notional, size } = positionSize(t.sizingMode, sizingValue, equity, entry);

  return { ...t, symbol, asset, entry, limitPx, tp, sl, suggested, sizingValue, notional, size, equity, balance };
}

/** The ticket as an order request, priced against the live book (re-renders on every book update). */
export function useTicketPreview() {
  const t = useTicket();
  useMarketStore((s) => s.bookVersion);
  const req: OrderRequest = {
    symbol: t.symbol,
    side: t.side,
    orderType: t.orderType,
    size: t.size,
    limitPrice: t.limitPx,
    tp: t.tp,
    sl: t.sl,
    tif: t.tif,
    postOnly: t.postOnly,
    reduceOnly: t.reduceOnly,
    bracket: t.bracket,
    maxSlippageBps: t.maxSlippageBps,
  };
  return { t, req, pv: previewFor(req) };
}
