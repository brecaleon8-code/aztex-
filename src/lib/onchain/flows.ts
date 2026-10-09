import type { ChainTransfer, Label } from './types';
import { labelFor } from './labels';

export type FlowKind = 'exchange_inflow' | 'exchange_outflow' | 'exchange_internal' | 'mint' | 'burn' | 'bridge' | 'defi' | 'wallet_transfer';

export interface ClassifiedTransfer extends ChainTransfer {
  kind: FlowKind;
  fromLabel: Label | null;
  toLabel: Label | null;
  /** What the chain shows — a fact. */
  observed: string;
  /** What it is often taken to mean — an interpretation, never presented as fact. */
  inferred: string | null;
}

export const FLOW_LABEL: Record<FlowKind, string> = {
  exchange_inflow: 'Exchange inflow',
  exchange_outflow: 'Exchange outflow',
  exchange_internal: 'Exchange internal',
  mint: 'Mint',
  burn: 'Burn',
  bridge: 'Bridge',
  defi: 'DeFi',
  wallet_transfer: 'Wallet → wallet',
};

const INFERENCE: Record<FlowKind, string | null> = {
  exchange_inflow: 'Deposits to exchanges often precede selling — but a deposit is not a sale (it may be collateral, OTC settlement or an internal move).',
  exchange_outflow: 'Withdrawals are often read as accumulation or self-custody — but a withdrawal is not a purchase.',
  exchange_internal: 'Likely the exchange rebalancing its own wallets — not market activity.',
  mint: 'New supply issued; freshly minted stablecoins often move to exchanges afterwards.',
  burn: 'Supply removed from circulation.',
  bridge: 'Cross-chain move, probably the same owner on both sides — not a trade.',
  defi: 'Interaction with a DeFi protocol (deposit, swap, loan) — the purpose isn’t visible from the transfer alone.',
  wallet_transfer: null,
};

const who = (l: Label | null, a: string) => (l ? l.name : `unlabelled ${a.slice(0, 6)}…${a.slice(-4)}`);

export function classifyTransfer(t: ChainTransfer, labels: Label[] = []): ClassifiedTransfer {
  const fromLabel = labelFor(t.from, t.network, labels);
  const toLabel = labelFor(t.to, t.network, labels);
  const fx = fromLabel?.type === 'exchange';
  const tx = toLabel?.type === 'exchange';
  let kind: FlowKind;
  if (fromLabel?.type === 'burn' || (fromLabel?.type === 'team' && /treasury|mint/i.test(fromLabel.name))) kind = 'mint';
  else if (toLabel?.type === 'burn') kind = 'burn';
  else if (fx && tx) kind = fromLabel!.name.split(' ')[0] === toLabel!.name.split(' ')[0] ? 'exchange_internal' : 'exchange_outflow';
  else if (tx) kind = 'exchange_inflow';
  else if (fx) kind = 'exchange_outflow';
  else if (fromLabel?.type === 'bridge' || toLabel?.type === 'bridge') kind = 'bridge';
  else if (fromLabel?.type === 'defi' || toLabel?.type === 'defi') kind = 'defi';
  else kind = 'wallet_transfer';
  const observed = `${t.amount.toLocaleString('en-US', { maximumFractionDigits: t.amount < 10 ? 4 : 0 })} ${t.token.symbol} from ${who(fromLabel, t.from)} to ${who(toLabel, t.to)}`;
  return { ...t, kind, fromLabel, toLabel, observed, inferred: INFERENCE[kind] };
}

export interface FlowBucket {
  start: number;
  inflow: number;
  outflow: number;
  net: number;
}

/** Exchange in/outflow in USD per time bucket (oldest first); net > 0 means coins went *to* exchanges. */
export function exchangeNetflow(ts: ClassifiedTransfer[], now: number, bucketMs: number, buckets: number, symbol?: string): FlowBucket[] {
  const first = Math.floor(now / bucketMs) * bucketMs - (buckets - 1) * bucketMs;
  const out: FlowBucket[] = Array.from({ length: buckets }, (_, i) => ({ start: first + i * bucketMs, inflow: 0, outflow: 0, net: 0 }));
  for (const t of ts) {
    if (symbol && t.token.symbol !== symbol && t.token.priceSymbol !== symbol) continue;
    const i = Math.floor((t.time - first) / bucketMs);
    if (i < 0 || i >= buckets) continue;
    if (t.kind === 'exchange_inflow') out[i].inflow += t.usd;
    else if (t.kind === 'exchange_outflow') out[i].outflow += t.usd;
  }
  for (const b of out) b.net = b.inflow - b.outflow;
  return out;
}

export interface Concentration {
  /** Share of total supply held by the top 10 listed holders. */
  top10: number;
  /** Herfindahl–Hirschman index over listed holders' supply shares (0 – 10,000). */
  hhi: number;
  /** Gini coefficient among the listed holders only. */
  gini: number;
  /** Fewest listed holders that together exceed 50% of supply (null if the list never gets there). */
  majority: number | null;
  /** Share of supply held by labelled exchanges among the listed holders. */
  onExchanges: number;
}

/** Holder concentration from a top-holder list. Exact for what's listed; the long tail is excluded. */
export function concentration(holders: { address: string; amount: number }[], totalSupply: number, labels: (a: string) => Label | null = () => null): Concentration | null {
  if (!(totalSupply > 0) || holders.length === 0) return null;
  const sorted = [...holders].sort((a, b) => b.amount - a.amount);
  const shares = sorted.map((h) => h.amount / totalSupply);
  const top10 = shares.slice(0, 10).reduce((s, x) => s + x, 0);
  const hhi = shares.reduce((s, x) => s + (x * 100) ** 2, 0);
  let acc = 0;
  let majority: number | null = null;
  for (let i = 0; i < shares.length; i++) {
    acc += shares[i];
    if (acc > 0.5) {
      majority = i + 1;
      break;
    }
  }
  // Gini over listed amounts (ascending formula).
  const asc = [...sorted].reverse().map((h) => h.amount);
  const n = asc.length;
  const sum = asc.reduce((s, x) => s + x, 0);
  const gini = n > 1 && sum > 0 ? asc.reduce((s, x, i) => s + (2 * (i + 1) - n - 1) * x, 0) / (n * sum) : 0;
  const onExchanges = sorted.reduce((s, h) => s + (labels(h.address)?.type === 'exchange' ? h.amount : 0), 0) / totalSupply;
  return { top10, hhi, gini, majority, onExchanges };
}
