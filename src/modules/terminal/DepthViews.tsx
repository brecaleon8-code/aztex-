import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { OrderBookSnapshot } from '@/types';
import { fmtCompact, fmtPrice } from '@/lib/format';
import { useThemeStore } from '@/stores/useThemeStore';

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Cumulative depth: bid/ask step curves around the mid. */
export function DepthChart({ book }: { book: OrderBookSnapshot }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const { profit, loss } = useThemeStore((s) => s.colors);
  const bids = book.bids;
  const asks = book.asks;
  const ok = w > 0 && h > 0 && bids.length && asks.length;
  let body = null;
  if (ok) {
    const lo = bids[bids.length - 1].price;
    const hi = asks[asks.length - 1].price;
    const maxCum = Math.max(bids[bids.length - 1].cumulative, asks[asks.length - 1].cumulative);
    const pad = 16;
    const x = (p: number) => ((p - lo) / (hi - lo || 1)) * w;
    const y = (c: number) => h - pad - (c / maxCum) * (h - pad - 6);
    const step = (levels: typeof bids, dir: 1 | -1) => {
      let d = `M${x(levels[0].price)},${h - pad}`;
      let prev = 0;
      for (const l of levels) {
        d += `L${x(l.price)},${y(prev)}L${x(l.price)},${y(l.cumulative)}`;
        prev = l.cumulative;
      }
      const end = dir === 1 ? w : 0;
      return { line: d + `L${end},${y(prev)}`, area: d + `L${end},${y(prev)}L${end},${h - pad}Z` };
    };
    const b = step(bids, -1);
    const a = step(asks, 1);
    const mid = (bids[0].price + asks[0].price) / 2;
    body = (
      <svg width={w} height={h} className="depth-svg">
        <path d={b.area} fill={profit} opacity={0.18} />
        <path d={b.line} fill="none" stroke={profit} strokeWidth={1.2} />
        <path d={a.area} fill={loss} opacity={0.18} />
        <path d={a.line} fill="none" stroke={loss} strokeWidth={1.2} />
        <line x1={x(mid)} x2={x(mid)} y1={0} y2={h - pad} stroke="var(--amber)" strokeDasharray="2 2" />
        <text x={x(mid)} y={11} textAnchor="middle" className="axis-text amber-fill">
          MID {fmtPrice(mid)}
        </text>
        <text x={4} y={h - 4} className="axis-text">{fmtPrice(lo)}</text>
        <text x={w - 4} y={h - 4} textAnchor="end" className="axis-text">{fmtPrice(hi)}</text>
        <text x={4} y={11} className="axis-text">Σ {fmtCompact(maxCum)}</text>
      </svg>
    );
  }
  return (
    <div ref={ref} className="depth-view" data-testid="depth-chart">
      {body}
    </div>
  );
}

/** Thermal colour ramp for resting liquidity: black → navy → cyan → yellow → white. */
export function heatColor(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [0, 0, 0]],
    [0.25, [10, 30, 110]],
    [0.5, [20, 170, 220]],
    [0.78, [255, 214, 10]],
    [1, [255, 255, 255]],
  ];
  const v = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const k = (v - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number];
    }
  }
  return [255, 255, 255];
}

/** Liquidity heatmap: resting size per price level over time (Bookmap-style), mid traced in amber. */
export function LiquidityHeatmap({ history }: { history: OrderBookSnapshot[] }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [range, setRange] = useState<[number, number] | null>(null);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || w === 0 || h === 0 || history.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const last = history[history.length - 1];
    const mid = (last.bids[0].price + last.asks[0].price) / 2;
    const halfSpan = Math.max(mid - last.bids[last.bids.length - 1].price, last.asks[last.asks.length - 1].price - mid) * 1.15;
    const lo = mid - halfSpan;
    const hi = mid + halfSpan;
    setRange([lo, hi]);
    const y = (p: number) => h - ((p - lo) / (hi - lo)) * h;
    let maxSize = 0;
    for (const s of history) for (const l of [...s.bids, ...s.asks]) maxSize = Math.max(maxSize, l.size);
    const colW = Math.max(3, w / 120);
    const x0 = w - history.length * colW;
    const tick = Math.abs((last.asks[1]?.price ?? last.asks[0].price + 1) - last.asks[0].price) || (hi - lo) / 40;
    const rowH = Math.max(2, Math.abs(y(0) - y(tick)));
    history.forEach((s, i) => {
      const x = x0 + i * colW;
      if (x + colW < 0) return;
      for (const l of [...s.bids, ...s.asks]) {
        const t = Math.log1p(l.size) / Math.log1p(maxSize);
        const [r, g, b] = heatColor(t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y(l.price) - rowH / 2, Math.ceil(colW), rowH);
      }
    });
    // Mid trace
    ctx.strokeStyle = '#ffa028';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    history.forEach((s, i) => {
      const m = (s.bids[0].price + s.asks[0].price) / 2;
      const px = x0 + (i + 0.5) * colW;
      if (i === 0) ctx.moveTo(px, y(m));
      else ctx.lineTo(px, y(m));
    });
    ctx.stroke();
  }, [history, w, h]);

  return (
    <div ref={ref} className="depth-view heat" data-testid="heatmap">
      <canvas ref={canvas} style={{ width: w, height: h, display: 'block' }} />
      {range && (
        <>
          <span className="heat-axis top mono">{fmtPrice(range[1])}</span>
          <span className="heat-axis bottom mono">{fmtPrice(range[0])}</span>
        </>
      )}
      <span className="heat-legend mono">
        LOW <span className="heat-ramp" /> HIGH · {history.length} SNAPS
      </span>
    </div>
  );
}
