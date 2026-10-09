import { describe, expect, it } from 'vitest';
import { parseQuery } from './query';
import { classifyTransfer, concentration, exchangeNetflow } from './flows';
import { matchActivity, matchFee, matchTransfer, recordActivity, tokenKey, type ActivityState, type AlertRule } from './alerts';
import { SimOnchainProvider, simEntities, simFee, simTransfer, simWhales } from './sim';
import { LiveOnchainProvider, decodeAbiString, formatUnits } from './live';
import { TOKENS, nativeToken, searchTokens } from './tokens';
import type { ChainTransfer, Label } from './types';

describe('query detection', () => {
  it('recognises hashes, addresses, blocks, tokens and names per chain', () => {
    expect(parseQuery('0x' + 'a'.repeat(64))).toMatchObject({ kind: 'tx', networks: expect.arrayContaining(['ethereum', 'base']) });
    expect(parseQuery('0x28C6c06298d514Db089934071355E5743bf21d60')).toMatchObject({ kind: 'address', networks: expect.arrayContaining(['ethereum', 'arbitrum', 'bnb']) });
    expect(parseQuery('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f')).toMatchObject({ kind: 'block', networks: ['bitcoin'] });
    expect(parseQuery('f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16')).toMatchObject({ kind: 'tx', networks: ['bitcoin', 'tron'] });
    expect(parseQuery('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toMatchObject({ kind: 'address', networks: ['bitcoin'] });
    expect(parseQuery('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toMatchObject({ kind: 'address', networks: ['bitcoin'] });
    expect(parseQuery('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toMatchObject({ kind: 'address', networks: ['tron'] });
    expect(parseQuery('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toMatchObject({ kind: 'address', networks: ['solana'] });
    expect(parseQuery('5'.repeat(88))).toMatchObject({ kind: 'tx', networks: ['solana'] });
    expect(parseQuery('840000')).toMatchObject({ kind: 'block' });
    expect(parseQuery('vitalik.eth')).toMatchObject({ kind: 'name', networks: ['ethereum'] });
    expect(parseQuery('usdc')).toMatchObject({ kind: 'token' });
    expect(parseQuery('')).toBeNull();
  });
  it('respects a network filter', () => {
    expect(parseQuery('0x28C6c06298d514Db089934071355E5743bf21d60', 'base')!.networks).toEqual(['base']);
    expect(parseQuery('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'ethereum')!.hint).toMatch(/not valid/);
  });
  it('searches tokens by symbol and name', () => {
    expect(searchTokens('usdc').map((t) => t.network)).toEqual(expect.arrayContaining(['ethereum', 'solana', 'base']));
    expect(searchTokens('tether', 'tron')[0].address).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
  });
});

const ex: Label[] = [
  { address: '0xex1', network: '*', name: 'Binance Hot 1', type: 'exchange', source: 'sim' },
  { address: '0xex2', network: '*', name: 'Binance Cold', type: 'exchange', source: 'sim' },
  { address: '0xcb', network: '*', name: 'Coinbase Prime', type: 'exchange', source: 'sim' },
  { address: '0xtreas', network: '*', name: 'Tether Treasury', type: 'team', source: 'sim' },
  { address: '0xbr', network: '*', name: 'Wormhole Bridge', type: 'bridge', source: 'sim' },
];
const usdt = TOKENS[0];
const tr = (from: string, to: string, usd = 1_000_000, time = 0): ChainTransfer => ({ id: from + to + time, network: 'ethereum', hash: '0xh', time, token: usdt, amount: usd, usd, from, to });

describe('flow classification', () => {
  it('separates observed facts from inferred meaning', () => {
    const inflow = classifyTransfer(tr('0xwhale', '0xcb'), ex);
    expect(inflow.kind).toBe('exchange_inflow');
    expect(inflow.observed).toMatch(/to Coinbase Prime/);
    expect(inflow.inferred).toMatch(/not a sale/);
    expect(classifyTransfer(tr('0xcb', '0xwhale'), ex)).toMatchObject({ kind: 'exchange_outflow', inferred: expect.stringMatching(/not a purchase/) });
    expect(classifyTransfer(tr('0xex1', '0xex2'), ex).kind).toBe('exchange_internal');
    expect(classifyTransfer(tr('0xex1', '0xcb'), ex).kind).toBe('exchange_outflow');
    expect(classifyTransfer(tr('0xtreas', '0xcb'), ex).kind).toBe('mint');
    expect(classifyTransfer(tr('0xwhale', '0xbr'), ex).kind).toBe('bridge');
    expect(classifyTransfer(tr('0xa', '0xb'), ex)).toMatchObject({ kind: 'wallet_transfer', inferred: null });
  });
  it('user labels override built-in ones', () => {
    const mine: Label = { address: '0x28C6c06298d514Db089934071355E5743bf21d60', network: '*', name: 'My OTC desk', type: 'fund', source: 'user' };
    expect(classifyTransfer(tr('0x28c6c06298d514db089934071355e5743bf21d60', '0xb'), [mine]).fromLabel?.name).toBe('My OTC desk');
    expect(classifyTransfer(tr('0x28c6c06298d514db089934071355e5743bf21d60', '0xb')).fromLabel?.name).toBe('Binance 14');
  });
  it('aggregates exchange netflow per bucket', () => {
    const ts = [classifyTransfer(tr('0xw', '0xcb', 5, 1000), ex), classifyTransfer(tr('0xcb', '0xw', 2, 1500), ex), classifyTransfer(tr('0xw', '0xcb', 7, 61_000), ex)];
    const b = exchangeNetflow(ts, 61_000, 60_000, 2);
    expect(b.map((x) => [x.inflow, x.outflow, x.net])).toEqual([
      [5, 2, 3],
      [7, 0, 7],
    ]);
  });
  it('measures holder concentration over the listed holders', () => {
    const c = concentration([{ address: '0xcb', amount: 40 }, { address: 'a', amount: 20 }, { address: 'b', amount: 10 }], 100, (a) => ex.find((l) => l.address === a) ?? null)!;
    expect(c.top10).toBeCloseTo(0.7);
    expect(c.hhi).toBeCloseTo(40 ** 2 + 20 ** 2 + 10 ** 2);
    expect(c.majority).toBe(2);
    expect(c.onExchanges).toBeCloseTo(0.4);
    expect(c.gini).toBeGreaterThan(0);
    expect(concentration([], 100)).toBeNull();
  });
});

const rule = <T extends AlertRule>(r: Omit<T, 'id' | 'enabled' | 'createdAt' | 'hits' | 'lastHit'>) => ({ id: 'r', enabled: true, createdAt: 0, hits: 0, lastHit: null, ...r }) as T;

describe('alert engine', () => {
  it('watched wallet: direction and min size', () => {
    const r = rule<Extract<AlertRule, { kind: 'wallet' }>>({ kind: 'wallet', network: '*', address: '0xWhale', direction: 'out', minUsd: 500_000 });
    expect(matchTransfer(r, classifyTransfer(tr('0xwhale', '0xcb'), ex))?.title).toMatch(/sent funds/);
    expect(matchTransfer(r, classifyTransfer(tr('0xcb', '0xwhale'), ex))).toBeNull();
    expect(matchTransfer(r, classifyTransfer(tr('0xwhale', '0xcb', 10), ex))).toBeNull();
    expect(matchTransfer({ ...r, enabled: false }, classifyTransfer(tr('0xwhale', '0xcb'), ex))).toBeNull();
  });
  it('large transfer: symbol, network and exchange-only filters', () => {
    const r = rule<Extract<AlertRule, { kind: 'large_transfer' }>>({ kind: 'large_transfer', network: 'ethereum', symbol: 'USDT', minUsd: 1_000_000, exchangeOnly: true });
    expect(matchTransfer(r, classifyTransfer(tr('0xa', '0xcb', 2e6), ex))?.detail).toMatch(/Exchange inflow/);
    expect(matchTransfer(r, classifyTransfer(tr('0xa', '0xb', 2e6), ex))).toBeNull();
    expect(matchTransfer({ ...r, symbol: 'USDC' }, classifyTransfer(tr('0xa', '0xcb', 2e6), ex))).toBeNull();
  });
  it('fee spikes: absolute level, % over median with warm-up, and cooldown', () => {
    const hist = Array.from({ length: 20 }, (_, i) => ({ network: 'ethereum' as const, time: i, value: 10 }));
    const abs = rule<Extract<AlertRule, { kind: 'fee_spike' }>>({ kind: 'fee_spike', network: 'ethereum', mode: 'above', value: 50 });
    expect(matchFee(abs, { network: 'ethereum', time: 1e6, value: 60 }, hist)).not.toBeNull();
    expect(matchFee({ ...abs, lastHit: 1e6 - 1000 }, { network: 'ethereum', time: 1e6, value: 60 }, hist)).toBeNull();
    const pct = rule<Extract<AlertRule, { kind: 'fee_spike' }>>({ kind: 'fee_spike', network: 'ethereum', mode: 'pct', value: 100 });
    expect(matchFee(pct, { network: 'ethereum', time: 1e6, value: 25 }, hist)?.title).toMatch(/\+150%/);
    expect(matchFee(pct, { network: 'ethereum', time: 1e6, value: 15 }, hist)).toBeNull();
    expect(matchFee(pct, { network: 'ethereum', time: 1e6, value: 25 }, hist.slice(0, 5))).toBeNull();
  });
  it('unusual token activity: z-score against an EWMA baseline after warm-up', () => {
    let st: ActivityState = { open: {}, stats: {} };
    const key = tokenKey('ethereum', usdt.address, 'USDT');
    const closed = [];
    // 10 quiet minutes with ~3 transfers each, then a burst of 40.
    for (let m = 0; m < 10; m++)
      for (let k = 0; k < 3 + (m % 2); k++) {
        const r = recordActivity(st, key, m * 60_000 + k * 1000, 1e6);
        st = r.state;
        closed.push(...r.closed);
      }
    for (let k = 0; k < 40; k++) st = recordActivity(st, key, 10 * 60_000 + k * 500, 1e6).state;
    const end = recordActivity(st, key, 11 * 60_000, 1e6);
    const burst = end.closed[0];
    expect(burst.count).toBe(40);
    expect(burst.zCount!).toBeGreaterThan(5);
    expect(closed.slice(0, 5).every((c) => c.zCount === null)).toBe(true);
    const r = rule<Extract<AlertRule, { kind: 'token_activity' }>>({ kind: 'token_activity', network: 'ethereum', tokenAddress: usdt.address, symbol: 'USDT', metric: 'count', z: 4 });
    expect(matchActivity(r, burst)?.title).toMatch(/Unusual USDT activity/);
    expect(matchActivity({ ...r, z: 99 }, burst)).toBeNull();
  });
});

describe('simulator', () => {
  const sim = new SimOnchainProvider();
  it('lookups are deterministic per query', async () => {
    const h = '0x' + 'b'.repeat(64);
    expect(await sim.getTx('ethereum', h)).toEqual(await sim.getTx('ethereum', h));
    const a = await sim.getAddress('ethereum', '0x28C6c06298d514Db089934071355E5743bf21d60');
    expect(a?.network).toBe('ethereum');
    const tok = await sim.getToken('ethereum', usdt.address);
    expect(tok?.top?.length).toBeGreaterThan(5);
    expect(await sim.getBlock('bitcoin', 999_999_999)).toBeNull();
    expect((await sim.getBlock('bitcoin', 840_000))?.height).toBe(840_000);
  });
  it('streams transfers among entities and recurring whales, and fee samples', () => {
    const prices = { BTC: 60_000, ETH: 3000, SOL: 150, LINK: 15 };
    const ts = Array.from({ length: 300 }, () => simTransfer(prices));
    const kinds = new Set(ts.map((t) => classifyTransfer(t, simEntities(t.network).map((e) => e.label)).kind));
    expect(kinds).toEqual(expect.objectContaining({}));
    expect([...kinds]).toEqual(expect.arrayContaining(['exchange_inflow', 'exchange_outflow', 'wallet_transfer']));
    expect(ts.some((t) => simWhales(t.network).includes(t.from))).toBe(true);
    expect(ts.every((t) => t.usd > 0 && t.amount > 0)).toBe(true);
    const f = simFee('ethereum', null);
    expect(f.value).toBeGreaterThan(0);
  });
});

/* ── Live adapter, against recorded response shapes ─────────────────────────────────────────── */

const json = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
function rpcFetch(handlers: Record<string, (params: unknown[]) => unknown>) {
  return async (url: string, init?: RequestInit) => {
    if (init?.body) {
      const { method, params, id } = JSON.parse(String(init.body));
      const h = handlers[method];
      if (!h) return json({ jsonrpc: '2.0', id, error: { code: -32601, message: `no handler ${method}` } });
      return json({ jsonrpc: '2.0', id, result: h(params) });
    }
    const h = handlers['GET ' + url.replace(/^https:\/\/[^/]+\/api/, '')];
    if (!h) return json('not found', 404);
    const r = h([]);
    return json(r as object);
  };
}

describe('live adapter (public RPC formats)', () => {
  it('decodes ABI strings, bytes32 and base units', () => {
    const abi = '0x' + '20'.padStart(64, '0') + '4'.padStart(64, '0') + Buffer.from('USDT').toString('hex').padEnd(64, '0');
    expect(decodeAbiString(abi)).toBe('USDT');
    expect(decodeAbiString('0x' + Buffer.from('MKR').toString('hex').padEnd(64, '0'))).toBe('MKR');
    expect(formatUnits(1_234_567_890n, 6)).toBeCloseTo(1234.56789);
    expect(formatUnits(10n ** 18n * 3n, 18)).toBe(3);
  });

  it('EVM transaction: status, fee, method and decoded ERC-20 transfer', async () => {
    const usdtAddr = usdt.address.toLowerCase();
    const p = new LiveOnchainProvider(
      rpcFetch({
        eth_getTransactionByHash: () => ({ hash: '0xabc', from: '0x1111111111111111111111111111111111111111', to: usdtAddr, value: '0x0', blockNumber: '0x10', gasPrice: '0x3b9aca00', nonce: '0x5', input: '0xa9059cbb' + '0'.repeat(128) }),
        eth_getTransactionReceipt: () => ({
          status: '0x1',
          gasUsed: '0xc350',
          effectiveGasPrice: '0x3b9aca00',
          contractAddress: null,
          logs: [{ address: usdtAddr, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', '0x' + '1'.repeat(64), '0x' + '0'.repeat(24) + '2'.repeat(40)], data: '0x' + (5_000_000n * 10n ** 6n).toString(16).padStart(64, '0') }],
        }),
        eth_blockNumber: () => '0x13',
        eth_getBlockByNumber: () => ({ timestamp: '0x65920080' }),
      }),
    );
    const tx = (await p.getTx('ethereum', '0xabc'))!;
    expect(tx).toMatchObject({ status: 'success', block: 16, confirmations: 4, nonce: 5, method: { selector: '0xa9059cbb', name: 'transfer(address,uint256)' } });
    expect(tx.fee).toBeCloseTo(50_000 * 1e-9);
    expect(tx.gasPrice).toBeCloseTo(1);
    expect(tx.time).toBe(0x65920080 * 1000);
    expect(tx.transfers[0]).toMatchObject({ amount: 5_000_000, to: '0x' + '2'.repeat(40) });
    expect(tx.transfers[0].token.symbol).toBe('USDT');
  });

  it('EVM address: balance, nonce, wallet vs contract, known-token balances', async () => {
    const p = new LiveOnchainProvider(
      rpcFetch({
        eth_getBalance: () => '0x' + (2n * 10n ** 18n).toString(16),
        eth_getTransactionCount: () => '0x2a',
        eth_getCode: () => '0x',
        eth_call: (params) => ((params[0] as { to: string }).to.toLowerCase() === usdt.address.toLowerCase() ? '0x' + (1500n * 10n ** 6n).toString(16).padStart(64, '0') : '0x' + '0'.repeat(64)),
      }),
    );
    const a = (await p.getAddress('ethereum', '0x28C6c06298d514Db089934071355E5743bf21d60'))!;
    expect(a).toMatchObject({ kind: 'wallet', balance: 2, txCount: 42, activity: null });
    expect(a.holdings).toEqual([{ token: usdt, amount: 1500 }]);
  });

  it('Bitcoin (Esplora): tx, address with direction, block by height', async () => {
    const addr = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    const p = new LiveOnchainProvider(
      rpcFetch({
        'GET /tx/abc': () => ({ txid: 'abc', fee: 1000, status: { confirmed: true, block_height: 100, block_time: 1700000000 }, vin: [{ prevout: { scriptpubkey_address: 'bc1qsender', value: 150_000_000 } }], vout: [{ scriptpubkey_address: addr, value: 100_000_000 }, { scriptpubkey_address: 'bc1qsender', value: 49_999_000 }] }),
        'GET /blocks/tip/height': () => 105,
        [`GET /address/${addr}`]: () => ({ address: addr, chain_stats: { funded_txo_sum: 300_000_000, spent_txo_sum: 100_000_000, tx_count: 7 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } }),
        [`GET /address/${addr}/txs`]: () => [{ txid: 'abc', status: { block_time: 1700000000 }, vin: [{ prevout: { scriptpubkey_address: 'bc1qsender', value: 150_000_000 } }], vout: [{ scriptpubkey_address: addr, value: 100_000_000 }] }],
        'GET /block-height/840000': () => '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5',
        'GET /block/0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5': () => ({ id: '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5', height: 840000, timestamp: 1713571767, tx_count: 3050, size: 2325617 }),
      }),
    );
    const tx = (await p.getTx('bitcoin', 'abc'))!;
    expect(tx).toMatchObject({ status: 'success', confirmations: 6, from: 'bc1qsender', to: addr, fee: 0.00001 });
    expect(tx.value).toBeCloseTo(1.49999);
    const a = (await p.getAddress('bitcoin', addr))!;
    expect(a).toMatchObject({ balance: 2, txCount: 7 });
    expect(a.activity![0]).toMatchObject({ direction: 'in', amount: 1, counterparty: 'bc1qsender' });
    const b = (await p.getBlock('bitcoin', 840000))!;
    expect(b).toMatchObject({ height: 840000, txCount: 3050 });
  });

  it('Solana: parsed transfers, SPL token supply and largest holders', async () => {
    const usdc = TOKENS.find((t) => t.network === 'solana' && t.symbol === 'USDC')!;
    const p = new LiveOnchainProvider(
      rpcFetch({
        getTransaction: () => ({
          slot: 1000,
          blockTime: 1700000000,
          meta: { err: null, fee: 5000, preBalances: [], postBalances: [] },
          transaction: { message: { accountKeys: [{ pubkey: 'Payer1111' }, { pubkey: 'Dest2222' }], instructions: [{ program: 'system', parsed: { type: 'transfer', info: { source: 'Payer1111', destination: 'Dest2222', lamports: 2_500_000_000 } } }, { program: 'spl-token', parsed: { type: 'transferChecked', info: { mint: usdc.address, authority: 'Payer1111', destination: 'Ata333', tokenAmount: { uiAmount: 1234.5 } } } }] } },
        }),
        getSlot: () => 1009,
        getTokenSupply: () => ({ value: { uiAmount: 1000, decimals: 6 } }),
        getTokenLargestAccounts: () => ({ value: [{ address: 'A', uiAmount: 600 }, { address: 'B', uiAmount: 100 }] }),
      }),
    );
    const tx = (await p.getTx('solana', 'sig'))!;
    expect(tx).toMatchObject({ status: 'success', from: 'Payer1111', to: 'Dest2222', value: 2.5, confirmations: 10, fee: 0.000005 });
    expect(tx.transfers[0]).toMatchObject({ amount: 1234.5, token: { symbol: 'USDC' } });
    const tok = (await p.getToken('solana', usdc.address))!;
    expect(tok.totalSupply).toBe(1000);
    expect(tok.top![0]).toMatchObject({ address: 'A', share: 0.6 });
  });

  it('reports unreachable endpoints and unsupported networks clearly', async () => {
    const down = new LiveOnchainProvider(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(down.getTip('ethereum')).rejects.toThrow(/Couldn't reach ethereum-rpc.publicnode.com/);
    await expect(new LiveOnchainProvider(async () => json('', 429)).getTip('ethereum')).rejects.toThrow(/rate limited/);
    await expect(down.getAddress('tron', 'T' + 'a'.repeat(33))).rejects.toThrow(/isn't available in Live mode/);
    expect(nativeToken('polygon').priceSymbol).toBe('MATIC');
  });
});
