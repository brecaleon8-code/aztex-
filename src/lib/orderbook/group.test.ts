import { describe, expect, it } from 'vitest';
import { groupLevels } from './group';

const lv = (ps: [number, number][]) => {
  let c = 0;
  return ps.map(([price, size]) => ({ price, size, cumulative: (c += size) }));
};

describe('order book grouping', () => {
  it('bids round down into buckets, best first, with running totals', () => {
    const g = groupLevels(lv([[100.4, 1], [100.1, 2], [99.9, 3], [99.2, 4]]), 0.5, 'bid');
    expect(g).toEqual([
      { price: 100, size: 3, cumulative: 3 },
      { price: 99.5, size: 3, cumulative: 6 },
      { price: 99, size: 4, cumulative: 10 },
    ]);
  });
  it('asks round up, so no bucket crosses the spread', () => {
    const g = groupLevels(lv([[100.6, 1], [100.9, 2], [101.2, 3]]), 0.5, 'ask');
    expect(g.map((l) => [l.price, l.size])).toEqual([
      [101, 3],
      [101.5, 3],
    ]);
  });
  it('step of the tick (or none) leaves the book unchanged', () => {
    const book = lv([[1, 1]]);
    expect(groupLevels(book, 0, 'bid')).toBe(book);
    expect(groupLevels([], 1, 'ask')).toEqual([]);
  });
});
