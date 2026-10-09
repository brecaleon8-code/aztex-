import type { Candle, OrderBookSnapshot } from '@/types';
import type { XScale, YScale } from '@/lib/chart/scale';
import { estimateBar, imbalances, rebin, summarize, type Cell, type FootprintRows, type RawFootprint } from '@/lib/orderflow/footprint';
import { fmtCompact } from '@/lib/format';

export interface BarFootprint extends FootprintRows {
  /** 'live' = fully observed on the tape · 'partial' = tape + estimate for the unobserved part · 'est' = OHLCV estimate */
  source: 'live' | 'partial' | 'est';
}

/** Footprint for one bar, choosing live tape data when the whole bar was observed. */
export function barFootprint(c: Candle, raw: RawFootprint, tick: number, rowSize: number, tfMs: number, since: number | null): BarFootprint {
  const sinceBar = since == null ? Infinity : Math.floor(since / tfMs) * tfMs;
  const live = raw[c.time];
  if (live && c.time > sinceBar) return { ...rebin(live, tick, rowSize), source: 'live' };
  if (live && c.time === sinceBar) {
    // Opened before we started listening: add an estimate for the part of the bar we missed.
    const missed = Math.min(1, Math.max(0, ((since as number) - c.time) / tfMs));
    const est = estimateBar({ ...c, volume: c.volume * missed }, rowSize);
    const obs = rebin(live, tick, rowSize);
    const rows: Record<number, Cell> = { ...est.rows };
    for (const [k, [b, s]] of Object.entries(obs.rows)) {
      const p = rows[+k] ?? [0, 0];
      rows[+k] = [p[0] + b, p[1] + s];
    }
    return { ...summarize(rows), source: 'partial' };
  }
  return { ...estimateBar(c, rowSize), source: 'est' };
}

const fmtQ = (v: number) => (v <= 0 ? '0' : v < 0.1 ? v.toFixed(3) : v < 10 ? v.toFixed(1) : v < 1000 ? Math.round(v).toString() : fmtCompact(v));

interface LayerProps {
  display: Candle[];
  bars: Map<number, BarFootprint>;
  visible: number[];
  xs: XScale;
  ys: YScale;
  rowSize: number;
  bull: string;
  bear: string;
  profit: string;
  loss: string;
}

/** Bid × ask cells per bar, shaded by delta; POC outlined; diagonal imbalances highlighted. */
export function FootprintLayer({ display, bars, visible, xs, ys, rowSize, bull, bear, profit, loss }: LayerProps) {
  const cw = xs.candleWidth;
  const colW = Math.max(2, cw * 0.84);
  let maxCell = 0;
  for (const i of visible) maxCell = Math.max(maxCell, bars.get(i)?.maxCell ?? 0);
  const rowPx = Math.abs(ys.toY(0) - ys.toY(rowSize));
  const showText = colW >= 46 && rowPx >= 11;
  const fontSize = Math.min(10.5, Math.max(8.5, rowPx * 0.62));
  // Where the tape starts: the first visible bar that isn't a pure estimate.
  const firstLive = visible.find((i) => bars.get(i)?.source !== 'est' && bars.get(i - 1)?.source === 'est');
  return (
    <g className="footprint" data-testid="footprint">
      {firstLive != null && (
        <g className="fp-boundary">
          <line x1={xs.toX(firstLive) - cw / 2} x2={xs.toX(firstLive) - cw / 2} y1={0} y2={ys.bottom + 6} />
          <text x={xs.toX(firstLive) - cw / 2 + 4} y={ys.bottom + 2}>
            live tape →
          </text>
        </g>
      )}
      {visible.map((i) => {
        const f = bars.get(i);
        const c = display[i];
        if (!f || !c) return null;
        const x = xs.toX(i);
        const left = x - colW / 2 + 3;
        const im = showText ? imbalances(f.rows, 3, maxCell * 0.02) : null;
        const up = c.close >= c.open;
        const est = f.source === 'est';
        return (
          <g key={i} className={`fp-bar fp-${f.source}`} data-source={f.source}>
            {/* The bar itself: a 2px candle down the left edge of the column. */}
            <line x1={x - colW / 2} x2={x - colW / 2} y1={ys.toY(c.high)} y2={ys.toY(c.low)} stroke={up ? bull : bear} strokeWidth={1} />
            <rect x={x - colW / 2 - 1.5} width={3} y={Math.min(ys.toY(c.open), ys.toY(c.close))} height={Math.max(1, Math.abs(ys.toY(c.open) - ys.toY(c.close)))} fill={up ? bull : bear} />
            {Object.entries(f.rows).map(([key, [b, s]]) => {
              const k = +key;
              const yTop = ys.toY((k + 1) * rowSize);
              const h = Math.max(1, ys.toY(k * rowSize) - yTop - 1);
              const vol = b + s;
              const intensity = maxCell ? Math.min(1, Math.max(b, s) / maxCell) : 0;
              const fill = b >= s ? bull : bear;
              return (
                <g key={k}>
                  <rect x={left} y={yTop + 0.5} width={colW - 3} height={h} fill={fill} opacity={(est ? 0.06 : 0.1) + intensity * (est ? 0.32 : 0.55)} />
                  {f.poc === k && <rect x={left} y={yTop + 0.5} width={colW - 3} height={h} fill="none" stroke="var(--text)" strokeWidth={1} opacity={0.75} />}
                  {showText && vol > 0 && (
                    <text x={left + (colW - 3) / 2} y={yTop + 0.5 + h / 2} className="fp-text" textAnchor="middle" dominantBaseline="central" style={{ fontSize }}>
                      <tspan className={im?.sell.has(k) ? 'fp-imb' : undefined} fill={im?.sell.has(k) ? loss : undefined}>
                        {fmtQ(s)}
                      </tspan>
                      <tspan className="fp-sep">|</tspan>
                      <tspan className={im?.buy.has(k) ? 'fp-imb' : undefined} fill={im?.buy.has(k) ? profit : undefined}>
                        {fmtQ(b)}
                      </tspan>
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/** "Total vol" and "Delta vol" rows under the footprint, one cell per bar. */
export function FootprintStats({ bars, visible, xs, width, plotW, bull, bear }: { bars: Map<number, BarFootprint>; visible: number[]; xs: XScale; width: number; plotW: number; bull: string; bear: string }) {
  const H = 18;
  let maxVol = 0;
  let maxDelta = 0;
  for (const i of visible) {
    const f = bars.get(i);
    if (!f) continue;
    maxVol = Math.max(maxVol, f.total);
    maxDelta = Math.max(maxDelta, Math.abs(f.delta));
  }
  const cw = xs.candleWidth;
  const showText = cw >= 34;
  return (
    <div className="fp-stats" data-testid="footprint-stats">
      <svg width={width} height={H * 2 + 1}>
        {visible.map((i) => {
          const f = bars.get(i);
          if (!f) return null;
          const x = xs.toX(i) - cw / 2 + 1;
          const w = Math.max(1, cw - 2);
          return (
            <g key={i} opacity={f.source === 'est' ? 0.7 : 1}>
              <rect x={x} y={1} width={w} height={H - 2} fill="var(--text-dim)" opacity={0.06 + (f.total / (maxVol || 1)) * 0.3} />
              <rect x={x} y={H + 1} width={w} height={H - 2} fill={f.delta >= 0 ? bull : bear} opacity={0.1 + (Math.abs(f.delta) / (maxDelta || 1)) * 0.6} />
              {showText && (
                <>
                  <text x={x + w / 2} y={H / 2 + 1} className="fp-stat-text" textAnchor="middle" dominantBaseline="central">
                    {fmtQ(f.total)}
                  </text>
                  <text x={x + w / 2} y={H * 1.5 + 1} className="fp-stat-text" textAnchor="middle" dominantBaseline="central">
                    {f.delta >= 0 ? '' : '−'}
                    {fmtQ(Math.abs(f.delta))}
                  </text>
                </>
              )}
            </g>
          );
        })}
        <line x1={plotW} x2={plotW} y1={0} y2={H * 2 + 1} className="axis-line" />
        <text x={plotW + 8} y={H / 2 + 1} className="axis-text" dominantBaseline="central">
          Total vol
        </text>
        <text x={plotW + 8} y={H * 1.5 + 1} className="axis-text" dominantBaseline="central">
          Delta vol
        </text>
      </svg>
    </div>
  );
}

/** Resting liquidity per book level, drawn against the price axis; outsized levels ("walls") labelled. */
export function BookProfileLayer({ book, ys, plotW, plotH, bull, bear }: { book: OrderBookSnapshot; ys: YScale; plotW: number; plotH: number; bull: string; bear: string }) {
  const levels = [...book.bids.map((l) => ({ ...l, bid: true })), ...book.asks.map((l) => ({ ...l, bid: false }))];
  if (!levels.length) return null;
  const sizes = levels.map((l) => l.size).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 1;
  const max = sizes[sizes.length - 1] || 1;
  const maxW = Math.min(64, plotW * 0.12);
  return (
    <g className="ob-profile" data-testid="book-profile">
      {levels.map((l) => {
        const y = ys.toY(l.price);
        if (y < 0 || y > plotH) return null;
        const w = Math.max(1, (l.size / max) * maxW);
        const wall = l.size > median * 2.5;
        return (
          <g key={`${l.bid ? 'b' : 'a'}${l.price}`}>
            <rect x={plotW - w} y={y - 1.25} width={w} height={2.5} fill={l.bid ? bull : bear} opacity={wall ? 0.95 : 0.55} />
            {wall && (
              <text x={plotW - w - 4} y={y + 3} textAnchor="end" className="ob-wall-text" fill={l.bid ? bull : bear}>
                {fmtCompact(l.size)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
