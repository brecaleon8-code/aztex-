import { useMarketStore } from './useMarketStore';
import { useWalletStore } from './useWalletStore';

/** Stablecoins held outside the USDT trading balance are valued at par. */
export const STABLES = new Set(['USDT', 'USDC']);

export function priceOf(symbol: string, assets: Record<string, { price: number }>): number {
  return STABLES.has(symbol) ? 1 : (assets[symbol]?.price ?? 0);
}

/** USD value of non-USDT crypto holdings (from deposits), marked to the live price. */
export function useHoldingsValue(): number {
  const holdings = useWalletStore((s) => s.holdings);
  const assets = useMarketStore((s) => s.assets);
  return Object.entries(holdings).reduce((sum, [sym, qty]) => sum + qty * priceOf(sym, assets), 0);
}
