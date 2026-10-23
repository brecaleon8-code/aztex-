/**
 * Chart viewport: a window into the full candle series, never a truncated copy.
 * viewEnd is an exclusive index into the full series; the window is [viewEnd - visibleCount, viewEnd).
 */
export interface Viewport {
  visibleCount: number;
  viewEnd: number;
}

export const MIN_VISIBLE = 8;
export const ZOOM_IN = 0.83;
export const ZOOM_OUT = 1.2;

export function clampViewport(vp: Viewport, total: number): Viewport {
  const maxCount = Math.max(1, total);
  const visibleCount = Math.round(Math.min(maxCount, Math.max(Math.min(MIN_VISIBLE, maxCount), vp.visibleCount)));
  const viewEnd = Math.round(Math.min(total, Math.max(visibleCount, vp.viewEnd)));
  return { visibleCount, viewEnd };
}

export function isLive(vp: Viewport, total: number): boolean {
  return vp.viewEnd >= total;
}

/** Multiplicative zoom, anchored on the right edge (latest candle) so live stays live. */
export function zoom(vp: Viewport, factor: number, total: number): Viewport {
  return clampViewport({ visibleCount: vp.visibleCount * factor, viewEnd: vp.viewEnd }, total);
}

export interface PanState {
  vp: Viewport;
  /** Sub-candle pixel remainder carried between drag events. */
  acc: number;
}

/**
 * Pixel-accumulator pan. Every pixel of drag delta is accumulated; whole-candle steps are taken
 * only once the accumulator crosses one candle width, and the remainder is kept. A fixed
 * per-event threshold felt sticky — this makes slow drags as smooth as fast ones.
 * Dragging right (dx > 0) moves back in time.
 */
export function pan(state: PanState, dxPixels: number, candleWidth: number, total: number): PanState {
  if (candleWidth <= 0) return state;
  const acc = state.acc + dxPixels;
  const steps = acc > 0 ? Math.floor(acc / candleWidth) : Math.ceil(acc / candleWidth);
  if (steps === 0) return { vp: state.vp, acc };
  const next = clampViewport({ visibleCount: state.vp.visibleCount, viewEnd: state.vp.viewEnd - steps }, total);
  const applied = state.vp.viewEnd - next.viewEnd;
  // If we hit an edge, drop the remainder so reversing direction responds immediately.
  const remainder = applied === steps ? acc - steps * candleWidth : 0;
  return { vp: next, acc: remainder };
}

/** When a new candle is appended, follow the live edge only if we were already at it. */
export function onSeriesGrow(vp: Viewport, prevTotal: number, total: number): Viewport {
  if (vp.viewEnd >= prevTotal) return clampViewport({ ...vp, viewEnd: total }, total);
  return clampViewport(vp, total);
}

/**
 * Two-finger pinch. `ratio` is the current finger spread over the spread at the start (> 1 zooms
 * in); `anchor` is where the pinch centre sits across the plot (0 = left, 1 = right). A live view
 * stays pinned to the latest candle; otherwise the candle under the fingers stays put.
 */
export function pinchZoom(vp0: Viewport, ratio: number, anchor: number, total: number): Viewport {
  if (!(ratio > 0)) return clampViewport(vp0, total);
  const count = vp0.visibleCount / ratio;
  if (isLive(vp0, total)) return clampViewport({ visibleCount: count, viewEnd: vp0.viewEnd }, total);
  const a = Math.min(1, Math.max(0, anchor));
  const pivot = vp0.viewEnd - vp0.visibleCount + a * vp0.visibleCount;
  return clampViewport({ visibleCount: count, viewEnd: pivot + (1 - a) * count }, total);
}

/** Bars to show by default: fewer on a narrow (phone) plot so candles stay wide enough to read and tap. */
export function defaultBarsFor(base: number, plotW: number): number {
  if (!(plotW > 0) || plotW >= 420) return base;
  return Math.min(base, Math.max(24, Math.round(plotW / 7)));
}
