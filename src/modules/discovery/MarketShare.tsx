import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { CandlestickChart } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { useMarketStore } from '@/stores/useMarketStore';
import { useDiscoveryStore } from '@/stores/useDiscoveryStore';
import { CATEGORICAL } from '@/stores/useThemeStore';
import { fmtCompact, fmtPct } from '@/lib/format';

const RING_TOP = 5;

export interface ShareRow {
  symbol: string;
  name: string;
  cap: number;
  volume: number;
  share: number;
}

/** Market cap = price × supply (mock); dominance = cap / total. Production: aggregator API. */
export function computeShares(prices: Record<string, { price: number; volume24h: number }>): ShareRow[] {
  const rows = ASSET_UNIVERSE.map((a) => ({ symbol: a.symbol, name: a.name, cap: (prices[a.symbol]?.price ?? 0) * a.supply, volume: prices[a.symbol]?.volume24h ?? 0, share: 0 }));
  const total = rows.reduce((s, r) => s + r.cap, 0) || 1;
  rows.forEach((r) => (r.share = (r.cap / total) * 100));
  return rows.sort((a, b) => b.cap - a.cap);
}

export function MarketShare() {
  const assets = useMarketStore((s) => s.assets);
  const highlighted = useDiscoveryStore((s) => s.highlighted);
  const highlight = useDiscoveryStore((s) => s.highlight);
  const navigate = useNavigate();
  const rows = useMemo(() => computeShares(assets), [assets]);
  const top = rows.slice(0, RING_TOP);
  const otherShare = rows.slice(RING_TOP).reduce((s, r) => s + r.share, 0);
  const ring = [...top.map((r, i) => ({ key: r.symbol, value: r.share, color: CATEGORICAL[i] })), { key: 'Other', value: otherShare, color: 'var(--text-faint)' }];
  const inOther = highlighted != null && !top.some((r) => r.symbol === highlighted);
  const activeKey = highlighted == null ? null : inOther ? 'Other' : highlighted;
  const focusRow = rows.find((r) => r.symbol === highlighted);
  const totalCap = rows.reduce((s, r) => s + r.cap, 0);

  return (
    <Panel title="Market share" sub="dominance by market cap" className="disc-share" testId="market-share">
      <div className="share-wrap">
        <div className="share-ring">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={ring} dataKey="value" nameKey="key" innerRadius="64%" outerRadius="92%" paddingAngle={1.2} stroke="var(--panel)" strokeWidth={2} isAnimationActive={false} onClick={(_d: unknown, i: number) => {
                  const k = ring[i]?.key;
                  if (k && k !== 'Other') highlight(highlighted === k ? null : k);
                }}>
                {ring.map((s) => (
                  <Cell key={s.key} fill={s.color} opacity={activeKey == null || activeKey === s.key ? 1 : 0.28} style={{ cursor: s.key === 'Other' ? 'default' : 'pointer', outline: 'none' }} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="ring-center">
            {focusRow ? (
              <>
                <div className="mono" style={{ fontWeight: 600 }}>{focusRow.symbol}</div>
                <div className="num" style={{ fontSize: 18 }}>{fmtPct(focusRow.share, 2, false)}</div>
              </>
            ) : (
              <>
                <div className="label">Total cap</div>
                <div className="num" style={{ fontSize: 16 }}>${fmtCompact(totalCap)}</div>
              </>
            )}
          </div>
        </div>
        <div className="share-legend">
          {ring.map((s) => (
            <button key={s.key} className={`legend-item ${activeKey === s.key ? 'on' : ''}`} onClick={() => s.key !== 'Other' && highlight(highlighted === s.key ? null : s.key)}>
              <span className="swatch" style={{ background: s.color }} />
              <span className="mono">{s.key}</span>
              <span className="spacer" />
              <span className="num">{fmtPct(s.value, 1, false)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="share-table">
        <table className="table">
          <thead>
            <tr>
              <th>Asset</th>
              <th className="r">Share</th>
              <th className="r">Market cap</th>
              <th className="r">24h volume</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} data-share-row={r.symbol} className={`clickable ${highlighted === r.symbol ? 'selected' : ''}`} onClick={() => highlight(highlighted === r.symbol ? null : r.symbol)}>
                <td>
                  <span className="mono" style={{ fontWeight: 600, marginRight: 8 }}>{r.symbol}</span>
                  <span className="dim">{r.name}</span>
                </td>
                <td className="r num">{fmtPct(r.share, 2, false)}</td>
                <td className="r num">${fmtCompact(r.cap)}</td>
                <td className="r num">${fmtCompact(r.volume)}</td>
                <td className="r" style={{ paddingLeft: 0 }}>
                  <button
                    className="btn sm icon ghost"
                    title="Open in Terminal"
                    onClick={(e) => {
                      e.stopPropagation();
                      useMarketStore.getState().select(r.symbol);
                      navigate('/terminal');
                    }}
                  >
                    <CandlestickChart size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
