import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CandlestickChart } from 'lucide-react';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { useDiscoveryStore } from '@/stores/useDiscoveryStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { fmtPct, fmtPrice } from '@/lib/format';

/** Filters the full universe; choosing a result highlights it everywhere and scrolls to it. */
export function CurrencySearch() {
  const [q, setQ] = useState('');
  const [hl, setHl] = useState(0);
  const [focused, setFocused] = useState(false);
  const assets = useMarketStore((s) => s.assets);
  const navigate = useNavigate();
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return ASSET_UNIVERSE.filter((a) => a.symbol.toLowerCase().includes(s) || a.name.toLowerCase().includes(s));
  }, [q]);

  const choose = (symbol: string) => {
    useDiscoveryStore.getState().highlight(symbol);
    setQ('');
    requestAnimationFrame(() => document.querySelector(`[data-share-row="${symbol}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };

  return (
    <div className="disc-search">
      <span className="input-wrap" style={{ height: 36 }}>
        <Search size={14} className="faint" />
        <input
          placeholder="Search the asset universe…"
          value={q}
          data-testid="currency-search"
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onChange={(e) => {
            setQ(e.target.value);
            setHl(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setHl((h) => Math.min(results.length - 1, h + 1));
            if (e.key === 'ArrowUp') setHl((h) => Math.max(0, h - 1));
            if (e.key === 'Enter' && results[hl]) choose(results[hl].symbol);
          }}
        />
      </span>
      {focused && q && (
        <div className="menu" style={{ top: 40, left: 0, right: 0 }}>
          {results.length === 0 && <div className="empty">No asset matches “{q}”</div>}
          {results.map((a, i) => {
            const live = assets[a.symbol];
            return (
              <div key={a.symbol} className={`menu-item ${i === hl ? 'hl' : ''}`} onMouseDown={() => choose(a.symbol)} role="option" aria-selected={i === hl} data-testid={`search-result-${a.symbol}`}>
                <span className="mono" style={{ width: 48, fontWeight: 600 }}>{a.symbol}</span>
                <span className="dim grow">{a.name}</span>
                <span className="num">{fmtPrice(live.price)}</span>
                <span className={`num ${live.change24h >= 0 ? 'up' : 'down'}`} style={{ width: 56, textAlign: 'right' }}>{fmtPct(live.change24h)}</span>
                <button
                  className="btn sm icon ghost"
                  title="Open in Terminal"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    useMarketStore.getState().select(a.symbol);
                    navigate('/terminal');
                  }}
                >
                  <CandlestickChart size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
