import type { OtcQuote } from '@/types';
import { pick } from './rng';

export const OTC_DESKS = [
  { name: 'Meridian Prime', spreadBps: 4 },
  { name: 'Halcyon Liquidity', spreadBps: 6 },
  { name: 'Kestrel Markets', spreadBps: 5 },
  { name: 'Northgate OTC', spreadBps: 8 },
];

export const QUOTE_TTL_MS = 15_000;

/** Simulated RFQ: random desk, price skewed around mid by its spread plus a little noise. */
export function generateQuote(symbol: string, side: 'buy' | 'sell', amount: number, mid: number, rand: () => number = Math.random): OtcQuote {
  const desk = pick(rand, OTC_DESKS);
  const skew = ((desk.spreadBps + rand() * 4) / 10_000) * (side === 'buy' ? 1 : -1);
  const price = mid * (1 + skew);
  const now = Date.now();
  return { id: Math.random().toString(36).slice(2), desk: desk.name, symbol, side, amount, price, total: price * amount, createdAt: now, expiresAt: now + QUOTE_TTL_MS };
}
