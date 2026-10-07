import { useMarketStore } from '@/stores/useMarketStore';
import { useOrderStore } from '@/stores/useOrderStore';
import { useWalletStore } from '@/stores/useWalletStore';
import { useHoldingsValue } from '@/stores/useHoldingsValue';
import { usePositionStore, committedNotional, totalUnrealized } from '@/stores/usePositionStore';
import { positionSize, suggestedLevels } from '@/lib/trading/pnl';

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
