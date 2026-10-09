import type { NetworkId, TokenRef } from './types';
import { NETWORK } from './networks';

/**
 * Well-known tokens with their real contract / mint addresses. Metadata (name, symbol, decimals,
 * address) is factual; supply / holder figures in Simulated mode are not.
 */
export const TOKENS: TokenRef[] = [
  { network: 'ethereum', symbol: 'USDT', name: 'Tether USD', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, priceSymbol: 'USD' },
  { network: 'ethereum', symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, priceSymbol: 'USD' },
  { network: 'ethereum', symbol: 'DAI', name: 'Dai Stablecoin', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, priceSymbol: 'USD' },
  { network: 'ethereum', symbol: 'WETH', name: 'Wrapped Ether', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, priceSymbol: 'ETH' },
  { network: 'ethereum', symbol: 'WBTC', name: 'Wrapped BTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, priceSymbol: 'BTC' },
  { network: 'ethereum', symbol: 'LINK', name: 'ChainLink Token', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, priceSymbol: 'LINK' },
  { network: 'ethereum', symbol: 'UNI', name: 'Uniswap', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18, priceSymbol: null },
  { network: 'ethereum', symbol: 'PEPE', name: 'Pepe', address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', decimals: 18, priceSymbol: null },
  { network: 'ethereum', symbol: 'SHIB', name: 'SHIBA INU', address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', decimals: 18, priceSymbol: null },
  { network: 'arbitrum', symbol: 'USDC', name: 'USD Coin', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, priceSymbol: 'USD' },
  { network: 'arbitrum', symbol: 'ARB', name: 'Arbitrum', address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18, priceSymbol: null },
  { network: 'base', symbol: 'USDC', name: 'USD Coin', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, priceSymbol: 'USD' },
  { network: 'polygon', symbol: 'USDT', name: '(PoS) Tether USD', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, priceSymbol: 'USD' },
  { network: 'polygon', symbol: 'USDC', name: 'USD Coin', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, priceSymbol: 'USD' },
  { network: 'bnb', symbol: 'USDT', name: 'Binance-Peg BSC-USD', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, priceSymbol: 'USD' },
  { network: 'solana', symbol: 'USDC', name: 'USD Coin', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, priceSymbol: 'USD' },
  { network: 'solana', symbol: 'USDT', name: 'Tether USD', address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, priceSymbol: 'USD' },
  { network: 'solana', symbol: 'BONK', name: 'Bonk', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5, priceSymbol: null },
  { network: 'tron', symbol: 'USDT', name: 'Tether USD', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6, priceSymbol: 'USD' },
];

/** The chain's native asset as a token reference. */
export function nativeToken(network: NetworkId): TokenRef {
  const n = NETWORK[network];
  const priceSymbol = n.native === 'POL' ? 'MATIC' : n.native === 'TRX' ? null : n.native;
  return { network, symbol: n.native, name: n.name === 'Bitcoin' ? 'Bitcoin' : n.native, address: '', decimals: n.nativeDecimals, priceSymbol };
}

export function findToken(network: NetworkId, address: string): TokenRef | undefined {
  const a = address.toLowerCase();
  return TOKENS.find((t) => t.network === network && t.address.toLowerCase() === a);
}

/** Token search by symbol or name across networks (exact symbol first). */
export function searchTokens(q: string, network?: NetworkId | null): TokenRef[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const pool = network ? TOKENS.filter((t) => t.network === network) : TOKENS;
  const exact = pool.filter((t) => t.symbol.toLowerCase() === s);
  const partial = pool.filter((t) => !exact.includes(t) && (t.symbol.toLowerCase().includes(s) || t.name.toLowerCase().includes(s)));
  return [...exact, ...partial];
}

/** USD price for a token from market prices (stablecoins = 1, unknown = null). */
export function usdPrice(t: TokenRef, prices: Record<string, number>): number | null {
  if (t.priceSymbol === 'USD') return 1;
  if (!t.priceSymbol) return null;
  return prices[t.priceSymbol] ?? null;
}
