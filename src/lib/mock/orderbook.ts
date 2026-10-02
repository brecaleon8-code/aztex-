import type { OrderBookLevel, OrderBookSnapshot } from '@/types';

export function tickSize(price: number): number {
  if (price >= 10000) return 0.5;
  if (price >= 1000) return 0.05;
  if (price >= 100) return 0.01;
  if (price >= 10) return 0.001;
  if (price >= 1) return 0.0001;
  return 0.00001;
}

function withCumulative(levels: { price: number; size: number }[]): OrderBookLevel[] {
  let cum = 0;
  return levels.map((l) => ({ ...l, cumulative: (cum += l.size) }));
}

/** DOM-style L2 snapshot around a mid price. Best levels first on both sides. */
export function generateOrderBook(mid: number, spreadFrac: number, depth = 14, rand: () => number = Math.random): OrderBookSnapshot {
  const tick = tickSize(mid);
  const half = Math.max(tick, (mid * spreadFrac) / 2);
  const bestBid = Math.floor((mid - half) / tick) * tick;
  const bestAsk = Math.max(bestBid + tick, Math.ceil((mid + half) / tick) * tick);
  const unit = 25_000 / mid; // ~$25k typical level
  const gap = Math.max(1, Math.round((mid * 0.00012) / tick));
  const mk = (best: number, dir: 1 | -1) =>
    withCumulative(
      Array.from({ length: depth }, (_, i) => ({
        price: +(best + dir * i * gap * tick).toFixed(8),
        size: unit * (0.25 + rand() * 1.6) * (1 + i * 0.12) * (rand() < 0.08 ? 3.5 : 1),
      })),
    );
  return { bids: mk(bestBid, -1), asks: mk(bestAsk, 1), time: Date.now() };
}

/** Bid/ask imbalance in [-1, 1]; positive = more resting bid size. */
export function imbalance(book: OrderBookSnapshot): number {
  const b = book.bids.reduce((s, l) => s + l.size, 0);
  const a = book.asks.reduce((s, l) => s + l.size, 0);
  return a + b === 0 ? 0 : (b - a) / (a + b);
}

/**
 * Book with memory: resting size per price persists between snapshots and drifts, with
 * occasional walls added or pulled — so a liquidity heatmap shows structure, not noise.
 */
export function evolveBook(mid: number, spreadFrac: number, memory: Map<number, number>, depth = 14, rand: () => number = Math.random): OrderBookSnapshot {
  const fresh = generateOrderBook(mid, spreadFrac, depth, rand);
  const unit = 25_000 / mid;
  const evolve = (levels: OrderBookLevel[]) =>
    withCumulative(
      levels.map((l) => {
        const key = Math.round(l.price * 1e8);
        let size = memory.get(key) ?? l.size;
        size *= Math.exp((rand() - 0.5) * 0.3);
        if (rand() < 0.015) size += unit * (3 + rand() * 6); // wall appears
        if (rand() < 0.02) size *= 0.25; // wall pulled
        size = Math.max(unit * 0.05, Math.min(unit * 14, size));
        memory.set(key, size);
        return { price: l.price, size };
      }),
    );
  if (memory.size > 4000) memory.clear();
  return { bids: evolve(fresh.bids), asks: evolve(fresh.asks), time: fresh.time };
}
