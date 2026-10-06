import type { Side } from '@/types';

export interface RiskReward {
  /** USDT lost if the stop is hit (positive number). */
  risk: number;
  /** USDT gained if the target is hit (positive number). */
  reward: number;
  /** Reward-to-risk ratio; null when risk is zero or levels are on the wrong side. */
  rr: number | null;
  /** Risk as a percentage of account equity. */
  riskPct: number;
}

/** Pre-trade risk readout for a ticket or position. */
export function riskReward(side: Side, entry: number, tp: number, sl: number, size: number, equity: number): RiskReward {
  const dir = side === 'Long' ? 1 : -1;
  const reward = Math.max(0, (tp - entry) * dir * size);
  const risk = Math.max(0, (entry - sl) * dir * size);
  return { risk, reward, rr: risk > 0 && reward > 0 ? reward / risk : null, riskPct: equity > 0 ? (risk / equity) * 100 : 0 };
}

/** P/L expressed in multiples of initial risk (R). */
export function rMultiple(side: Side, entry: number, sl: number, current: number): number | null {
  const dir = side === 'Long' ? 1 : -1;
  const r = (entry - sl) * dir;
  if (!(r > 0)) return null;
  return ((current - entry) * dir) / r;
}

/** Compact duration: 45s, 12m, 3h 05m, 2d 4h. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
