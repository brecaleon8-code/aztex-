import type { FeeSample, NetworkId } from './types';
import type { ClassifiedTransfer } from './flows';
import { FLOW_LABEL } from './flows';
import { NETWORK } from './networks';

export type AlertKind = 'wallet' | 'large_transfer' | 'fee_spike' | 'token_activity';

interface RuleBase {
  id: string;
  enabled: boolean;
  createdAt: number;
  hits: number;
  lastHit: number | null;
}
export interface WalletRule extends RuleBase {
  kind: 'wallet';
  network: NetworkId | '*';
  address: string;
  name?: string;
  direction: 'any' | 'in' | 'out';
  minUsd: number;
}
export interface LargeTransferRule extends RuleBase {
  kind: 'large_transfer';
  network: NetworkId | '*';
  /** Token symbol, or '*' for any. */
  symbol: string;
  minUsd: number;
  /** Only exchange in/outflows. */
  exchangeOnly: boolean;
}
export interface FeeSpikeRule extends RuleBase {
  kind: 'fee_spike';
  network: NetworkId;
  /** 'above': absolute level in the network's fee unit; 'pct': % above the rolling median. */
  mode: 'above' | 'pct';
  value: number;
}
export interface TokenActivityRule extends RuleBase {
  kind: 'token_activity';
  network: NetworkId;
  tokenAddress: string;
  symbol: string;
  metric: 'count' | 'volume';
  /** Standard deviations above the baseline per minute. */
  z: number;
}
export type AlertRule = WalletRule | LargeTransferRule | FeeSpikeRule | TokenActivityRule;

export interface AlertHit {
  id: string;
  ruleId: string;
  kind: AlertKind;
  time: number;
  title: string;
  detail: string;
  network: NetworkId;
  hash?: string;
}

/** Fee spikes re-arm after this long; transfer rules fire per transfer. */
export const FEE_COOLDOWN_MS = 120_000;

const usd = (v: number) => `$${v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v.toFixed(0)}`;
const same = (a: string, b: string) => (a.startsWith('0x') ? a.toLowerCase() === b.toLowerCase() : a === b);

export function matchTransfer(rule: AlertRule, t: ClassifiedTransfer): Omit<AlertHit, 'id' | 'ruleId'> | null {
  if (!rule.enabled) return null;
  if (rule.kind === 'wallet') {
    if (rule.network !== '*' && rule.network !== t.network) return null;
    const out = same(t.from, rule.address);
    const inn = same(t.to, rule.address);
    if (!out && !inn) return null;
    if ((rule.direction === 'out' && !out) || (rule.direction === 'in' && !inn)) return null;
    if (t.usd < rule.minUsd) return null;
    const name = rule.name || `${rule.address.slice(0, 6)}…${rule.address.slice(-4)}`;
    return { kind: 'wallet', time: t.time, network: t.network, hash: t.hash, title: `Watched wallet ${out ? 'sent' : 'received'} funds · ${name}`, detail: `${t.observed} · ${usd(t.usd)} on ${NETWORK[t.network].name}` };
  }
  if (rule.kind === 'large_transfer') {
    if (rule.network !== '*' && rule.network !== t.network) return null;
    if (rule.symbol !== '*' && rule.symbol !== t.token.symbol) return null;
    if (t.usd < rule.minUsd) return null;
    if (rule.exchangeOnly && t.kind !== 'exchange_inflow' && t.kind !== 'exchange_outflow') return null;
    return { kind: 'large_transfer', time: t.time, network: t.network, hash: t.hash, title: `Large ${t.token.symbol} transfer · ${usd(t.usd)}`, detail: `${FLOW_LABEL[t.kind]} · ${t.observed}` };
  }
  return null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** `history` = earlier samples for the same network (the baseline); the current sample is excluded. */
export function matchFee(rule: AlertRule, sample: FeeSample, history: FeeSample[]): Omit<AlertHit, 'id' | 'ruleId'> | null {
  if (rule.kind !== 'fee_spike' || !rule.enabled || rule.network !== sample.network) return null;
  if (rule.lastHit != null && sample.time - rule.lastHit < FEE_COOLDOWN_MS) return null;
  const n = NETWORK[sample.network];
  const fmt = (v: number) => `${v < 10 ? v.toFixed(2) : v.toFixed(0)} ${n.feeUnit}`;
  if (rule.mode === 'above') {
    if (sample.value < rule.value) return null;
    return { kind: 'fee_spike', time: sample.time, network: sample.network, title: `${n.name} fees above ${fmt(rule.value)}`, detail: `Now ${fmt(sample.value)}` };
  }
  const med = median(history.slice(-60).map((h) => h.value));
  if (med == null || history.length < 10 || !(med > 0)) return null;
  const pct = (sample.value / med - 1) * 100;
  if (pct < rule.value) return null;
  return { kind: 'fee_spike', time: sample.time, network: sample.network, title: `${n.name} fee spike +${pct.toFixed(0)}%`, detail: `Now ${fmt(sample.value)} vs median ${fmt(med)}` };
}

/* ── Unusual token activity ─────────────────────────────────────────────────────────────── */

interface Bucket {
  start: number;
  count: number;
  volume: number;
}
interface Stats {
  n: number;
  meanC: number;
  varC: number;
  meanV: number;
  varV: number;
}
export interface ActivityState {
  open: Record<string, Bucket>;
  stats: Record<string, Stats>;
}
export interface ClosedBucket {
  key: string;
  start: number;
  count: number;
  volume: number;
  /** z-scores vs the baseline before this bucket (null while warming up). */
  zCount: number | null;
  zVolume: number | null;
}

export const ACTIVITY_BUCKET_MS = 60_000;
const WARMUP = 6;
const ALPHA = 0.2;

export const tokenKey = (network: NetworkId, address: string, symbol: string) => `${network}:${address ? address.toLowerCase() : symbol}`;

/**
 * Per-token activity buckets with an EWMA baseline. Recording a transfer that lands in a new bucket
 * closes the previous one and scores it against the baseline; empty minutes in between count as
 * zero activity. Pure: returns the next state.
 */
export function recordActivity(state: ActivityState, key: string, time: number, usdAmount: number, bucketMs = ACTIVITY_BUCKET_MS): { state: ActivityState; closed: ClosedBucket[] } {
  const start = Math.floor(time / bucketMs) * bucketMs;
  const open = { ...state.open };
  const stats = { ...state.stats };
  const closed: ClosedBucket[] = [];
  const cur = open[key];
  if (!cur) open[key] = { start, count: 1, volume: usdAmount };
  else if (start <= cur.start) open[key] = { ...cur, count: cur.count + 1, volume: cur.volume + usdAmount };
  else {
    let s = stats[key] ?? { n: 0, meanC: 0, varC: 0, meanV: 0, varV: 0 };
    const score = (b: Bucket) => {
      const z = (x: number, m: number, v: number) => (s.n >= WARMUP ? (x - m) / Math.sqrt(Math.max(v, 1e-9)) : null);
      closed.push({ key, start: b.start, count: b.count, volume: b.volume, zCount: z(b.count, s.meanC, Math.max(s.varC, 0.25)), zVolume: z(b.volume, s.meanV, Math.max(s.varV, (s.meanV * 0.1) ** 2)) });
      const upd = (m: number, v: number, x: number) => {
        if (s.n === 0) return [x, 0];
        const d = x - m;
        const nm = m + ALPHA * d;
        return [nm, (1 - ALPHA) * (v + ALPHA * d * d)];
      };
      const [mc, vc] = upd(s.meanC, s.varC, b.count);
      const [mv, vv] = upd(s.meanV, s.varV, b.volume);
      s = { n: s.n + 1, meanC: mc, varC: vc, meanV: mv, varV: vv };
    };
    score(cur);
    // Quiet minutes between the last bucket and this one are real zero-activity observations.
    const gaps = Math.min(30, Math.max(0, Math.round((start - cur.start) / bucketMs) - 1));
    for (let g = 1; g <= gaps; g++) score({ start: cur.start + g * bucketMs, count: 0, volume: 0 });
    stats[key] = s;
    open[key] = { start, count: 1, volume: usdAmount };
  }
  return { state: { open, stats }, closed };
}

export function matchActivity(rule: AlertRule, b: ClosedBucket): Omit<AlertHit, 'id' | 'ruleId'> | null {
  if (rule.kind !== 'token_activity' || !rule.enabled) return null;
  if (b.key !== tokenKey(rule.network, rule.tokenAddress, rule.symbol)) return null;
  const z = rule.metric === 'count' ? b.zCount : b.zVolume;
  if (z == null || z < rule.z) return null;
  return {
    kind: 'token_activity',
    time: b.start,
    network: rule.network,
    title: `Unusual ${rule.symbol} activity · ${z.toFixed(1)}σ`,
    detail: rule.metric === 'count' ? `${b.count} transfers in a minute — far above the usual rate` : `${usd(b.volume)} moved in a minute — far above the usual volume`,
  };
}
