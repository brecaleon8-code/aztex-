import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { Panel, type PanelDragProps } from '@/components/ui/Panel';
import { useMarketStore } from '@/stores/useMarketStore';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { fmtPct, fmtPrice } from '@/lib/format';
import { useTickFlash } from '@/app/useTickFlash';
import type { Asset } from '@/types';
import { Sparkline } from '@/components/ui/Sparkline';
import { useThemeStore } from '@/stores/useThemeStore';
import { useSpark } from './useSpark';

export function Watchlist({ drag }: { drag?: PanelDragProps }) {
  const watchlist = useMarketStore((s) => s.watchlist);
  const assets = useMarketStore((s) => s.assets);
  const selected = useMarketStore((s) => s.selected);
  const { select, removeWatch } = useMarketStore.getState();

  return (
    <Panel code="MON" title="Watchlist" drag={drag} flush actions={<AddCurrency />} testId="watchlist">
      <table className="table watchlist">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>24h</th>
            <th className="r">Last · Bid / Ask</th>
          </tr>
        </thead>
        <tbody>
          {watchlist.map((sym) => {
            const a = assets[sym];
            if (!a) return null;
            return <WatchRow key={sym} a={a} selected={sym === selected} onSelect={() => select(sym)} onRemove={() => removeWatch(sym)} />;
          })}
        </tbody>
      </table>
      {watchlist.length === 0 && <div className="empty">Watchlist is empty — add a currency.</div>}
    </Panel>
  );
}

function WatchRow({ a, selected, onSelect, onRemove }: { a: Asset; selected: boolean; onSelect: () => void; onRemove: () => void }) {
  const f = useTickFlash(a.price);
  const { values } = useSpark(a.symbol);
  const { profit, loss } = useThemeStore((s) => s.colors);
  return (
    <tr className={`clickable wl-row ${selected ? 'selected' : ''}`} onClick={onSelect} data-testid={`watch-${a.symbol}`}>
      <td className="wl-sym-cell" title={a.name}>
        <div className="wl-sym">{a.symbol}</div>
        <span className={`wl-chg ${a.change24h >= 0 ? 'pos' : 'neg'}`}>{fmtPct(a.change24h)}</span>
        <button
          className="btn ghost sm icon wl-remove"
          aria-label={`Remove ${a.symbol} from watchlist`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={12} />
        </button>
      </td>
      <td className="wl-spark">
        <Sparkline values={values} up={profit} down={loss} />
      </td>
      <td className="r">
        <div className={`num wl-last ${f.cls}`} key={f.key}>
          {fmtPrice(a.price)}
        </div>
        <div className="wl-ba mono">
          <span className="up">{fmtPrice(a.bid)}</span>
          <span className="faint">/</span>
          <span className="down">{fmtPrice(a.ask)}</span>
        </div>
      </td>
    </tr>
  );
}

function AddCurrency() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hl, setHl] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const watchlist = useMarketStore((s) => s.watchlist);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ASSET_UNIVERSE.filter((a) => !s || a.symbol.toLowerCase().includes(s) || a.name.toLowerCase().includes(s));
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const add = (sym: string) => {
    useMarketStore.getState().addWatch(sym);
    setQ('');
  };

  return (
    <div ref={ref} style={{ position: 'relative' }} onMouseDown={(e) => e.stopPropagation()}>
      <button className="btn sm" onClick={() => setOpen((o) => !o)} draggable={false}>
        <Plus size={12} /> Add currency
      </button>
      {open && (
        <div className="menu" style={{ right: 0, top: 30, width: 250 }}>
          <span className="input-wrap" style={{ marginBottom: 6 }}>
            <Search size={13} className="faint" />
            <input
              autoFocus
              placeholder="Search symbol or name"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHl(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') setHl((h) => Math.min(results.length - 1, h + 1));
                if (e.key === 'ArrowUp') setHl((h) => Math.max(0, h - 1));
                if (e.key === 'Enter' && results[hl]) add(results[hl].symbol);
                if (e.key === 'Escape') setOpen(false);
              }}
            />
          </span>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {results.map((a, i) => {
              const on = watchlist.includes(a.symbol);
              return (
                <button key={a.symbol} className={`menu-item ${i === hl ? 'hl' : ''}`} onClick={() => add(a.symbol)} disabled={on} style={{ opacity: on ? 0.5 : 1 }}>
                  <span className="mono" style={{ width: 48, fontWeight: 600 }}>{a.symbol}</span>
                  <span className="dim grow">{a.name}</span>
                  {on && <span className="label">added</span>}
                </button>
              );
            })}
            {results.length === 0 && <div className="empty">No match</div>}
          </div>
        </div>
      )}
    </div>
  );
}
