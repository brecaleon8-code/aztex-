/** Linear scales between data coordinates (candle index, price) and SVG pixel coordinates. */
export interface XScale {
  start: number; // first visible index
  count: number; // visibleCount
  width: number; // plot width in px
  candleWidth: number;
  toX(index: number): number; // centre of candle
  toIndex(x: number): number; // fractional -> nearest index
}

export function makeXScale(start: number, count: number, width: number): XScale {
  const candleWidth = width / Math.max(1, count);
  return {
    start,
    count,
    width,
    candleWidth,
    toX: (index) => (index - start + 0.5) * candleWidth,
    toIndex: (x) => Math.round(x / candleWidth - 0.5 + start),
  };
}

export interface YScale {
  min: number;
  max: number;
  top: number;
  bottom: number;
  toY(price: number): number;
  toPrice(y: number): number;
}

export function makeYScale(min: number, max: number, top: number, bottom: number, padRatio = 0.08): YScale {
  let lo = min;
  let hi = max;
  if (!(hi > lo)) {
    const c = Number.isFinite(lo) ? lo : 0;
    const d = Math.abs(c) * 0.01 || 1;
    lo = c - d;
    hi = c + d;
  }
  const pad = (hi - lo) * padRatio;
  lo -= pad;
  hi += pad;
  const span = bottom - top;
  return {
    min: lo,
    max: hi,
    top,
    bottom,
    toY: (p) => bottom - ((p - lo) / (hi - lo)) * span,
    toPrice: (y) => lo + ((bottom - y) / span) * (hi - lo),
  };
}

/** "Nice" tick values for a price axis. */
export function niceTicks(min: number, max: number, target = 6): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/** Fib retracement prices from p1 (0%) to p2 (100%). */
export function fibLevels(p1: number, p2: number): { level: number; price: number }[] {
  return FIB_LEVELS.map((level) => ({ level, price: p1 + (p2 - p1) * level }));
}

/** SVG path for a right-axis "flag" price tag: a pointer on the left, rounded body. */
export function flagPath(x: number, y: number, w: number, h: number): string {
  const t = h / 2;
  const r = 3;
  return [
    `M${x},${y}`,
    `L${x + t},${y - t}`,
    `L${x + w - r},${y - t}`,
    `Q${x + w},${y - t} ${x + w},${y - t + r}`,
    `L${x + w},${y + t - r}`,
    `Q${x + w},${y + t} ${x + w - r},${y + t}`,
    `L${x + t},${y + t}`,
    'Z',
  ].join(' ');
}

/** Builds an SVG polyline path for a series over the visible window, breaking on nulls. */
export function linePath(values: (number | null)[], x: XScale, y: YScale, start: number, end: number): string {
  let d = '';
  let pen = false;
  for (let i = Math.max(0, start); i < Math.min(values.length, end); i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${x.toX(i).toFixed(2)},${y.toY(v).toFixed(2)}`;
    pen = true;
  }
  return d;
}
