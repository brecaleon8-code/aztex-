import type { AssetMeta } from '@/types';

/** The 12-asset mock universe (spec §4). */
export const ASSET_UNIVERSE: AssetMeta[] = [
  { symbol: 'BTC', name: 'Bitcoin', supply: 19_760_000, networks: ['Bitcoin'] },
  { symbol: 'ETH', name: 'Ethereum', supply: 120_200_000, networks: ['Ethereum', 'Arbitrum', 'Base'] },
  { symbol: 'SOL', name: 'Solana', supply: 468_000_000, networks: ['Solana'] },
  { symbol: 'XRP', name: 'XRP', supply: 56_400_000_000, networks: ['XRP Ledger'] },
  { symbol: 'DOGE', name: 'Dogecoin', supply: 146_000_000_000, networks: ['Dogecoin'] },
  { symbol: 'AVAX', name: 'Avalanche', supply: 406_000_000, networks: ['Avalanche C'] },
  { symbol: 'LINK', name: 'Chainlink', supply: 627_000_000, networks: ['Ethereum', 'Arbitrum'] },
  { symbol: 'ADA', name: 'Cardano', supply: 35_800_000_000, networks: ['Cardano'] },
  { symbol: 'MATIC', name: 'Polygon', supply: 9_900_000_000, networks: ['Polygon PoS', 'Ethereum'] },
  { symbol: 'DOT', name: 'Polkadot', supply: 1_520_000_000, networks: ['Polkadot'] },
  { symbol: 'LTC', name: 'Litecoin', supply: 75_000_000, networks: ['Litecoin'] },
  { symbol: 'ATOM', name: 'Cosmos', supply: 391_000_000, networks: ['Cosmos Hub'] },
];

/** Reference prices for the mock market (USDT). */
export const BASE_PRICES: Record<string, number> = {
  BTC: 62480,
  ETH: 3120,
  SOL: 148.2,
  XRP: 0.5821,
  DOGE: 0.1243,
  AVAX: 28.64,
  LINK: 14.37,
  ADA: 0.4512,
  MATIC: 0.5634,
  DOT: 6.284,
  LTC: 71.42,
  ATOM: 7.912,
};

/** Annualised-ish volatility hint per asset, scaled into per-tick moves by the generators. */
export const VOL: Record<string, number> = {
  BTC: 0.55, ETH: 0.65, SOL: 0.9, XRP: 0.8, DOGE: 1.1, AVAX: 0.95,
  LINK: 0.9, ADA: 0.85, MATIC: 0.95, DOT: 0.85, LTC: 0.7, ATOM: 0.9,
};

/** Relative spread (fraction of price). */
export const SPREAD: Record<string, number> = {
  BTC: 0.00008, ETH: 0.0001, SOL: 0.00018, XRP: 0.0002, DOGE: 0.00025, AVAX: 0.00025,
  LINK: 0.0003, ADA: 0.0003, MATIC: 0.0003, DOT: 0.0003, LTC: 0.00022, ATOM: 0.0003,
};

export const DEFAULT_WATCHLIST = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX'];

export function assetMeta(symbol: string): AssetMeta | undefined {
  return ASSET_UNIVERSE.find((a) => a.symbol === symbol);
}
