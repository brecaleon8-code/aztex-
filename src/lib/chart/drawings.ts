import type { Candle, DataPoint, Drawing } from '@/types';
import { fibLevels, type XScale, type YScale } from './scale';

/** Pixel distance from (px,py) to the segment (x1,y1)–(x2,y2). */
export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Topmost drawing under the pointer (drawings placed in the chart's index space), or null. */
export function hitDrawing(drawings: Drawing[], x: number, y: number, xs: XScale, ys: YScale, plotW: number, tol = 6): Drawing | null {
  for (let k = drawings.length - 1; k >= 0; k--) {
    const d = drawings[k];
    const x1 = xs.toX(d.p1.index);
    const y1 = ys.toY(d.p1.price);
    const x2 = d.p2 ? xs.toX(d.p2.index) : x1;
    const y2 = d.p2 ? ys.toY(d.p2.price) : y1;
    let hit = false;
    switch (d.tool) {
      case 'trend':
        hit = distToSegment(x, y, x1, y1, x2, y2) <= tol;
        break;
      case 'ray':
        hit = Math.abs(y - y1) <= tol && x >= x1 - tol && x <= plotW;
        break;
      case 'rect':
        hit = x >= Math.min(x1, x2) - tol && x <= Math.max(x1, x2) + tol && y >= Math.min(y1, y2) - tol && y <= Math.max(y1, y2) + tol;
        break;
      case 'fib':
        hit = !!d.p2 && x >= Math.min(x1, x2) - tol && x <= plotW && fibLevels(d.p1.price, d.p2.price).some((l) => Math.abs(ys.toY(l.price) - y) <= tol);
        break;
      case 'text':
        hit = x >= x1 - tol && x <= x1 + (d.text?.length ?? 0) * 7 + tol && y >= y1 - 14 && y <= y1 + tol;
        break;
      case 'brush': {
        const pts = d.points ?? [];
        for (let i = 1; i < pts.length && !hit; i++) hit = distToSegment(x, y, xs.toX(pts[i - 1].index), ys.toY(pts[i - 1].price), xs.toX(pts[i].index), ys.toY(pts[i].price)) <= tol;
        break;
      }
    }
    if (hit) return d;
  }
  return null;
}

/** Moves a drawing by whole bars and a price delta, keeping time anchors in step. */
export function shiftDrawing(d: Drawing, dIndex: number, dPrice: number, tfMs: number | null): Drawing {
  const mv = (p: DataPoint): DataPoint => ({ index: p.index + dIndex, price: p.price + dPrice, ...(p.time != null && tfMs != null ? { time: p.time + dIndex * tfMs } : {}) });
  return { ...d, p1: mv(d.p1), ...(d.p2 ? { p2: mv(d.p2) } : {}), ...(d.points ? { points: d.points.map(mv) } : {}) };
}

/** Magnet: snap to the nearest open/high/low/close of the candle under the pointer when it's close. */
export function snapToOhlc(p: DataPoint, y: number, candles: Candle[], ys: YScale, radius = 28): DataPoint {
  const i = Math.round(p.index);
  const c = candles[i];
  if (!c) return p;
  let best = p.price;
  let bestD = radius;
  for (const v of [c.open, c.high, c.low, c.close]) {
    const dist = Math.abs(ys.toY(v) - y);
    if (dist <= bestD) {
      bestD = dist;
      best = v;
    }
  }
  return best === p.price ? p : { ...p, index: i, price: best };
}

/** "45m", "2h 30m", "3d 4h" for a measured span. */
export function fmtSpan(ms: number): string {
  const m = Math.round(Math.abs(ms) / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return mm ? `${h}h ${mm}m` : `${h}h`;
  return `${mm}m`;
}

/** Ruler readout between two points: price change, % change, bars and (time-based charts) duration. */
export function measure(a: DataPoint, b: DataPoint, tfMs: number | null) {
  const dPrice = b.price - a.price;
  const bars = Math.round(b.index - a.index);
  return { dPrice, pct: a.price ? (dPrice / a.price) * 100 : 0, bars, span: tfMs == null ? null : fmtSpan(bars * tfMs) };
}
