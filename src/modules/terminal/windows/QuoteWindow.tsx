import { useEffect, useMemo, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useMarketStore } from '@/stores/useMarketStore';
import { useDailyStore } from '@/stores/useDailyStore';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { quoteStats, type Extreme } from '@/lib/market/quoteStats';
import { fmtCompact, fmtPct, fmtPrice, fmtSigned, priceDecimals } from '@/lib/format';
import { useWindowSymbol } from '@/workspace/WindowContext';

const META = Object.fromEntries(ASSET_UNIVERSE.map((a) => [a.symbol, a]));
const fmtDay = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' });
const dash = <span className="faint">—</span>;

/** A fraction (0.05) as a coloured signed percent, or a dash. */
function Ret({ v }: { v: number | null }) {
  if (v == null) return dash;
  return <span className={v >= 0 ? 'up' : 'down'}>{fmtPct(v * 100)}</span>;
}

function Row({ label, children, sub, testId }: { label: string; children: ReactNode; sub?: ReactNode; testId?: string }) {
  return (
    <div className="qw-row" data-testid={testId}>
      <span className="qw-label">{label}</span>
      <span className="qw-val num">{children}</span>
      {sub !== undefined && <span className="qw-sub">{sub}</span>}
    </div>
  );
}

const Ext = ({ e }: { e: Extreme | null }) => (e ? <>{fmtPrice(e.value)}</> : dash);

/**
 * Quote: the linked symbol's key numbers at a glance — last, change and 24h volume in large type,
 * then the session (O / H / L / previous close), the 52-week range with dates, period-to-date and
 * trailing returns, 30-day volume and volatility, and market cap, supply, dominance and rank.
 * History comes from the active provider's daily candles.
 */
export function QuoteWindow() {
  const symbol = useWindowSymbol();
  const asset = useMarketStore((s) => s.assets[symbol]);
  const assets = useMarketStore((s) => s.assets);
  const providerId = useMarketStore((s) => s.providerId);
  const daily = useDailyStore((s) => s.bars[symbol]);
  useEffect(() => {
    useDailyStore.getState().want(symbol);
  }, [symbol]);

  const price = asset?.price ?? 0;
  const stats = useMemo(() => (daily && asset ? quoteStats(daily, price, Date.now()) : null), [daily, asset, price]);
  const caps = useMemo(
    () =>
      ASSET_UNIVERSE.map((a) => ({ symbol: a.symbol, cap: (assets[a.symbol]?.price ?? 0) * a.supply }))
        .filter((x) => x.cap > 0)
        .sort((a, b) => b.cap - a.cap),
    [assets],
  );
  if (!asset) return <div className="win-empty">No quote for {symbol}.</div>;

  const meta = META[symbol];
  const cap = price * (meta?.supply ?? 0);
  const totalCap = caps.reduce((t, c) => t + c.cap, 0);
  const rank = caps.findIndex((c) => c.symbol === symbol) + 1;
  const up = asset.change24h >= 0;
  const chgAbs = price - price / (1 + asset.change24h / 100);
  const s = stats;

  return (
    <div className="qw" data-testid="quote" data-symbol={symbol}>
      <div className="qw-head">
        <div className="qw-id">
          <span className="qw-sym">{symbol}</span>
          <span className="qw-name">{meta?.name ?? symbol}</span>
        </div>
        <div className="qw-last num" data-testid="quote-last">
          {fmtPrice(price)}
          <span className="qw-ccy">USDT</span>
        </div>
        <div className={`qw-chg num ${up ? 'up' : 'down'}`} data-testid="quote-chg">
          {up ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          {fmtPct(asset.change24h)}
          <span className="qw-chg-abs">{fmtSigned(chgAbs, Math.min(4, priceDecimals(price)))}</span>
        </div>
        <span className="spacer" />
        <div className="qw-vol" title="24h volume (quote currency)">
          <span className="num">${fmtCompact(asset.volume24h)}</span>
          <span className="qw-label">24h volume</span>
        </div>
      </div>

      <div className="qw-grid" data-testid="quote-stats">
        <section className="qw-col" aria-label="Session">
          <Row label="Open">{s?.open != null ? fmtPrice(s.open) : dash}</Row>
          <Row label="High">{s?.high != null ? fmtPrice(s.high) : dash}</Row>
          <Row label="Low">{s?.low != null ? fmtPrice(s.low) : dash}</Row>
          <Row label="Prev close">{s?.prevClose != null ? fmtPrice(s.prevClose) : dash}</Row>
        </section>
        <section className="qw-col" aria-label="Range and activity">
          <Row label="52W high" sub={s?.high52w ? fmtDay(s.high52w.time) : ''} testId="quote-52w-high">
            <Ext e={s?.high52w ?? null} />
          </Row>
          <Row label="52W low" sub={s?.low52w ? fmtDay(s.low52w.time) : ''} testId="quote-52w-low">
            <Ext e={s?.low52w ?? null} />
          </Row>
          <Row label="Avg vol 30D">{s?.avgVol30d != null ? `$${fmtCompact(s.avgVol30d)}` : dash}</Row>
          <Row label="Volatility 30D" sub="annualised">
            {s?.vol30d != null ? fmtPct(s.vol30d * 100, 1, false) : dash}
          </Row>
        </section>
        <section className="qw-col" aria-label="Period to date">
          <Row label="WTD" testId="quote-wtd">
            <Ret v={s?.wtd ?? null} />
          </Row>
          <Row label="MTD">
            <Ret v={s?.mtd ?? null} />
          </Row>
          <Row label="QTD">
            <Ret v={s?.qtd ?? null} />
          </Row>
          <Row label="YTD" testId="quote-ytd">
            <Ret v={s?.ytd ?? null} />
          </Row>
        </section>
        <section className="qw-col" aria-label="Trailing returns">
          <Row label="1W">
            <Ret v={s?.r1w ?? null} />
          </Row>
          <Row label="1M">
            <Ret v={s?.r1m ?? null} />
          </Row>
          <Row label="3M">
            <Ret v={s?.r3m ?? null} />
          </Row>
          <Row label="1Y" testId="quote-1y">
            <Ret v={s?.r1y ?? null} />
          </Row>
        </section>
        <section className="qw-col" aria-label="Size">
          <Row label="Market cap">${fmtCompact(cap)}</Row>
          <Row label="Supply">{fmtCompact(meta?.supply ?? 0)}</Row>
          <Row label="Dominance">{totalCap ? fmtPct((cap / totalCap) * 100, 1, false) : dash}</Row>
          <Row label="Rank">{rank ? `#${rank} of ${caps.length}` : dash}</Row>
        </section>
      </div>

      <div className="qw-foot">
        <span>
          <span className="qw-label">Networks</span> {meta?.networks.join(', ')}
        </span>
        <span>
          <span className="qw-label">Quote</span> USDT
        </span>
        <span>
          <span className="qw-label">Source</span> {providerId === 'live' ? 'Binance' : 'Simulated feed'}
        </span>
        {!daily && <span className="faint">Loading history…</span>}
      </div>
    </div>
  );
}
