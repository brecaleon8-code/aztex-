import { useMemo, useState } from 'react';
import { Check, Columns3, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import { DenseTable, type Column, type SortState } from '@/components/ui/DenseTable/DenseTable';
import { Sparkline } from '@/components/ui/Sparkline';
import { useMarketStore } from '@/stores/useMarketStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { MAIN_LIST, useMonitorStore } from '@/stores/useMonitorStore';
import { alertAt } from '@/stores/quickTrade';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { fmtCompact, fmtPct, fmtPrice, fmtSigned } from '@/lib/format';
import type { Asset } from '@/types';
import { useWindowSettings, useWindowSymbol, useSetWindowSymbol } from '@/workspace/WindowContext';
import { useWorkspaceStore } from '@/workspace/useWorkspaceStore';
import { PopMenu } from '@/workspace/PopMenu';
import { useSpark } from '../useSpark';

type Settings = { list: string; columns: string[]; sort: SortState; widths: Record<string, number> };

const COLUMN_IDS = ['symbol', 'last', 'chg', 'chgPct', 'bid', 'ask', 'spread', 'vol', 'spark'] as const;
type ColId = (typeof COLUMN_IDS)[number];
const LABELS: Record<ColId, string> = { symbol: 'Symbol', last: 'Last', chg: 'Chg', chgPct: 'Chg %', bid: 'Bid', ask: 'Ask', spread: 'Spread', vol: '24h Vol', spark: '24h' };
const DEFAULT_COLUMNS: ColId[] = [...COLUMN_IDS];

/** Absolute 24h change from the % change. */
const chgAbs = (a: Asset) => a.price - a.price / (1 + a.change24h / 100);

/**
 * Monitor: the watchlist as a columnar table. Sortable headers, a column picker, 24px rows,
 * prices flash on change, tabs for named lists. Clicking a row loads that symbol into every
 * window in the same link group.
 */
export function MonitorWindow() {
  const [settings, patch] = useWindowSettings<Settings>();
  const listId = settings.list ?? MAIN_LIST;
  const main = useMarketStore((s) => s.watchlist);
  const lists = useMonitorStore((s) => s.lists);
  const custom = lists.find((l) => l.id === listId);
  const symbols = listId === MAIN_LIST || !custom ? main : custom.symbols;
  const assets = useMarketStore((s) => s.assets);
  const current = useWindowSymbol();
  const setSymbol = useSetWindowSymbol();
  const colors = useThemeStore((s) => s.colors);
  const shownCols = (settings.columns as ColId[] | undefined) ?? DEFAULT_COLUMNS;
  const [menu, setMenu] = useState<{ el: HTMLElement; symbol: string } | null>(null);

  const remove = (sym: string) => (listId === MAIN_LIST || !custom ? useMarketStore.getState().removeWatch(sym) : useMonitorStore.getState().remove(listId, sym));
  const add = (sym: string) => (listId === MAIN_LIST || !custom ? useMarketStore.getState().addWatch(sym) : useMonitorStore.getState().add(listId, sym));

  const columns = useMemo<Column<Asset>[]>(() => {
    const all: Record<ColId, Column<Asset>> = {
      symbol: {
        id: 'symbol',
        label: LABELS.symbol,
        width: 92,
        sort: (a) => a.symbol,
        render: (a) => (
          <span className="mon-sym" title={a.name}>
            <b>{a.symbol}</b>
            <button
              className="mon-more"
              aria-label={`${a.symbol} actions`}
              onClick={(e) => {
                e.stopPropagation();
                setMenu({ el: e.currentTarget, symbol: a.symbol });
              }}
              data-testid={`mon-more-${a.symbol}`}
            >
              <MoreHorizontal size={12} />
            </button>
          </span>
        ),
      },
      last: { id: 'last', label: LABELS.last, num: true, width: 92, sort: (a) => a.price, flash: (a) => a.price, render: (a) => fmtPrice(a.price) },
      chg: { id: 'chg', label: LABELS.chg, num: true, width: 88, sort: chgAbs, render: (a) => <span className={a.change24h >= 0 ? 'up' : 'down'}>{fmtSigned(chgAbs(a), Math.min(4, Math.max(2, decimalsOf(a.price))))}</span> },
      chgPct: { id: 'chgPct', label: LABELS.chgPct, num: true, width: 68, sort: (a) => a.change24h, render: (a) => <span className={a.change24h >= 0 ? 'up' : 'down'}>{fmtPct(a.change24h)}</span> },
      bid: { id: 'bid', label: LABELS.bid, num: true, width: 92, sort: (a) => a.bid, flash: (a) => a.bid, render: (a) => fmtPrice(a.bid) },
      ask: { id: 'ask', label: LABELS.ask, num: true, width: 92, sort: (a) => a.ask, flash: (a) => a.ask, render: (a) => fmtPrice(a.ask) },
      spread: { id: 'spread', label: LABELS.spread, num: true, width: 70, sort: (a) => (a.ask - a.bid) / a.price, title: 'Ask − bid', render: (a) => fmtPrice(a.ask - a.bid) },
      vol: { id: 'vol', label: LABELS.vol, num: true, width: 76, sort: (a) => a.volume24h, render: (a) => `$${fmtCompact(a.volume24h)}` },
      spark: { id: 'spark', label: LABELS.spark, width: 70, align: 'center', render: (a) => <Spark symbol={a.symbol} up={colors.profit} down={colors.loss} /> },
    };
    return COLUMN_IDS.filter((id) => shownCols.includes(id)).map((id) => all[id]);
  }, [shownCols, colors]);

  const rows = symbols.map((s) => assets[s]).filter(Boolean);
  return (
    <div className="mon" data-testid="watchlist">
      <ListTabs listId={listId} onPick={(id) => patch({ list: id })} />
      <div className="mon-bar">
        <AddSymbol have={symbols} onAdd={add} />
        <span className="spacer" />
        <ColumnPicker shown={shownCols} onChange={(c) => patch({ columns: c })} />
      </div>
      <DenseTable
        columns={columns}
        rows={rows}
        rowKey={(a) => a.symbol}
        sort={settings.sort ?? null}
        onSort={(s) => patch({ sort: s })}
        widths={settings.widths}
        onWidths={(w) => patch({ widths: w })}
        onRowClick={(a) => setSymbol(a.symbol)}
        onRowContextMenu={(a, e) => {
          e.preventDefault();
          setMenu({ el: e.currentTarget as HTMLElement, symbol: a.symbol });
        }}
        rowClass={(a) => (a.symbol === current ? 'selected' : '')}
        rowProps={(a) => ({ 'data-testid': `watch-${a.symbol}` })}
        empty="No symbols in this list. Search above to add one."
        testId="monitor-table"
      />
      {menu && (
        <PopMenu anchor={menu.el} onClose={() => setMenu(null)} width={210} testId="mon-row-menu">
          <div className="menu-group">{menu.symbol}</div>
          <button
            className="menu-item"
            onClick={() => {
              setSymbol(menu.symbol);
              setMenu(null);
            }}
          >
            Load in linked windows
          </button>
          <button
            className="menu-item"
            onClick={() => {
              useWorkspaceStore.getState().addWindow('chart', { linkGroup: null, settings: { symbol: menu.symbol, tf: useMarketStore.getState().timeframe } });
              setMenu(null);
            }}
          >
            Open in a new chart window
          </button>
          <button
            className="menu-item"
            onClick={() => {
              const a = useMarketStore.getState().assets[menu.symbol];
              if (a) alertAt(menu.symbol, a.price);
              setMenu(null);
            }}
          >
            Alert at the last price
          </button>
          <div className="divider" />
          <button
            className="menu-item danger"
            onClick={() => {
              remove(menu.symbol);
              setMenu(null);
            }}
            data-testid="mon-remove"
          >
            <X size={13} /> <span className="grow">Remove from list</span>
          </button>
        </PopMenu>
      )}
    </div>
  );
}

const decimalsOf = (p: number) => (p >= 1000 ? 2 : p >= 1 ? 3 : 5);

function Spark({ symbol, up, down }: { symbol: string; up: string; down: string }) {
  const { values } = useSpark(symbol);
  return <Sparkline values={values} width={56} height={16} up={up} down={down} />;
}

/** The main watchlist, then named lists; + adds a list, double-click renames, × deletes. */
function ListTabs({ listId, onPick }: { listId: string; onPick: (id: string) => void }) {
  const lists = useMonitorStore((s) => s.lists);
  const [editing, setEditing] = useState<string | null>(null);
  const { createList, renameList, deleteList } = useMonitorStore.getState();
  return (
    <div className="mon-tabs" role="tablist" aria-label="Lists">
      <button role="tab" aria-selected={listId === MAIN_LIST} className={`mon-tab ${listId === MAIN_LIST ? 'on' : ''}`} onClick={() => onPick(MAIN_LIST)} data-testid="mon-list-main">
        Watchlist
      </button>
      {lists.map((l) =>
        editing === l.id ? (
          <input
            key={l.id}
            autoFocus
            className="mon-rename"
            defaultValue={l.name}
            aria-label="List name"
            onBlur={(e) => {
              renameList(l.id, e.currentTarget.value);
              setEditing(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        ) : (
          <span key={l.id} role="tab" aria-selected={listId === l.id} className={`mon-tab ${listId === l.id ? 'on' : ''}`} onClick={() => onPick(l.id)} onDoubleClick={() => setEditing(l.id)} data-testid={`mon-list-${l.name}`}>
            {l.name}
            <button
              className="mon-tab-x"
              aria-label={`Delete list ${l.name}`}
              onClick={(e) => {
                e.stopPropagation();
                deleteList(l.id);
                if (listId === l.id) onPick(MAIN_LIST);
              }}
            >
              <X size={10} />
            </button>
          </span>
        ),
      )}
      <button
        className="mon-tab add"
        onClick={() => {
          const id = createList(`List ${lists.length + 1}`);
          onPick(id);
          setEditing(id);
        }}
        aria-label="New list"
        title="New list"
        data-testid="mon-new-list"
      >
        <Plus size={11} />
      </button>
    </div>
  );
}

function AddSymbol({ have, onAdd }: { have: string[]; onAdd: (s: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ASSET_UNIVERSE.filter((a) => !have.includes(a.symbol) && (!t || a.symbol.toLowerCase().startsWith(t) || a.name.toLowerCase().includes(t))).slice(0, 8);
  }, [q, have]);
  const pick = (s: string) => {
    onAdd(s);
    setQ('');
    setOpen(false);
  };
  return (
    <div className="mon-add" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <Search size={12} className="faint" />
      <input
        value={q}
        placeholder="Add symbol"
        aria-label="Add symbol"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) pick(matches[0].symbol);
          if (e.key === 'Escape') setOpen(false);
        }}
        data-testid="mon-add-input"
      />
      {open && matches.length > 0 && (
        <div className="menu mon-add-list">
          {matches.map((a) => (
            <button key={a.symbol} className="menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(a.symbol)} data-testid={`add-${a.symbol}`}>
              <b className="mono">{a.symbol}</b>
              <span className="grow faint">{a.name}</span>
              <Plus size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ColumnPicker({ shown, onChange }: { shown: ColId[]; onChange: (c: ColId[]) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button className="cw-btn" onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} aria-label="Columns" title="Choose columns" data-testid="mon-columns">
        <Columns3 size={13} />
      </button>
      {anchor && (
        <PopMenu anchor={anchor} onClose={() => setAnchor(null)} width={180} align="right" testId="mon-columns-menu">
          <div className="menu-group">Columns</div>
          {COLUMN_IDS.map((id) => {
            const on = shown.includes(id);
            return (
              <button
                key={id}
                className="menu-item"
                role="menuitemcheckbox"
                aria-checked={on}
                disabled={id === 'symbol'}
                onClick={() => onChange(on ? shown.filter((c) => c !== id) : COLUMN_IDS.filter((c) => c === id || shown.includes(c)))}
                data-testid={`col-${id}`}
              >
                <span className={`check ${on ? 'on' : ''}`}>{on && <Check size={11} />}</span>
                {LABELS[id]}
              </button>
            );
          })}
        </PopMenu>
      )}
    </>
  );
}
