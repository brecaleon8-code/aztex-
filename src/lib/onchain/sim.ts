/**
 * Simulated chain data. Lookups are deterministic per (network, query) so the same hash always shows
 * the same transaction; streams (large transfers, fees) are random. Everything produced here is
 * labelled as simulated in the UI.
 */
import { hashSeed, mulberry32, pick } from '@/lib/mock/rng';
import type { AddressDetail, BlockDetail, ChainTransfer, EntityType, FeeSample, Label, NetworkId, OnchainProvider, TokenDetail, TokenRef, TxDetail } from './types';
import { NETWORK, NETWORKS } from './networks';
import { TOKENS, findToken, nativeToken, usdPrice } from './tokens';
import { labelFor } from './labels';

const HEX = '0123456789abcdef';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BECH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const chars = (r: () => number, set: string, n: number) => Array.from({ length: n }, () => set[Math.floor(r() * set.length)]).join('');

export function simAddress(network: NetworkId, r: () => number): string {
  const k = NETWORK[network].kind;
  if (k === 'evm') return '0x' + chars(r, HEX, 40);
  if (k === 'utxo') return 'bc1q' + chars(r, BECH, 38);
  if (k === 'tron') return 'T' + chars(r, B58, 33);
  return chars(r, B58, 44);
}
export function simHash(network: NetworkId, r: () => number): string {
  const k = NETWORK[network].kind;
  if (k === 'evm') return '0x' + chars(r, HEX, 64);
  if (k === 'solana') return chars(r, B58, 88);
  return chars(r, HEX, 64);
}

/* ── Entities: the cast of the simulated flow feed ─────────────────────────────────────────── */

const ENTITY_NAMES: [string, EntityType, number][] = [
  ['Binance Hot', 'exchange', 2],
  ['Binance Cold', 'exchange', 1],
  ['Coinbase Prime', 'exchange', 2],
  ['Kraken Hot', 'exchange', 1],
  ['OKX Hot', 'exchange', 1],
  ['Bybit Hot', 'exchange', 1],
  ['Bitfinex Cold', 'exchange', 1],
  ['Wormhole Bridge', 'bridge', 1],
  ['Canonical Bridge', 'bridge', 1],
  ['Uniswap Router', 'defi', 1],
  ['Aave Pool', 'defi', 1],
  ['Wintermute', 'fund', 1],
  ['Jump Trading', 'fund', 1],
  ['Tether Treasury', 'team', 1],
  ['Circle Treasury', 'team', 1],
];

export interface Entity {
  address: string;
  label: Label;
}

const entityCache = new Map<NetworkId, Entity[]>();
/** Deterministic entity wallets per network (simulator labels — not real addresses). */
export function simEntities(network: NetworkId): Entity[] {
  const hit = entityCache.get(network);
  if (hit) return hit;
  const out: Entity[] = [];
  for (const [name, type, n] of ENTITY_NAMES) {
    for (let i = 0; i < n; i++) {
      const address = simAddress(network, mulberry32(hashSeed(`ent:${network}:${name}:${i}`)));
      out.push({ address, label: { address, network, name: n > 1 ? `${name} ${i + 1}` : name, type, source: 'sim' } });
    }
  }
  entityCache.set(network, out);
  return out;
}
const whaleCache = new Map<NetworkId, string[]>();
/** Recurring unlabelled large wallets, so watching one sees it move again. */
export function simWhales(network: NetworkId): string[] {
  const hit = whaleCache.get(network);
  if (hit) return hit;
  const out = Array.from({ length: 24 }, (_, i) => simAddress(network, mulberry32(hashSeed(`whale:${network}:${i}`))));
  whaleCache.set(network, out);
  return out;
}
export const simLabels = (): Label[] => NETWORKS.flatMap((n) => simEntities(n.id).map((e) => e.label));

/* ── Chain tips (anchored to plausible heights so numbers look sane) ───────────────────────── */

const ANCHOR = Date.UTC(2024, 0, 1);
const TIP0: Record<NetworkId, number> = { ethereum: 18_908_900, bitcoin: 823_790, solana: 239_000_000, arbitrum: 166_000_000, base: 8_700_000, polygon: 51_800_000, bnb: 34_800_000, tron: 57_400_000 };
export function simTip(network: NetworkId, now = Date.now()): number {
  return TIP0[network] + Math.floor((now - ANCHOR) / 1000 / NETWORK[network].blockTimeSec);
}
const blockTime = (network: NetworkId, height: number, now = Date.now()) => now - (simTip(network, now) - height) * NETWORK[network].blockTimeSec * 1000;

const SELECTORS: [string, string][] = [
  ['0xa9059cbb', 'transfer(address,uint256)'],
  ['0x095ea7b3', 'approve(address,uint256)'],
  ['0x23b872dd', 'transferFrom(address,address,uint256)'],
  ['0x3593564c', 'execute(bytes,bytes[],uint256)'],
  ['0x617ba037', 'supply(address,uint256,address,uint16)'],
  ['0x', ''],
];

const fixedPrices: Record<string, number> = { BTC: 62_000, ETH: 3_100, SOL: 148, MATIC: 0.55, LINK: 14, BNB: 560 };
/** Nominal prices for tokens the app has no market feed for — used only to size simulated amounts. */
const NOMINAL: Record<string, number> = { UNI: 7, PEPE: 0.0000098, SHIB: 0.000017, ARB: 0.6, BONK: 0.00002, BNB: 560, TRX: 0.12 };

export class SimOnchainProvider implements OnchainProvider {
  readonly id = 'sim' as const;
  readonly label = 'Simulated';
  constructor(private prices: () => Record<string, number> = () => fixedPrices) {}

  async getTip(network: NetworkId) {
    return simTip(network);
  }

  async getTx(network: NetworkId, hash: string): Promise<TxDetail | null> {
    const r = mulberry32(hashSeed(`tx:${network}:${hash.toLowerCase()}`));
    const n = NETWORK[network];
    const tip = simTip(network);
    const pending = r() < 0.03;
    const block = pending ? null : tip - Math.floor(r() * 400_000 * Math.pow(r(), 3));
    const status = pending ? 'pending' : r() < 0.04 ? 'failed' : 'success';
    const from = simAddress(network, r);
    const to = simAddress(network, r);
    const nt = nativeToken(network);
    const usdP = usdPrice(nt, this.prices()) ?? 1;
    const value = n.kind === 'utxo' ? (10_000 * Math.exp(r() * 5)) / usdP : r() < 0.5 ? 0 : (2_000 * Math.exp(r() * 5)) / usdP;
    const tokensHere = TOKENS.filter((t) => t.network === network);
    const transfers = n.kind !== 'utxo' && value === 0 && tokensHere.length ? Array.from({ length: 1 + Math.floor(r() * 2) }, () => ({ token: pick(r, tokensHere), from, to: simAddress(network, r), amount: 1_000 * Math.exp(r() * 7) })) : [];
    const sel = n.kind === 'evm' ? (transfers.length ? SELECTORS[0] : pick(r, SELECTORS)) : null;
    const base: TxDetail = {
      network,
      hash,
      status,
      block,
      time: block == null ? null : blockTime(network, block),
      confirmations: block == null ? 0 : tip - block + 1,
      from,
      to: n.kind === 'utxo' ? to : transfers.length ? (transfers[0].token.address as string) : to,
      value,
      fee: n.kind === 'utxo' ? (200 + r() * 4000) / 1e8 : n.kind === 'evm' ? (21_000 + r() * 180_000) * (2 + r() * 30) * 1e-9 : 0.000005 + r() * 0.0001,
      transfers,
    };
    if (n.kind === 'evm') {
      base.gasUsed = Math.round(21_000 + r() * 180_000);
      base.gasPrice = +(2 + r() * 30).toFixed(2);
      base.nonce = Math.floor(r() * 5000);
      base.method = sel && sel[0] !== '0x' ? { selector: sel[0], name: sel[1] } : null;
    }
    if (n.kind === 'utxo') {
      const outs = 1 + Math.floor(r() * 3);
      base.ins = [{ address: from, value: value + (base.fee ?? 0) + r() * 0.01 }];
      base.outs = Array.from({ length: outs }, (_, i) => ({ address: i === 0 ? to : simAddress(network, r), value: i === 0 ? value : r() * 0.01 }));
    }
    return base;
  }

  async getAddress(network: NetworkId, address: string): Promise<AddressDetail | null> {
    const r = mulberry32(hashSeed(`addr:${network}:${address.toLowerCase()}`));
    const n = NETWORK[network];
    const token = findToken(network, address);
    const nt = nativeToken(network);
    const usdP = usdPrice(nt, this.prices()) ?? 1;
    const isContract = !!token || (n.caps.contracts && r() < 0.18);
    const entity = simEntities(network).find((e) => e.address === address)?.label ?? labelFor(address, network);
    const rich = entity?.type === 'exchange' ? 400 : 1;
    // Size holdings in USD first so amounts are plausible for each token's price.
    const holdings = n.caps.tokens
      ? TOKENS.filter((t) => t.network === network && r() < 0.6).map((t) => {
          const px = usdPrice(t, this.prices()) ?? NOMINAL[t.symbol] ?? 1;
          return { token: t, amount: (500 * Math.exp(r() * 8) * rich) / px };
        })
      : null;
    const now = Date.now();
    const activity = Array.from({ length: 10 }, (_, i) => {
      const dir = r() < 0.5 ? 'in' : 'out';
      return { hash: simHash(network, r), time: now - (i + r()) * 3_600_000 * (1 + r() * 6), direction: dir as 'in' | 'out', counterparty: simAddress(network, r), amount: (500 * Math.exp(r() * 6)) / usdP, symbol: nt.symbol };
    }).sort((a, b) => b.time - a.time);
    return {
      network,
      address,
      kind: isContract ? 'contract' : 'wallet',
      balance: ((isContract ? 50 : 2_000) * Math.exp(r() * 8) * rich) / usdP,
      txCount: Math.floor(Math.exp(r() * 9) * (rich > 1 ? 50 : 1)),
      holdings,
      activity,
      firstSeen: now - (30 + r() * 1500) * 86_400_000,
      lastSeen: activity[0].time,
      contract: isContract
        ? { standard: token ? (n.kind === 'solana' ? 'SPL Token' : n.kind === 'tron' ? 'TRC-20' : 'ERC-20') : pick(r, ['Proxy', 'Router', 'ERC-721', 'Unknown'] as const), verified: token ? true : r() < 0.7, name: token?.name ?? null, reads: token ? ['name()', 'symbol()', 'decimals()', 'totalSupply()', 'balanceOf(address)'] : ['owner()'], token: token ?? null }
        : null,
    };
  }

  async getBlock(network: NetworkId, id: string | number): Promise<BlockDetail | null> {
    const tip = simTip(network);
    const height = typeof id === 'number' || /^\d+$/.test(String(id)) ? Number(id) : tip - (hashSeed(String(id)) % 50_000);
    if (!(height >= 0) || height > tip) return null;
    const r = mulberry32(hashSeed(`blk:${network}:${height}`));
    const n = NETWORK[network];
    const nt = nativeToken(network);
    const usdP = usdPrice(nt, this.prices()) ?? 1;
    const txCount = n.kind === 'utxo' ? 1500 + Math.floor(r() * 3500) : n.kind === 'solana' ? 800 + Math.floor(r() * 2500) : 80 + Math.floor(r() * 300);
    const gasLimit = n.kind === 'evm' ? 30_000_000 : null;
    return {
      network,
      height,
      hash: typeof id === 'string' && !/^\d+$/.test(id) ? id : n.kind === 'utxo' ? '00000000000000000' + chars(r, HEX, 47) : simHash(network, r),
      time: blockTime(network, height),
      txCount,
      producer: n.kind === 'utxo' ? pick(r, ['Foundry USA', 'AntPool', 'ViaBTC', 'F2Pool', 'MARA Pool']) : simAddress(network, r),
      gasUsed: gasLimit ? Math.round(gasLimit * (0.35 + r() * 0.6)) : null,
      gasLimit,
      baseFee: n.kind === 'evm' ? +(1 + r() * 25).toFixed(2) : null,
      sizeBytes: Math.round(40_000 + r() * 1_500_000),
      reward: n.kind === 'utxo' ? 3.125 + r() * 0.2 : n.kind === 'evm' ? r() * 0.08 : null,
      topTxs: Array.from({ length: 6 }, () => ({ hash: simHash(network, r), value: (20_000 * Math.exp(r() * 5)) / usdP, from: simAddress(network, r), to: simAddress(network, r) })),
    };
  }

  async getToken(network: NetworkId, address: string): Promise<TokenDetail | null> {
    const token = findToken(network, address);
    if (!token) return null;
    const r = mulberry32(hashSeed(`tok:${network}:${address.toLowerCase()}`));
    const stable = token.priceSymbol === 'USD';
    const supply = stable ? 5e9 + r() * 6e10 : token.symbol === 'PEPE' || token.symbol === 'SHIB' || token.symbol === 'BONK' ? 4e14 + r() * 5e14 : 1e7 + r() * 1e9;
    const ents = simEntities(network);
    // Long-tailed top-holder list mixing exchanges, bridges, treasuries and unlabelled whales.
    let remaining = supply * (0.35 + r() * 0.45);
    // Distinct holders: a shuffled slice of entities first, then recurring whales.
    const pool = [...ents.map((e) => e.address)].sort(() => r() - 0.5).slice(0, 8);
    const whales = simWhales(network);
    const top = Array.from({ length: 25 }, (_, i) => {
      const amt = remaining * (0.12 + r() * 0.2);
      remaining -= amt;
      const who = i < pool.length && r() < 0.6 ? pool[i] : whales[i % whales.length];
      return { address: who, amount: amt, share: amt / supply };
    })
      .filter((h, i, all) => all.findIndex((x) => x.address === h.address) === i)
      .sort((a, b) => b.amount - a.amount);
    return {
      token,
      totalSupply: supply,
      holders: Math.floor(Math.exp(8 + r() * 7)),
      top,
      transfers24h: Math.floor(Math.exp(6 + r() * 6)),
      volume24h: (stable ? 1 : 0.2) * supply * (0.005 + r() * 0.05),
      contract: { standard: NETWORK[network].kind === 'solana' ? 'SPL Token' : NETWORK[network].kind === 'tron' ? 'TRC-20' : 'ERC-20', verified: true, name: token.name, reads: ['name()', 'symbol()', 'decimals()', 'totalSupply()', 'balanceOf(address)'], token },
    };
  }
}

/* ── Streams: large transfers + fees ──────────────────────────────────────────────────────── */

interface Lane {
  network: NetworkId;
  token: TokenRef;
  weight: number;
}
const LANES: Lane[] = [
  { network: 'bitcoin', token: nativeToken('bitcoin'), weight: 3 },
  { network: 'ethereum', token: nativeToken('ethereum'), weight: 3 },
  { network: 'ethereum', token: TOKENS[0], weight: 4 },
  { network: 'ethereum', token: TOKENS[1], weight: 3 },
  { network: 'tron', token: TOKENS.find((t) => t.network === 'tron')!, weight: 4 },
  { network: 'solana', token: nativeToken('solana'), weight: 2 },
  { network: 'solana', token: TOKENS.find((t) => t.network === 'solana' && t.symbol === 'USDC')!, weight: 2 },
  { network: 'ethereum', token: TOKENS.find((t) => t.symbol === 'LINK')!, weight: 1 },
  { network: 'ethereum', token: TOKENS.find((t) => t.symbol === 'PEPE')!, weight: 1 },
  { network: 'arbitrum', token: TOKENS.find((t) => t.network === 'arbitrum' && t.symbol === 'USDC')!, weight: 1 },
  { network: 'base', token: TOKENS.find((t) => t.network === 'base')!, weight: 1 },
  { network: 'bnb', token: TOKENS.find((t) => t.network === 'bnb')!, weight: 1 },
];
const TOTAL_W = LANES.reduce((s, l) => s + l.weight, 0);

let seq = 0;

/** One large on-chain transfer between labelled entities and recurring whales. */
export function simTransfer(prices: Record<string, number>, r: () => number = Math.random, now = Date.now(), lane?: Lane): ChainTransfer {
  let x = r() * TOTAL_W;
  const l = lane ?? LANES.find((ln) => (x -= ln.weight) < 0) ?? LANES[0];
  const ents = simEntities(l.network);
  const whales = simWhales(l.network);
  const ex = ents.filter((e) => e.label.type === 'exchange');
  const stable = l.token.priceSymbol === 'USD';
  const roll = r();
  let from: string;
  let to: string;
  if (stable && roll < 0.08) {
    from = ents.find((e) => e.label.type === 'team')!.address;
    to = pick(r, ex).address;
  } else if (roll < 0.36) {
    from = pick(r, whales);
    to = pick(r, ex).address;
  } else if (roll < 0.66) {
    from = pick(r, ex).address;
    to = pick(r, whales);
  } else if (roll < 0.74) {
    const a = pick(r, ex);
    from = a.address;
    to = pick(r, ex.filter((e) => e !== a)).address;
  } else if (roll < 0.84) {
    from = pick(r, whales);
    to = pick(r, ents.filter((e) => e.label.type === 'bridge' || e.label.type === 'defi')).address;
  } else {
    from = pick(r, whales);
    to = pick(r, whales.filter((w) => w !== from));
  }
  const usdP = usdPrice(l.token, prices) ?? NOMINAL[l.token.symbol] ?? 1;
  const usdAmt = 250_000 * Math.exp(r() * 3.6) * (r() < 0.08 ? 15 : 1);
  return { id: `ct${now.toString(36)}${(seq++).toString(36)}`, network: l.network, hash: simHash(l.network, r), time: now, token: l.token, amount: usdAmt / usdP, usd: usdAmt, from, to };
}

/** A burst of many smaller transfers in one token — what "unusual activity" alerts look for. */
export function simBurst(prices: Record<string, number>, r: () => number = Math.random, now = Date.now()): ChainTransfer[] {
  const lane = pick(r, LANES.filter((l) => l.token.address));
  const n = 12 + Math.floor(r() * 14);
  return Array.from({ length: n }, (_, i) => simTransfer(prices, r, now - (n - i) * 900, lane));
}

const FEE_BASE: Record<NetworkId, number> = { ethereum: 12, bitcoin: 8, solana: 0.00002, arbitrum: 0.02, base: 0.01, polygon: 40, bnb: 1, tron: 420 };
export const FEE_NETWORKS: NetworkId[] = ['ethereum', 'bitcoin', 'solana', 'arbitrum', 'base', 'polygon', 'bnb', 'tron'];

/** Mean-reverting fee walk with occasional congestion spikes. */
export function simFee(network: NetworkId, prev: number | null, r: () => number = Math.random, now = Date.now()): FeeSample {
  const base = FEE_BASE[network];
  const p = prev ?? base;
  let v = p + (base - p) * 0.15 + base * (r() - 0.5) * 0.25;
  if (r() < 0.012) v = p * (2.2 + r() * 2.5);
  return { network, time: now, value: Math.max(base * 0.2, +v.toPrecision(4)) };
}
