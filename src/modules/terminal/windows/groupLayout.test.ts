import { describe, expect, it } from 'vitest';
import { blockCount, splitBlocks, type MonitorGroup } from './groupLayout';

const g = (id: string, n: number): MonitorGroup => ({ id, name: id, symbols: Array.from({ length: n }, (_, i) => `${id}${i}`) });

describe('grouped monitor blocks', () => {
  it('fits as many blocks as the width allows, one per group at most', () => {
    expect(blockCount(200, 4)).toBe(1);
    expect(blockCount(700, 4)).toBe(2);
    expect(blockCount(2000, 3)).toBe(3);
  });

  it('keeps groups in order and whole, balancing rows', () => {
    const groups = [g('a', 6), g('b', 4), g('c', 6), g('d', 4)];
    const blocks = splitBlocks(groups, 2);
    expect(blocks.map((b) => b.map((x) => x.id))).toEqual([['a', 'b'], ['c', 'd']]);
    expect(splitBlocks(groups, 1)).toEqual([groups]);
  });

  it('counts a collapsed group as its header only', () => {
    const groups = [g('a', 10), g('b', 2), g('c', 2), g('d', 2)];
    expect(splitBlocks(groups, 2).map((b) => b.map((x) => x.id))).toEqual([['a'], ['b', 'c', 'd']]);
    expect(splitBlocks(groups, 2, ['a']).map((b) => b.map((x) => x.id))).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('never leaves a block empty when there are enough groups', () => {
    const blocks = splitBlocks([g('a', 1), g('b', 1), g('c', 20)], 3);
    expect(blocks).toHaveLength(3);
    expect(blocks.every((b) => b.length > 0)).toBe(true);
  });
});
