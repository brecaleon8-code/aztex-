/**
 * Rule-based strategy backtester. Rules are formulas (see lib/indicators/formula) evaluated on the
 * full candle history. Execution model, chosen to avoid look-ahead bias:
 *  - a rule that is true on bar i fills at the OPEN of bar i+1;
 *  - TP/SL are checked intrabar from the fill bar onward; if both are touched in one bar the stop
 *    is assumed first (conservative);
 *  - fees are charged per side on every fill.
 */
import type { Candle, Side } from '@/types';
import { compile, evaluate } from '@/lib/indicators/formula';

export interface StrategyDef {
  id: string;
  name: string;
  side: Side;
  entry: string;
  exit?: string;
  /** Take-profit / stop-loss distance from fill, in percent (0 or undefined = off). */
  tpPct?: number;
  slPct?: number;
  color: string;
}

export type ExitReason = 'signal' | 'tp' | 'sl' | 'end';
export interface BtTrade {
  side: Side;
  entryIndex: number;
  exitIndex: number;
  entryPrice: number;
  exitPrice: number;
  reason: ExitReason;
  /** Net return of the trade after fees, in percent. */
  returnPct: number;
}

export interface BtStats {
  trades: number;
  winRate: number; // %
  netPct: number; // compounded, %
  avgTradePct: number;
  profitFactor: number | null;
  maxDrawdownPct: number; // positive number, %
  exposurePct: number; // % of bars in a position
  buyHoldPct: number;
}

export type BtResult = { ok: true; trades: BtTrade[]; equity: number[]; stats: BtStats } | { ok: false; error: string; field: 'entry' | 'exit' };

const truthy = (v: number | null | undefined) => v != null && v !== 0;

export function backtest(def: StrategyDef, candles: Candle[], feeRate = 0.0006): BtResult {
  const entryC = compile(def.entry);
  if (!entryC.ok) return { ok: false, error: entryC.error, field: 'entry' };
  let exitSig: (number | null)[] | null = null;
  if (def.exit && def.exit.trim()) {
    const exitC = compile(def.exit);
    if (!exitC.ok) return { ok: false, error: exitC.error, field: 'exit' };
    exitSig = evaluate(exitC.ast, candles);
  }
  const entrySig = evaluate(entryC.ast, candles);
  const n = candles.length;
  const dir = def.side === 'Long' ? 1 : -1;
  const tp = def.tpPct && def.tpPct > 0 ? def.tpPct / 100 : null;
  const sl = def.slPct && def.slPct > 0 ? def.slPct / 100 : null;

  // 1) Walk the bars and record trades.
  const trades: BtTrade[] = [];
  let i = 0;
  while (i < n - 1) {
    if (!truthy(entrySig[i])) {
      i++;
      continue;
    }
    const e = i + 1; // fill at next open
    const entryPrice = candles[e].open;
    const tpPx = tp != null ? entryPrice * (1 + dir * tp) : null;
    const slPx = sl != null ? entryPrice * (1 - dir * sl) : null;
    let exitIndex = n - 1;
    let exitPrice = candles[n - 1].close;
    let reason: ExitReason = 'end';
    for (let j = e; j < n; j++) {
      const c = candles[j];
      const hitSl = slPx != null && (dir === 1 ? c.low <= slPx : c.high >= slPx);
      const hitTp = tpPx != null && (dir === 1 ? c.high >= tpPx : c.low <= tpPx);
      if (hitSl || hitTp) {
        exitIndex = j;
        // Gapping through a level fills at the open, otherwise at the level. Stop wins ties.
        if (hitSl) exitPrice = dir === 1 ? Math.min(c.open, slPx!) : Math.max(c.open, slPx!);
        else exitPrice = dir === 1 ? Math.max(c.open, tpPx!) : Math.min(c.open, tpPx!);
        reason = hitSl ? 'sl' : 'tp';
        break;
      }
      if (exitSig && truthy(exitSig[j]) && j + 1 < n) {
        exitIndex = j + 1;
        exitPrice = candles[j + 1].open;
        reason = 'signal';
        break;
      }
    }
    const gross = dir * (exitPrice / entryPrice - 1);
    const net = (1 - feeRate) * (1 + gross) * (1 - feeRate) - 1;
    trades.push({ side: def.side, entryIndex: e, exitIndex, entryPrice, exitPrice, reason, returnPct: net * 100 });
    if (reason === 'end') break;
    // A signal exit fills at bar exitIndex's open, so that bar may itself fire a new entry.
    i = reason === 'signal' ? exitIndex : exitIndex + 1;
  }

  // 2) Mark-to-market equity curve (starts at 1).
  const equity: number[] = new Array(n).fill(1);
  let eq = 1;
  let t = 0;
  let inBars = 0;
  for (let k = 0; k < n; k++) {
    const tr = trades[t];
    if (tr && k >= tr.entryIndex && k <= tr.exitIndex) {
      inBars++;
      if (k === tr.exitIndex) {
        eq *= 1 + tr.returnPct / 100;
        equity[k] = eq;
        t++;
      } else equity[k] = eq * (1 - feeRate) * (1 + dir * (candles[k].close / tr.entryPrice - 1));
    } else equity[k] = eq;
  }
  const flat = equity;

  const wins = trades.filter((t) => t.returnPct > 0);
  const gains = wins.reduce((s, t) => s + t.returnPct, 0);
  const losses = trades.filter((t) => t.returnPct <= 0).reduce((s, t) => s + t.returnPct, 0);
  let peak = 1;
  let mdd = 0;
  for (const v of flat) {
    peak = Math.max(peak, v);
    mdd = Math.max(mdd, (peak - v) / peak);
  }
  const net = trades.reduce((acc, t) => acc * (1 + t.returnPct / 100), 1);
  return {
    ok: true,
    trades,
    equity: flat,
    stats: {
      trades: trades.length,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      netPct: (net - 1) * 100,
      avgTradePct: trades.length ? trades.reduce((s, t) => s + t.returnPct, 0) / trades.length : 0,
      profitFactor: losses < 0 ? gains / -losses : null,
      maxDrawdownPct: mdd * 100,
      exposurePct: n ? (inBars / n) * 100 : 0,
      buyHoldPct: n > 1 ? (candles[n - 1].close / candles[0].open - 1) * 100 : 0,
    },
  };
}

/** Starter strategies shown in Studio. */
export const STRATEGY_TEMPLATES: Omit<StrategyDef, 'id' | 'color'>[] = [
  { name: 'EMA 9/21 trend', side: 'Long', entry: 'cross_over(ema(close, 9), ema(close, 21))', exit: 'cross_under(ema(close, 9), ema(close, 21))', tpPct: 0, slPct: 1.5 },
  { name: 'RSI mean reversion', side: 'Long', entry: 'cross_over(rsi(close, 14), 30)', exit: 'rsi(close, 14) > 60', tpPct: 1.2, slPct: 0.8 },
  { name: 'Donchian breakout', side: 'Long', entry: 'close > prev(highest(high, 20), 1)', exit: 'close < prev(lowest(low, 10), 1)', tpPct: 0, slPct: 1 },
  { name: 'Fade the spike (short)', side: 'Short', entry: 'close > sma(close, 20) * 1.006 and rsi(close, 7) > 75', exit: 'close < sma(close, 20)', tpPct: 0.8, slPct: 0.6 },
];
