import { describe, expect, it } from 'vitest';
import { sortRows, type Column } from './DenseTable';

type R = { s: string; v: number };
const cols: Column<R>[] = [
  { id: 's', label: 'S', sort: (r) => r.s, render: (r) => r.s },
  { id: 'v', label: 'V', num: true, sort: (r) => r.v, render: (r) => r.v },
  { id: 'x', label: 'X', render: () => null },
];
const rows: R[] = [
  { s: 'b', v: 2 },
  { s: 'a', v: 2 },
  { s: 'c', v: 1 },
];

describe('dense table sorting', () => {
  it('sorts by a column either way; ties keep their order', () => {
    expect(sortRows(rows, cols, { id: 'v', dir: 'desc' }).map((r) => r.s)).toEqual(['b', 'a', 'c']);
    expect(sortRows(rows, cols, { id: 'v', dir: 'asc' }).map((r) => r.s)).toEqual(['c', 'b', 'a']);
    expect(sortRows(rows, cols, { id: 's', dir: 'asc' }).map((r) => r.s)).toEqual(['a', 'b', 'c']);
  });
  it('no sort, or a column without a sort key, leaves rows as they are', () => {
    expect(sortRows(rows, cols, null)).toBe(rows);
    expect(sortRows(rows, cols, { id: 'x', dir: 'asc' })).toBe(rows);
  });
});
