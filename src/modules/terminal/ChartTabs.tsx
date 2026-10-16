import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { useMarketStore } from '@/stores/useMarketStore';
import { focusedPane, MAX_TABS, paneCount, useChartTabsStore } from '@/stores/useChartTabsStore';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { fmtPct, fmtPrice } from '@/lib/format';
import { LayoutGlyph } from './chart/ChartGrid';

/**
 * Browser-style tabs, one per crypto. Each tab keeps its own chart layout; the active tab's
 * focused chart is what the ticket, book and tape trade. Middle-click closes a tab.
 */
export function ChartTabs() {
  const tabs = useChartTabsStore((s) => s.tabs);
  const activeTab = useChartTabsStore((s) => s.activeTab);
  const assets = useMarketStore((s) => s.assets);
  const { activateTab, closeTab } = useChartTabsStore.getState();

  return (
    <div className="chart-tabs-wrap">
      <div className="chart-tabs" role="tablist" aria-label="Chart tabs" data-testid="chart-tabs">
        {tabs.map((t) => {
          const f = focusedPane(t);
          const a = assets[f.symbol];
          const on = t.id === activeTab;
          const n = paneCount(t.layout);
          return (
            <div
              key={t.id}
              role="tab"
              tabIndex={0}
              aria-selected={on}
              className={`ctab ${on ? 'active' : ''}`}
              onClick={() => activateTab(t.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), activateTab(t.id))}
              onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
              onMouseDown={(e) => e.button === 1 && e.preventDefault()}
              title={`${f.symbol}/USDT · ${f.tf}${n > 1 ? ` · ${n} charts` : ''}${a ? ` · ${fmtPrice(a.price)}` : ''}`}
              data-testid="chart-tab"
              data-symbol={f.symbol}
            >
              {n > 1 && <LayoutGlyph id={t.layout} size={11} />}
              <span className="ctab-sym mono">{f.symbol}</span>
              {a && <span className={`ctab-chg mono ${a.change24h >= 0 ? 'up' : 'down'}`}>{fmtPct(a.change24h, 1)}</span>}
              {tabs.length > 1 && (
                <button
                  className="ctab-x"
                  aria-label={`Close ${f.symbol} tab`}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  data-testid="chart-tab-close"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {/* Outside the scrolling strip so its menu isn't clipped. */}
      <NewTab disabled={tabs.length >= MAX_TABS} />
    </div>
  );
}

function NewTab({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hl, setHl] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const assets = useMarketStore((s) => s.assets);
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

  const pick = (sym: string) => {
    useChartTabsStore.getState().openTab(sym, useMarketStore.getState().timeframe);
    setOpen(false);
    setQ('');
    setHl(0);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="ctab-new" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-label="Open a chart tab" title={disabled ? `Up to ${MAX_TABS} tabs` : 'Open another crypto in a new tab'} data-testid="new-tab">
        <Plus size={13} />
      </button>
      {open && (
        <div className="menu" style={{ left: 0, top: 32, width: 260 }}>
          <span className="input-wrap" style={{ marginBottom: 6 }}>
            <Search size={13} className="faint" />
            <input
              autoFocus
              placeholder="Open a crypto in a new tab"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHl(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') setHl((h) => Math.min(results.length - 1, h + 1));
                if (e.key === 'ArrowUp') setHl((h) => Math.max(0, h - 1));
                if (e.key === 'Enter' && results[hl]) pick(results[hl].symbol);
                if (e.key === 'Escape') setOpen(false);
              }}
              aria-label="Search crypto"
            />
          </span>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {results.map((a, i) => {
              const px = assets[a.symbol];
              return (
                <button key={a.symbol} className={`menu-item ${i === hl ? 'hl' : ''}`} onClick={() => pick(a.symbol)} data-testid={`new-tab-${a.symbol}`}>
                  <span className="mono" style={{ width: 48, fontWeight: 600 }}>{a.symbol}</span>
                  <span className="dim grow">{a.name}</span>
                  {px && <span className={`mono ${px.change24h >= 0 ? 'up' : 'down'}`} style={{ fontSize: 11 }}>{fmtPct(px.change24h, 1)}</span>}
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
