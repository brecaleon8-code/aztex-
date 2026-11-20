import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react';
import { FlashTd, sortRows, type Column, type SortState } from '@/components/ui/DenseTable/DenseTable';
import { useMarketStore } from '@/stores/useMarketStore';
import { fmtPct, fmtPrice } from '@/lib/format';
import type { Asset } from '@/types';
import { blockCount, splitBlocks, type MonitorGroup } from './groupLayout';

const dir = (a: Asset) => (a.change24h >= 0 ? 'up' : 'down');

const COLUMNS: Column<Asset>[] = [
  { id: 'symbol', label: 'Symbol', width: 70, sort: (a) => a.symbol, render: (a) => <b className={`mg-sym ${dir(a)}`}>{a.symbol}</b> },
  { id: 'name', label: 'Name', sort: (a) => a.name, render: (a) => <span className="mg-name">{a.name}</span> },
  { id: 'last', label: 'Last', num: true, width: 96, sort: (a) => a.price, flash: (a) => a.price, render: (a) => <span className={dir(a)}>{fmtPrice(a.price)}</span> },
  { id: 'chgPct', label: 'Chg %', num: true, width: 70, sort: (a) => a.change24h, render: (a) => <span className={dir(a)}>{fmtPct(a.change24h)}</span> },
];

interface Props {
  groups: MonitorGroup[];
  collapsed: string[];
  onToggle: (groupId: string) => void;
  sort: SortState;
  onSort: (s: SortState) => void;
  current: string;
  onPick: (symbol: string) => void;
  onMenu: (symbol: string, e: MouseEvent) => void;
}

/**
 * The Monitor's grouped view: each section is a collapsible group with its average move on the
 * header line; groups flow into side-by-side blocks (each with its own header row) once the
 * window is wide enough, and back into one column when it narrows.
 */
export function MonitorGroups({ groups, collapsed, onToggle, sort, onSort, current, onPick, onMenu }: Props) {
  const assets = useMarketStore((s) => s.assets);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = blockCount(width, groups.length);
  const blocks = useMemo(() => splitBlocks(groups, n, collapsed), [groups, n, collapsed]);
  const cycle = (id: string) => onSort(sort?.id !== id ? { id, dir: 'desc' } : sort.dir === 'desc' ? { id, dir: 'asc' } : null);

  return (
    <div className="mg" ref={box} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} data-testid="monitor-groups" data-blocks={n}>
      {blocks.map((block, bi) => (
        <table className="dt mg-block" key={bi}>
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.id} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const active = sort?.id === c.id;
                return (
                  <th key={c.id} className={`dt-th ${c.num ? 'right' : 'left'} ${active ? 'sorted' : ''}`} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    <button className="dt-sort" onClick={() => cycle(c.id)}>
                      {c.label}
                      {active && (sort!.dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          {block.map((g) => {
            const rows = g.symbols.map((s) => assets[s]).filter(Boolean);
            const open = !collapsed.includes(g.id);
            const avg = rows.length ? rows.reduce((t, a) => t + a.change24h, 0) / rows.length : 0;
            return (
              <tbody key={g.id} data-testid={`mon-group-${g.id}`}>
                <tr className="mg-head">
                  <td colSpan={3}>
                    <button className="mg-toggle" onClick={() => onToggle(g.id)} aria-expanded={open} data-testid={`mon-group-toggle-${g.id}`}>
                      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <span className="mg-title">{g.name}</span>
                      <span className="mg-count">{rows.length}</span>
                    </button>
                  </td>
                  <td className="right num" title="Average 24h change of the group">
                    <span className={avg >= 0 ? 'up' : 'down'}>{fmtPct(avg)}</span>
                  </td>
                </tr>
                {open &&
                  sortRows(rows, COLUMNS, sort).map((a) => (
                    <tr
                      key={a.symbol}
                      className={`clickable ${a.symbol === current ? 'selected' : ''}`}
                      onClick={() => onPick(a.symbol)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        onMenu(a.symbol, e);
                      }}
                      data-testid={`grp-${g.id}-${a.symbol}`}
                    >
                      {COLUMNS.map((c) => {
                        const cls = `${c.num ? 'right num' : 'left'}`;
                        return c.flash ? (
                          <FlashTd key={c.id} className={cls} value={c.flash(a)}>
                            {c.render(a)}
                          </FlashTd>
                        ) : (
                          <td key={c.id} className={cls}>
                            {c.render(a)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            );
          })}
        </table>
      ))}
    </div>
  );
}
