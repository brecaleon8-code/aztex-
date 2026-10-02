import { useMarketStore } from '@/stores/useMarketStore';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { fmtPct, fmtPrice } from '@/lib/format';
import { GasTicker } from './GasTicker';

/** Scrolling cross-asset quote board, terminal ticker style, plus network fees. */
export function QuoteBoard() {
  const assets = useMarketStore((s) => s.assets);
  const select = useMarketStore((s) => s.select);
  const items = (suffix: string) =>
    ASSET_UNIVERSE.map((a) => {
      const q = assets[a.symbol];
      return (
        <button key={a.symbol + suffix} className="qb-item" onClick={() => select(a.symbol)} tabIndex={suffix ? -1 : 0} aria-hidden={suffix ? true : undefined}>
          <span className="amber">{a.symbol}</span>
          <span>{fmtPrice(q.price)}</span>
          <span className={q.change24h >= 0 ? 'up' : 'down'}>
            {q.change24h >= 0 ? '▲' : '▼'}
            {fmtPct(Math.abs(q.change24h), 2, false)}
          </span>
        </button>
      );
    });
  return (
    <div className="quoteboard no-select">
      <div className="qb-track">
        <div className="qb-run mono">
          {items('')}
          {items('-dup')}
        </div>
      </div>
      <GasTicker />
    </div>
  );
}
