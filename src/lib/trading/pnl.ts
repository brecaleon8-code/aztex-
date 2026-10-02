import type { Side } from '@/types';

export function unrealizedPnl(side: Side, entry: number, current: number, size: number): number {
  return (side === 'Long' ? current - entry : entry - current) * size;
}

export function pnlPct(side: Side, entry: number, current: number): number {
  if (!entry) return 0;
  return ((side === 'Long' ? current - entry : entry - current) / entry) * 100;
}

/** Signed % distance of a level from entry, as shown under TP/SL inputs. */
export function pctFromEntry(level: number, entry: number): number {
  return entry ? ((level - entry) / entry) * 100 : 0;
}

export const TP_OFFSET = 0.032;
export const SL_OFFSET = 0.016;

/** Suggested TP/SL: ±3.2% / ±1.6% from entry, direction depending on side. */
export function suggestedLevels(side: Side, entry: number): { tp: number; sl: number } {
  return side === 'Long'
    ? { tp: entry * (1 + TP_OFFSET), sl: entry * (1 - SL_OFFSET) }
    : { tp: entry * (1 - TP_OFFSET), sl: entry * (1 + SL_OFFSET) };
}

/** Where `current` sits on the SL→entry→TP bar, 0 = SL, 0.5 = entry, 1 = TP (clamped). */
export function progressOnRange(side: Side, sl: number, entry: number, tp: number, current: number): number {
  const sign = side === 'Long' ? 1 : -1;
  const d = (current - entry) * sign;
  if (d >= 0) {
    const toTp = (tp - entry) * sign;
    return toTp > 0 ? 0.5 + Math.min(1, d / toTp) * 0.5 : 0.5;
  }
  const toSl = (entry - sl) * sign;
  return toSl > 0 ? 0.5 - Math.min(1, -d / toSl) * 0.5 : 0.5;
}

export function levelHit(side: Side, tp: number, sl: number, price: number): { tp: boolean; sl: boolean } {
  return side === 'Long' ? { tp: price >= tp, sl: price <= sl } : { tp: price <= tp, sl: price >= sl };
}

export type SizingMode = 'pct' | 'usdt';

/** Position size (base qty) from sizing mode: % of equity or a flat USDT notional. */
export function positionSize(mode: SizingMode, value: number, equity: number, price: number): { notional: number; size: number } {
  if (!(price > 0) || !(value > 0)) return { notional: 0, size: 0 };
  const notional = mode === 'pct' ? (equity * Math.min(value, 100)) / 100 : value;
  return { notional, size: notional / price };
}
