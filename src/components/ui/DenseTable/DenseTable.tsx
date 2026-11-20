import { useEffect, useRef, useState, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import './dense-table.css';

export interface Column<R> {
  id: string;
  label: ReactNode;
  /** Numbers: right-aligned, monospace, tabular figures. */
  num?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Default width in px (the user can drag it wider or narrower). */
  width?: number;
  minWidth?: number;
  /** Present = sortable by this value. */
  sort?: (r: R) => number | string;
  /** Present = the cell flashes green / red for 300ms when this value changes. */
  flash?: (r: R) => number;
  title?: string;
  render: (r: R) => ReactNode;
}

export type SortState = { id: string; dir: 'asc' | 'desc' } | null;

export interface DenseTableProps<R> {
  columns: Column<R>[];
  rows: R[];
  rowKey: (r: R) => string;
  /** Controlled sort (e.g. persisted per window); uncontrolled when omitted. */
  sort?: SortState;
  onSort?: (s: SortState) => void;
  widths?: Record<string, number>;
  onWidths?: (w: Record<string, number>) => void;
  onRowClick?: (r: R, e: MouseEvent) => void;
  onRowContextMenu?: (r: R, e: MouseEvent) => void;
  rowClass?: (r: R) => string;
  rowProps?: (r: R) => HTMLAttributes<HTMLTableRowElement> & { [k: `data-${string}`]: string | undefined };
  empty?: ReactNode;
  testId?: string;
  className?: string;
}

/** Sorts rows by a column's sort value; ties keep their order. Exported for tests. */
export function sortRows<R>(rows: R[], columns: Column<R>[], sort: SortState): R[] {
  const col = sort && columns.find((c) => c.id === sort.id && c.sort);
  if (!col || !col.sort) return rows;
  const key = col.sort;
  const dir = sort!.dir === 'asc' ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, k: key(r) }))
    .sort((a, b) => (a.k < b.k ? -dir : a.k > b.k ? dir : a.i - b.i))
    .map((x) => x.r);
}

/**
 * The one dense table: sticky header, 24px rows, right-aligned monospace numbers, hairline row
 * dividers (no zebra), hover highlight, click-to-sort headers (asc → desc → off) and drag-to-resize
 * columns. Used by the Monitor and the Blotter.
 */
export function DenseTable<R>({ columns, rows, rowKey, sort, onSort, widths, onWidths, onRowClick, onRowContextMenu, rowClass, rowProps, empty, testId, className = '' }: DenseTableProps<R>) {
  const [ownSort, setOwnSort] = useState<SortState>(null);
  const [ownWidths, setOwnWidths] = useState<Record<string, number>>({});
  const s = sort !== undefined ? sort : ownSort;
  const w = widths ?? ownWidths;
  const setSort = (next: SortState) => (onSort ? onSort(next) : setOwnSort(next));
  const setWidth = (id: string, px: number) => {
    const next = { ...w, [id]: px };
    if (onWidths) onWidths(next);
    else setOwnWidths(next);
  };
  const cycle = (id: string) => setSort(s?.id !== id ? { id, dir: 'desc' } : s.dir === 'desc' ? { id, dir: 'asc' } : null);
  const shown = sortRows(rows, columns, s);
  return (
    <div className={`dt-wrap ${className}`} data-testid={testId}>
      <table className="dt">
        <colgroup>
          {columns.map((c) => (
            <col key={c.id} style={{ width: w[c.id] ?? c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = s?.id === c.id;
              const align = c.align ?? (c.num ? 'right' : 'left');
              return (
                <th key={c.id} className={`dt-th ${align} ${c.sort ? 'sortable' : ''} ${active ? 'sorted' : ''}`} title={c.title} aria-sort={active ? (s!.dir === 'asc' ? 'ascending' : 'descending') : undefined} data-col={c.id}>
                  {c.sort ? (
                    <button className="dt-sort" onClick={() => cycle(c.id)} data-testid={`sort-${c.id}`}>
                      {c.label}
                      {active && (s!.dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                    </button>
                  ) : (
                    <span className="dt-label">{c.label}</span>
                  )}
                  <Resizer onResize={(dx, start) => setWidth(c.id, Math.max(c.minWidth ?? 40, Math.round(start + dx)))} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr
              key={rowKey(r)}
              className={`${onRowClick ? 'clickable' : ''} ${rowClass?.(r) ?? ''}`}
              onClick={onRowClick ? (e) => onRowClick(r, e) : undefined}
              onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(r, e) : undefined}
              {...rowProps?.(r)}
            >
              {columns.map((c) => {
                const align = c.align ?? (c.num ? 'right' : 'left');
                const cls = `${align} ${c.num ? 'num' : ''}`;
                return c.flash ? (
                  <FlashTd key={c.id} className={cls} value={c.flash(r)}>
                    {c.render(r)}
                  </FlashTd>
                ) : (
                  <td key={c.id} className={cls}>
                    {c.render(r)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && empty && <div className="dt-empty">{empty}</div>}
    </div>
  );
}

/** A cell that flashes green (up) or red (down) for 300ms when its value changes. */
function FlashTd({ value, className, children }: { value: number; className: string; children: ReactNode }) {
  const prev = useRef(value);
  const [f, setF] = useState<{ dir: '' | 'up' | 'down'; n: number }>({ dir: '', n: 0 });
  useEffect(() => {
    if (value === prev.current) return;
    const dir = value > prev.current ? 'up' : 'down';
    prev.current = value;
    setF((x) => ({ dir, n: x.n + 1 }));
  }, [value]);
  return (
    <td className={`${className} ${f.dir ? `dt-flash-${f.dir}` : ''}`} key={f.n} data-flash={f.dir || undefined}>
      {children}
    </td>
  );
}

function Resizer({ onResize }: { onResize: (dx: number, start: number) => void }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  return (
    <span
      className="dt-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const th = e.currentTarget.parentElement!;
        drag.current = { x: e.clientX, w: th.getBoundingClientRect().width };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => drag.current && onResize(e.clientX - drag.current.x, drag.current.w)}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
