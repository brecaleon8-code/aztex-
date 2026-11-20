import type { OrderBookLevel } from '@/types';

/**
 * Groups book levels into price buckets of `step` (bids round down, asks round up, so a bucket
 * never crosses the spread), summing sizes and rebuilding the running totals.
 */
export function groupLevels(levels: OrderBookLevel[], step: number, side: 'bid' | 'ask'): OrderBookLevel[] {
  if (!(step > 0) || levels.length === 0) return levels;
  const sizes = new Map<number, number>();
  for (const l of levels) {
    const b = side === 'bid' ? Math.floor(l.price / step + 1e-9) * step : Math.ceil(l.price / step - 1e-9) * step;
    const key = Number(b.toFixed(10));
    sizes.set(key, (sizes.get(key) ?? 0) + l.size);
  }
  const prices = [...sizes.keys()].sort((a, b) => (side === 'bid' ? b - a : a - b));
  let cumulative = 0;
  return prices.map((price) => {
    const size = sizes.get(price)!;
    cumulative += size;
    return { price, size, cumulative };
  });
}

/** Grouping choices for a price: multiples of its tick size. */
export const GROUPINGS = [1, 2, 5, 10, 50, 100];
