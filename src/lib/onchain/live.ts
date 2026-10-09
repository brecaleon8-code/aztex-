/**
 * Live lookups through public endpoints — no API keys: EVM JSON-RPC (Ethereum, Arbitrum, Base,
 * Polygon, BNB), mempool.space (Bitcoin) and Solana JSON-RPC. Public RPCs don't index history, so
 * some fields (wallet activity, EVM holder lists) are unavailable here and say so; production adds
 * an indexer. Tron needs an API key and isn't wired for Live mode.
 */
import type { ActivityItem, AddressDetail, BlockDetail, ContractInfo, Holding, NetworkId, OnchainProvider, TokenDetail, TokenRef, TokenTransfer, TxDetail } from './types';
import { NETWORK } from './networks';
import { TOKENS, findToken } from './tokens';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export class RpcError extends Error {}

/* ── Encoding helpers ─────────────────────────────────────────────────────────────────────── */

export const hexToBig = (h: string | null | undefined): bigint => (h && h !== '0x' ? BigInt(h) : 0n);
export const hexToNum = (h: string | null | undefined): number => Number(hexToBig(h));

/** bigint base units → decimal number (exact up to float precision of the result). */
export function formatUnits(v: bigint, decimals: number): number {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const d = 10n ** BigInt(decimals);
  const n = Number(a / d) + Number(a % d) / Number(d);
  return neg ? -n : n;
}

/** Decode an ABI `string` return (or a legacy bytes32 like MKR's symbol). */
export function decodeAbiString(hex: string): string | null {
  const h = hex?.startsWith('0x') ? hex.slice(2) : hex;
  if (!h) return null;
  const bytesToStr = (s: string) => {
    const bytes = s.match(/../g)?.map((b) => parseInt(b, 16)).filter((b) => b !== 0) ?? [];
    return new TextDecoder().decode(new Uint8Array(bytes)).trim() || null;
  };
  if (h.length === 64) return bytesToStr(h); // bytes32
  if (h.length < 128) return null;
  const off = Number(BigInt('0x' + h.slice(0, 64))) * 2;
  const len = Number(BigInt('0x' + h.slice(off, off + 64))) * 2;
  return bytesToStr(h.slice(off + 64, off + 64 + len));
}

const pad32 = (addr: string) => addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const topicAddr = (t: string) => '0x' + t.slice(-40);

const SEL = { name: '0x06fdde03', symbol: '0x95d89b41', decimals: '0x313ce567', totalSupply: '0x18160ddd', balanceOf: '0x70a08231' };
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const KNOWN_METHODS: Record<string, string> = {
  '0xa9059cbb': 'transfer(address,uint256)',
  '0x095ea7b3': 'approve(address,uint256)',
  '0x23b872dd': 'transferFrom(address,address,uint256)',
  '0x3593564c': 'execute(bytes,bytes[],uint256)',
  '0x7ff36ab5': 'swapExactETHForTokens(uint256,address[],address,uint256)',
  '0x38ed1739': 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
  '0xd0e30db0': 'deposit()',
  '0x2e1a7d4d': 'withdraw(uint256)',
};
const SPL_TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/* ── Provider ─────────────────────────────────────────────────────────────────────────────── */

export class LiveOnchainProvider implements OnchainProvider {
  readonly id = 'live' as const;
  readonly label = 'Live (public RPC)';
  private seq = 0;
  constructor(private fetcher: Fetch = (u, i) => fetch(u, i)) {}

  private endpoint(network: NetworkId): string {
    const n = NETWORK[network];
    if (!n.rpc) throw new RpcError(`${n.name} isn't available in Live mode (needs an API key) — switch to Simulated`);
    return n.rpc;
  }

  private async rpc<T>(network: NetworkId, method: string, params: unknown[]): Promise<T> {
    const url = this.endpoint(network);
    let res: Response;
    try {
      res = await this.fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++this.seq, method, params }) });
    } catch (e) {
      throw new RpcError(`Couldn't reach ${new URL(url).host}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) throw new RpcError(`${new URL(url).host} answered HTTP ${res.status}${res.status === 429 ? ' (rate limited — try again shortly)' : ''}`);
    const j = (await res.json()) as { result?: T; error?: { message: string } };
    if (j.error) throw new RpcError(`${method}: ${j.error.message}`);
    return j.result as T;
  }

  private async rest<T>(network: NetworkId, path: string, text = false): Promise<T | null> {
    const url = this.endpoint(network) + path;
    let res: Response;
    try {
      res = await this.fetcher(url);
    } catch (e) {
      throw new RpcError(`Couldn't reach ${new URL(url).host}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new RpcError(`${new URL(url).host} answered HTTP ${res.status}`);
    return (text ? await res.text() : await res.json()) as T;
  }

  async getTip(network: NetworkId): Promise<number | null> {
    const k = NETWORK[network].kind;
    if (k === 'evm') return hexToNum(await this.rpc<string>(network, 'eth_blockNumber', []));
    if (k === 'utxo') {
      const t = await this.rest<string>(network, '/blocks/tip/height', true);
      return t == null ? null : Number(t);
    }
    if (k === 'solana') return await this.rpc<number>(network, 'getSlot', []);
    return null;
  }

  /* EVM ------------------------------------------------------------------------------------ */

  private async erc20Meta(network: NetworkId, address: string): Promise<{ name: string | null; symbol: string | null; decimals: number | null; totalSupply: bigint | null }> {
    const call = (data: string) => this.rpc<string>(network, 'eth_call', [{ to: address, data }, 'latest']).catch(() => '0x');
    const [name, symbol, dec, ts] = await Promise.all([call(SEL.name), call(SEL.symbol), call(SEL.decimals), call(SEL.totalSupply)]);
    return { name: decodeAbiString(name), symbol: decodeAbiString(symbol), decimals: dec && dec !== '0x' ? hexToNum(dec) : null, totalSupply: ts && ts !== '0x' ? hexToBig(ts) : null };
  }

  private async tokenRef(network: NetworkId, address: string): Promise<TokenRef> {
    const known = findToken(network, address);
    if (known) return known;
    const m = await this.erc20Meta(network, address);
    return { network, address, symbol: m.symbol ?? '???', name: m.name ?? 'Unknown token', decimals: m.decimals ?? 18, priceSymbol: null };
  }

  private async evmTx(network: NetworkId, hash: string): Promise<TxDetail | null> {
    type Tx = { hash: string; from: string; to: string | null; value: string; blockNumber: string | null; gasPrice?: string; nonce: string; input: string };
    type Rc = { status: string; gasUsed: string; effectiveGasPrice?: string; contractAddress: string | null; logs: { address: string; topics: string[]; data: string }[] };
    const tx = await this.rpc<Tx | null>(network, 'eth_getTransactionByHash', [hash]);
    if (!tx) return null;
    const [rc, tip] = await Promise.all([tx.blockNumber ? this.rpc<Rc | null>(network, 'eth_getTransactionReceipt', [hash]) : Promise.resolve(null), this.getTip(network)]);
    const block = tx.blockNumber ? hexToNum(tx.blockNumber) : null;
    const blk = block != null ? await this.rpc<{ timestamp: string } | null>(network, 'eth_getBlockByNumber', [tx.blockNumber, false]) : null;
    const gasPriceWei = hexToBig(rc?.effectiveGasPrice ?? tx.gasPrice ?? '0x0');
    const gasUsed = rc ? hexToNum(rc.gasUsed) : null;
    const transferLogs = (rc?.logs ?? []).filter((l) => l.topics[0]?.toLowerCase() === TRANSFER_TOPIC && l.topics.length === 3).slice(0, 12);
    const transfers: TokenTransfer[] = [];
    for (const l of transferLogs) {
      const token = await this.tokenRef(network, l.address);
      transfers.push({ token, from: topicAddr(l.topics[1]), to: topicAddr(l.topics[2]), amount: formatUnits(hexToBig(l.data), token.decimals) });
    }
    const sel = tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10).toLowerCase() : null;
    return {
      network,
      hash: tx.hash,
      status: !rc ? 'pending' : rc.status === '0x1' ? 'success' : 'failed',
      block,
      time: blk ? hexToNum(blk.timestamp) * 1000 : null,
      confirmations: block != null && tip != null ? tip - block + 1 : 0,
      from: tx.from,
      to: tx.to,
      value: formatUnits(hexToBig(tx.value), 18),
      fee: gasUsed != null ? formatUnits(gasPriceWei * BigInt(gasUsed), 18) : null,
      gasUsed,
      gasPrice: formatUnits(gasPriceWei, 9),
      nonce: hexToNum(tx.nonce),
      method: sel ? { selector: sel, name: KNOWN_METHODS[sel] ?? null } : null,
      transfers,
      createsContract: rc?.contractAddress ?? null,
    };
  }

  private async evmAddress(network: NetworkId, address: string): Promise<AddressDetail> {
    const [bal, nonce, code] = await Promise.all([
      this.rpc<string>(network, 'eth_getBalance', [address, 'latest']),
      this.rpc<string>(network, 'eth_getTransactionCount', [address, 'latest']),
      this.rpc<string>(network, 'eth_getCode', [address, 'latest']),
    ]);
    const isContract = !!code && code !== '0x';
    // Token balances for the well-known tokens on this chain (one eth_call each).
    const known = TOKENS.filter((t) => t.network === network);
    const balances = await Promise.all(known.map((t) => this.rpc<string>(network, 'eth_call', [{ to: t.address, data: SEL.balanceOf + pad32(address) }, 'latest']).catch(() => '0x')));
    const holdings: Holding[] = known.map((t, i) => ({ token: t, amount: formatUnits(hexToBig(balances[i]), t.decimals) })).filter((h) => h.amount > 0);
    let contract: ContractInfo | null = null;
    if (isContract) {
      const m = await this.erc20Meta(network, address);
      const isToken = m.symbol != null && m.decimals != null && m.totalSupply != null;
      contract = {
        standard: isToken ? 'ERC-20' : 'Unknown',
        verified: null,
        name: m.name,
        reads: isToken ? ['name()', 'symbol()', 'decimals()', 'totalSupply()', 'balanceOf(address)'] : [],
        token: isToken ? await this.tokenRef(network, address) : null,
      };
    }
    return { network, address, kind: isContract ? 'contract' : 'wallet', balance: formatUnits(hexToBig(bal), 18), txCount: hexToNum(nonce), holdings, activity: null, firstSeen: null, lastSeen: null, contract };
  }

  private async evmBlock(network: NetworkId, id: string | number): Promise<BlockDetail | null> {
    type B = { number: string; hash: string; timestamp: string; transactions: string[]; miner: string; gasUsed: string; gasLimit: string; baseFeePerGas?: string; size?: string };
    const isHash = typeof id === 'string' && /^0x[0-9a-f]{64}$/i.test(id);
    const b = isHash ? await this.rpc<B | null>(network, 'eth_getBlockByHash', [id, false]) : await this.rpc<B | null>(network, 'eth_getBlockByNumber', ['0x' + Number(id).toString(16), false]);
    if (!b) return null;
    return {
      network,
      height: hexToNum(b.number),
      hash: b.hash,
      time: hexToNum(b.timestamp) * 1000,
      txCount: b.transactions.length,
      producer: b.miner,
      gasUsed: hexToNum(b.gasUsed),
      gasLimit: hexToNum(b.gasLimit),
      baseFee: b.baseFeePerGas ? formatUnits(hexToBig(b.baseFeePerGas), 9) : null,
      sizeBytes: b.size ? hexToNum(b.size) : null,
      reward: null,
      topTxs: null,
    };
  }

  private async evmToken(network: NetworkId, address: string): Promise<TokenDetail | null> {
    const m = await this.erc20Meta(network, address);
    if (m.symbol == null || m.decimals == null) return null;
    const token = await this.tokenRef(network, address);
    return {
      token,
      totalSupply: m.totalSupply != null ? formatUnits(m.totalSupply, m.decimals) : null,
      holders: null,
      top: null,
      transfers24h: null,
      volume24h: null,
      contract: { standard: 'ERC-20', verified: null, name: m.name, reads: ['name()', 'symbol()', 'decimals()', 'totalSupply()', 'balanceOf(address)'], token },
    };
  }

  /* Bitcoin (Esplora) ------------------------------------------------------------------------ */

  private async btcTx(hash: string): Promise<TxDetail | null> {
    type V = { scriptpubkey_address?: string; value: number };
    type T = { txid: string; fee: number; status: { confirmed: boolean; block_height?: number; block_time?: number }; vin: { prevout: V | null }[]; vout: V[] };
    const t = await this.rest<T>('bitcoin', `/tx/${hash}`);
    if (!t) return null;
    const tip = t.status.confirmed ? await this.getTip('bitcoin') : null;
    const ins = t.vin.filter((v) => v.prevout).map((v) => ({ address: v.prevout!.scriptpubkey_address ?? '(non-standard)', value: v.prevout!.value / 1e8 }));
    const outs = t.vout.map((v) => ({ address: v.scriptpubkey_address ?? '(OP_RETURN / non-standard)', value: v.value / 1e8 }));
    return {
      network: 'bitcoin',
      hash: t.txid,
      status: t.status.confirmed ? 'success' : 'pending',
      block: t.status.block_height ?? null,
      time: t.status.block_time ? t.status.block_time * 1000 : null,
      confirmations: t.status.confirmed && tip != null && t.status.block_height != null ? tip - t.status.block_height + 1 : 0,
      from: ins[0]?.address ?? '(coinbase)',
      to: outs[0]?.address ?? null,
      value: outs.reduce((s, o) => s + o.value, 0),
      fee: t.fee / 1e8,
      transfers: [],
      ins,
      outs,
    };
  }

  private async btcAddress(address: string): Promise<AddressDetail | null> {
    type S = { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
    const a = await this.rest<{ address: string; chain_stats: S; mempool_stats: S }>('bitcoin', `/address/${address}`);
    if (!a) return null;
    type T = { txid: string; status: { block_time?: number }; vin: { prevout: { scriptpubkey_address?: string; value: number } | null }[]; vout: { scriptpubkey_address?: string; value: number }[] };
    const txs = (await this.rest<T[]>('bitcoin', `/address/${address}/txs`)) ?? [];
    const activity: ActivityItem[] = txs.slice(0, 15).map((t) => {
      const spent = t.vin.filter((v) => v.prevout?.scriptpubkey_address === address).reduce((s, v) => s + (v.prevout?.value ?? 0), 0);
      const recv = t.vout.filter((v) => v.scriptpubkey_address === address).reduce((s, v) => s + v.value, 0);
      const net = recv - spent;
      const other = net >= 0 ? t.vin.find((v) => v.prevout?.scriptpubkey_address !== address)?.prevout?.scriptpubkey_address : t.vout.find((v) => v.scriptpubkey_address !== address)?.scriptpubkey_address;
      return { hash: t.txid, time: (t.status.block_time ?? Date.now() / 1000) * 1000, direction: net > 0 ? 'in' : net < 0 ? 'out' : 'self', counterparty: other ?? '', amount: Math.abs(net) / 1e8, symbol: 'BTC' };
    });
    const bal = a.chain_stats.funded_txo_sum - a.chain_stats.spent_txo_sum + a.mempool_stats.funded_txo_sum - a.mempool_stats.spent_txo_sum;
    return { network: 'bitcoin', address, kind: 'wallet', balance: bal / 1e8, txCount: a.chain_stats.tx_count + a.mempool_stats.tx_count, holdings: null, activity, firstSeen: null, lastSeen: activity[0]?.time ?? null, contract: null };
  }

  private async btcBlock(id: string | number): Promise<BlockDetail | null> {
    const hash = typeof id === 'number' || /^\d+$/.test(String(id)) ? await this.rest<string>('bitcoin', `/block-height/${id}`, true) : String(id);
    if (!hash) return null;
    const b = await this.rest<{ id: string; height: number; timestamp: number; tx_count: number; size: number }>('bitcoin', `/block/${hash}`);
    if (!b) return null;
    return { network: 'bitcoin', height: b.height, hash: b.id, time: b.timestamp * 1000, txCount: b.tx_count, producer: null, sizeBytes: b.size, reward: null, topTxs: null };
  }

  /* Solana ----------------------------------------------------------------------------------- */

  private async solTx(sig: string): Promise<TxDetail | null> {
    type Ix = { program?: string; programId?: string; parsed?: { type?: string; info?: Record<string, unknown> } };
    type T = { slot: number; blockTime: number | null; meta: { err: unknown; fee: number; preBalances: number[]; postBalances: number[] } | null; transaction: { message: { accountKeys: { pubkey: string }[]; instructions: Ix[] } } };
    const t = await this.rpc<T | null>('solana', 'getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
    if (!t) return null;
    const tip = await this.getTip('solana');
    const keys = t.transaction.message.accountKeys.map((k) => k.pubkey);
    const transfers: TokenTransfer[] = [];
    let value = 0;
    let to: string | null = null;
    for (const ix of t.transaction.message.instructions) {
      const info = ix.parsed?.info ?? {};
      if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
        value += Number(info.lamports ?? 0) / 1e9;
        to ??= String(info.destination ?? '');
      } else if (ix.program === 'spl-token' && (ix.parsed?.type === 'transferChecked' || ix.parsed?.type === 'transfer')) {
        const mint = String(info.mint ?? '');
        const ta = info.tokenAmount as { uiAmount?: number } | undefined;
        const token = findToken('solana', mint) ?? { network: 'solana' as const, symbol: mint ? mint.slice(0, 4) + '…' : 'SPL', name: 'SPL token', address: mint, decimals: 0, priceSymbol: null };
        transfers.push({ token, from: String(info.authority ?? info.source ?? ''), to: String(info.destination ?? ''), amount: ta?.uiAmount ?? Number(info.amount ?? 0) });
      }
    }
    return {
      network: 'solana',
      hash: sig,
      status: t.meta?.err ? 'failed' : 'success',
      block: t.slot,
      time: t.blockTime ? t.blockTime * 1000 : null,
      confirmations: tip != null ? tip - t.slot + 1 : null,
      from: keys[0] ?? '',
      to: to ?? keys[1] ?? null,
      value,
      fee: t.meta ? t.meta.fee / 1e9 : null,
      transfers,
    };
  }

  private async solAddress(address: string): Promise<AddressDetail | null> {
    type Acc = { value: { lamports: number; owner: string; executable: boolean; data: { parsed?: { type?: string; info?: { decimals?: number; supply?: string } } } | unknown } | null };
    const [bal, acc] = await Promise.all([this.rpc<{ value: number }>('solana', 'getBalance', [address]), this.rpc<Acc>('solana', 'getAccountInfo', [address, { encoding: 'jsonParsed' }])]);
    const v = acc.value;
    const parsed = (v?.data as { parsed?: { type?: string; info?: { decimals?: number; supply?: string } } } | undefined)?.parsed;
    const isMint = v?.owner === SPL_TOKEN && parsed?.type === 'mint';
    let holdings: Holding[] | null = null;
    if (!v || (!v.executable && !isMint)) {
      type TA = { value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null; decimals: number } } } } } }[] };
      const ta = await this.rpc<TA>('solana', 'getTokenAccountsByOwner', [address, { programId: SPL_TOKEN }, { encoding: 'jsonParsed' }]).catch(() => null);
      holdings = (ta?.value ?? [])
        .map((x) => x.account.data.parsed.info)
        .filter((i) => (i.tokenAmount.uiAmount ?? 0) > 0)
        .map((i) => ({ token: findToken('solana', i.mint) ?? { network: 'solana' as const, symbol: i.mint.slice(0, 4) + '…', name: 'SPL token', address: i.mint, decimals: i.tokenAmount.decimals, priceSymbol: null }, amount: i.tokenAmount.uiAmount ?? 0 }));
    }
    const sigs = await this.rpc<{ signature: string; blockTime: number | null }[]>('solana', 'getSignaturesForAddress', [address, { limit: 10 }]).catch(() => []);
    const activity: ActivityItem[] = sigs.map((s) => ({ hash: s.signature, time: (s.blockTime ?? 0) * 1000, direction: 'unknown', counterparty: '', amount: 0, symbol: 'SOL' }));
    const token = isMint ? findToken('solana', address) ?? { network: 'solana' as const, symbol: address.slice(0, 4) + '…', name: 'SPL token', address, decimals: parsed?.info?.decimals ?? 0, priceSymbol: null } : null;
    return {
      network: 'solana',
      address,
      kind: v?.executable || isMint ? 'contract' : 'wallet',
      balance: bal.value / 1e9,
      txCount: null,
      holdings,
      activity,
      firstSeen: null,
      lastSeen: activity[0]?.time || null,
      contract: v?.executable ? { standard: 'Unknown', verified: null, name: null, reads: [], token: null } : isMint ? { standard: 'SPL Token', verified: null, name: token?.name ?? null, reads: ['getTokenSupply', 'getTokenLargestAccounts'], token } : null,
    };
  }

  private async solBlock(slot: number): Promise<BlockDetail | null> {
    const b = await this.rpc<{ blockhash: string; blockTime: number | null; blockHeight: number | null; signatures?: string[] } | null>('solana', 'getBlock', [slot, { transactionDetails: 'signatures', rewards: false, maxSupportedTransactionVersion: 0 }]);
    if (!b) return null;
    return { network: 'solana', height: slot, hash: b.blockhash, time: (b.blockTime ?? 0) * 1000, txCount: b.signatures?.length ?? 0, producer: null, topTxs: null };
  }

  private async solToken(mint: string): Promise<TokenDetail | null> {
    const supply = await this.rpc<{ value: { uiAmount: number | null; decimals: number } }>('solana', 'getTokenSupply', [mint]).catch(() => null);
    if (!supply) return null;
    // Largest token accounts — real top-holder data from plain RPC (token accounts, not owners).
    const largest = await this.rpc<{ value: { address: string; uiAmount: number | null }[] }>('solana', 'getTokenLargestAccounts', [mint]).catch(() => null);
    const total = supply.value.uiAmount ?? 0;
    const token = findToken('solana', mint) ?? { network: 'solana' as const, symbol: mint.slice(0, 4) + '…', name: 'SPL token', address: mint, decimals: supply.value.decimals, priceSymbol: null };
    return {
      token,
      totalSupply: total,
      holders: null,
      top: largest ? largest.value.map((a) => ({ address: a.address, amount: a.uiAmount ?? 0, share: total ? (a.uiAmount ?? 0) / total : 0 })) : null,
      transfers24h: null,
      volume24h: null,
      contract: { standard: 'SPL Token', verified: null, name: token.name, reads: ['getTokenSupply', 'getTokenLargestAccounts'], token },
    };
  }

  /* Dispatch --------------------------------------------------------------------------------- */

  async getTx(network: NetworkId, hash: string) {
    const k = NETWORK[network].kind;
    if (k === 'evm') return this.evmTx(network, hash);
    if (k === 'utxo') return this.btcTx(hash);
    if (k === 'solana') return this.solTx(hash);
    this.endpoint(network);
    return null;
  }
  async getAddress(network: NetworkId, address: string) {
    const k = NETWORK[network].kind;
    if (k === 'evm') return this.evmAddress(network, address);
    if (k === 'utxo') return this.btcAddress(address);
    if (k === 'solana') return this.solAddress(address);
    this.endpoint(network);
    return null;
  }
  async getBlock(network: NetworkId, id: string | number) {
    const k = NETWORK[network].kind;
    if (k === 'evm') return this.evmBlock(network, id);
    if (k === 'utxo') return this.btcBlock(id);
    if (k === 'solana') return this.solBlock(Number(id));
    this.endpoint(network);
    return null;
  }
  async getToken(network: NetworkId, address: string) {
    const k = NETWORK[network].kind;
    if (k === 'evm') return this.evmToken(network, address);
    if (k === 'solana') return this.solToken(address);
    this.endpoint(network);
    return null;
  }
}

