import type { ScannerEvent, ScannerEventType } from '@/types';
import { ASSET_UNIVERSE } from './assets';
import { pick } from './rng';

const TYPES: ScannerEventType[] = ['large_transfer', 'exchange_inflow', 'exchange_outflow', 'whale_move'];
const EXCHANGES = ['Binance 14', 'Coinbase Prime', 'Kraken Cold', 'OKX 3', 'Bybit Hot'];
export const FLAG_USD = 25_000_000;

function addr(rand: () => number): string {
  let s = '0x';
  for (let i = 0; i < 40; i++) s += '0123456789abcdef'[Math.floor(rand() * 16)];
  return s;
}

export function generateScannerEvent(prices: Record<string, number>, rand: () => number = Math.random): ScannerEvent {
  const meta = pick(rand, ASSET_UNIVERSE);
  const type = pick(rand, TYPES);
  const price = prices[meta.symbol] ?? 1;
  // Heavy-tailed USD size: mostly $0.5–5M with occasional nine-figure moves.
  const usd = 500_000 * Math.exp(rand() * 3.2) * (rand() < 0.1 ? 12 : 1);
  const from = type === 'exchange_outflow' ? pick(rand, EXCHANGES) : addr(rand);
  const to = type === 'exchange_inflow' ? pick(rand, EXCHANGES) : addr(rand);
  return {
    id: Math.random().toString(36).slice(2),
    symbol: meta.symbol,
    network: pick(rand, meta.networks),
    type,
    amount: usd / price,
    usd,
    from,
    to,
    time: Date.now(),
    flagged: usd >= FLAG_USD,
    txHash: addr(rand) + addr(rand).slice(2, 26),
  };
}
