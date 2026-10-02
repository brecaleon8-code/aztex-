import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Panel } from '@/components/ui/Panel';
import { ASSET_UNIVERSE, BASE_PRICES } from '@/lib/mock/assets';
import { generateDailyCloses } from '@/lib/mock/candles';
import { useDiscoveryStore, MAX_COMPARE } from '@/stores/useDiscoveryStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { fmtDate, fmtPct } from '@/lib/format';

export const WINDOW_DAYS = 30;

/** Normalized % change from the first point of the window — for relative performance, not price. */
export function normalize(closes: number[]): number[] {
  const base = closes[0];
  return closes.map((c) => (base ? (c / base - 1) * 100 : 0));
}

const historyCache = new Map<string, { time: number; close: number }[]>();
/** Mock daily history anchored to the price when first requested (regenerated if the feed jumps, e.g. provider switch). */
function history(symbol: string, livePrice: number) {
  const h = historyCache.get(symbol);
  const anchor = h?.[h.length - 1].close;
  if (!h || !anchor || Math.abs(livePrice / anchor - 1) > 0.25) historyCache.set(symbol, generateDailyCloses(symbol, WINDOW_DAYS, livePrice));
  return historyCache.get(symbol)!;
}

export function ComparisonChart() {
  const comparison = useDiscoveryStore((s) => s.comparison);
  const toggle = useDiscoveryStore((s) => s.toggleCompare);
  const assets = useMarketStore((s) => s.assets);

  const data = useMemo(() => {
    const price = (s: string) => assets[s]?.price ?? BASE_PRICES[s];
    const rows: Record<string, number>[] = history('BTC', price('BTC')).map((h) => ({ time: h.time }));
    for (const { symbol } of comparison) {
      const h = history(symbol, price(symbol));
      // Last point follows the live price so the overlay updates in real time.
      const closes = [...h.slice(0, -1).map((x) => x.close), price(symbol)];
      normalize(closes).forEach((v, i) => rows[i] && (rows[i][symbol] = v));
    }
    return rows;
  }, [comparison, assets]);

  const lastRow = data[data.length - 1];

  return (
    <Panel title="Relative performance" sub={`normalized % change · ${WINDOW_DAYS}d`} className="disc-compare" testId="comparison">
      <div className="row" style={{ flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {ASSET_UNIVERSE.map((a) => {
          const on = comparison.find((c) => c.symbol === a.symbol);
          const full = !on && comparison.length >= MAX_COMPARE;
          return (
            <button key={a.symbol} className={`chip ${on ? 'on' : ''}`} onClick={() => toggle(a.symbol)} disabled={full} aria-pressed={!!on} style={{ opacity: full ? 0.4 : 1 }} data-testid={`compare-${a.symbol}`}>
              <span className="swatch" style={{ background: on?.color ?? 'var(--border)' }} />
              <span className="mono">{a.symbol}</span>
              {on && lastRow?.[a.symbol] != null && <span className={`mono ${lastRow[a.symbol] >= 0 ? 'up' : 'down'}`}>{fmtPct(lastRow[a.symbol], 1)}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ height: 280 }}>
        {comparison.length === 0 ? (
          <div className="empty">Toggle up to {MAX_COMPARE} assets to compare.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border-soft)" vertical={false} />
              <XAxis dataKey="time" tickFormatter={(t: number) => fmtDate(t).slice(5)} tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--text-faint)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} minTickGap={28} />
              <YAxis tickFormatter={(v: number) => fmtPct(v, 0)} width={48} tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                labelFormatter={(t) => fmtDate(Number(t))}
                formatter={(v, name) => [fmtPct(Number(v)), String(name)]}
              />
              {comparison.map((c) => (
                <Line key={c.symbol} dataKey={c.symbol} stroke={c.color} strokeWidth={1.7} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
