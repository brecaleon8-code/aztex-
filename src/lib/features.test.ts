import type { Candle } from '@/types';
import { compile, evaluate, isCondition, parse } from './indicators/formula';
import { backtest } from './strategy/backtest';
import { FEE_TIERS, feeFor, fmtRate, takerDiscountPct } from './account/fees';
import { checkChar, checkFormat, codeStatus, generateCode, redeemCode, type PartnerCode } from './account/partnerCodes';
import { DEPOSIT_ASSETS, depositAddress } from './account/deposit';
import { mulberry32 } from './mock/rng';

const bar = (i: number, o: number, h: number, l: number, c: number): Candle => ({ time: i * 60_000, open: o, high: h, low: l, close: c, volume: 1 });
const closes = (xs: number[]) => xs.map((x, i) => bar(i, x, x, x, x));

describe('formula v2: conditions and new functions', () => {
  const c = closes([1, 2, 3, 2, 1, 2, 3, 4]);
  it('comparisons and logic yield 1/0 and respect precedence', () => {
    expect(evaluate(parse('close > 2'), c)).toEqual([0, 0, 1, 0, 0, 0, 1, 1]);
    expect(evaluate(parse('close >= 2 and close < 4'), c)).toEqual([0, 1, 1, 1, 0, 1, 1, 0]);
    expect(evaluate(parse('close == 1 or close == 4'), c)).toEqual([1, 0, 0, 0, 1, 0, 0, 1]);
    expect(evaluate(parse('not close > 2'), c)).toEqual([1, 1, 0, 1, 1, 1, 0, 0]);
    expect(evaluate(parse('close + 1 > 3 && close < 4'), c)).toEqual([0, 0, 1, 0, 0, 0, 1, 0]);
  });
  it('cross_over / cross_under fire only on the crossing bar', () => {
    expect(evaluate(parse('cross_over(close, 2.5)'), c)).toEqual([null, 0, 1, 0, 0, 0, 1, 0]);
    expect(evaluate(parse('cross_under(close, 1.5)'), c)).toEqual([null, 0, 0, 0, 1, 0, 0, 0]);
  });
  it('highest / lowest / prev / abs / min / max', () => {
    expect(evaluate(parse('highest(close, 3)'), c)).toEqual([null, null, 3, 3, 3, 2, 3, 4]);
    expect(evaluate(parse('lowest(close, 2)'), c)).toEqual([null, 1, 2, 2, 1, 1, 2, 3]);
    expect(evaluate(parse('prev(close, 2)'), c)).toEqual([null, null, 1, 2, 3, 2, 1, 2]);
    expect(evaluate(parse('abs(close - 3)'), c)).toEqual([2, 1, 0, 1, 2, 1, 0, 1]);
    expect(evaluate(parse('max(close, 2.5)'), c)[0]).toBe(2.5);
  });
  it('rsi works on derived series', () => {
    const r = evaluate(parse('rsi(ema(close, 2), 3)'), closes(Array.from({ length: 20 }, (_, i) => 10 + i)));
    expect(r[19]).toBe(100);
  });
  it('arity and period errors are explicit', () => {
    const err = (s: string) => {
      const r = compile(s);
      return r.ok ? '' : r.error;
    };
    expect(err('abs(close, 2)')).toMatch(/takes 1 argument/);
    expect(err('rsi(close)')).toMatch(/Expected ","/);
    expect(err('highest(close, close)')).toMatch(/constant/);
    expect(err('close >')).toMatch(/Unexpected end/);
  });
  it('detects condition-type formulas', () => {
    expect(isCondition(parse('close > 1'))).toBe(true);
    expect(isCondition(parse('cross_over(close, 1)'))).toBe(true);
    expect(isCondition(parse('ema(close, 9) - close'))).toBe(false);
  });
});

describe('backtest', () => {
  // Rises 100→110, falls back to 100, rises again.
  const path = [100, 102, 104, 106, 108, 110, 108, 106, 104, 102, 100, 103, 106, 109];
  const candles = path.map((p, i) => bar(i, p, p + 0.5, p - 0.5, p));
  it('fills at the next bar open (no look-ahead) and exits on signal', () => {
    const r = backtest({ id: 's', name: 's', side: 'Long', entry: 'close == 102', exit: 'close == 110', color: '#fff' }, candles, 0);
    if (!r.ok) throw new Error(r.error);
    expect(r.trades[0]).toMatchObject({ entryIndex: 2, entryPrice: 104, exitIndex: 6, exitPrice: 108, reason: 'signal' });
    expect(r.trades[0].returnPct).toBeCloseTo((108 / 104 - 1) * 100);
  });
  it('applies fees on both sides', () => {
    const r = backtest({ id: 's', name: 's', side: 'Long', entry: 'close == 102', exit: 'close == 110', color: '#fff' }, candles, 0.001);
    if (!r.ok) throw new Error(r.error);
    expect(r.trades[0].returnPct).toBeCloseTo((0.999 * (108 / 104) * 0.999 - 1) * 100);
  });
  it('hits stop-loss intrabar and prefers the stop when both levels are touched', () => {
    const wide = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 103, 97, 100)];
    const r = backtest({ id: 's', name: 's', side: 'Long', entry: 'close == 100', tpPct: 2, slPct: 2, color: '#fff' }, wide, 0);
    if (!r.ok) throw new Error(r.error);
    expect(r.trades[0]).toMatchObject({ reason: 'sl', exitPrice: 98 });
  });
  it('short side profits on a decline; stats and equity agree', () => {
    const r = backtest({ id: 's', name: 's', side: 'Short', entry: 'close == 110', exit: 'close == 100', color: '#fff' }, candles, 0);
    if (!r.ok) throw new Error(r.error);
    expect(r.trades[0].returnPct).toBeGreaterThan(0);
    expect(r.stats.trades).toBe(1);
    expect(r.stats.winRate).toBe(100);
    expect(r.equity.at(-1)! - 1).toBeCloseTo(r.stats.netPct / 100);
  });
  it('reports rule errors by field', () => {
    expect(backtest({ id: 's', name: 's', side: 'Long', entry: 'close >', color: '#fff' }, candles)).toMatchObject({ ok: false, field: 'entry' });
    expect(backtest({ id: 's', name: 's', side: 'Long', entry: 'close > 1', exit: 'foo', color: '#fff' }, candles)).toMatchObject({ ok: false, field: 'exit' });
  });
  it('max drawdown reflects an open losing trade', () => {
    const r = backtest({ id: 's', name: 's', side: 'Long', entry: 'close == 108 and prev(close, 1) == 106', color: '#fff' }, candles, 0);
    if (!r.ok) throw new Error(r.error);
    expect(r.stats.maxDrawdownPct).toBeGreaterThan(5);
  });
});

describe('fees', () => {
  it('tiers get progressively cheaper; LP earns a maker rebate', () => {
    expect(FEE_TIERS.partner.taker).toBeLessThan(FEE_TIERS.standard.taker);
    expect(FEE_TIERS.lp.taker).toBeLessThan(FEE_TIERS.partner.taker);
    expect(feeFor(10_000, 'standard', 'taker')).toBeCloseTo(6);
    expect(feeFor(10_000, 'lp', 'maker')).toBeCloseTo(-0.5);
    expect(fmtRate(-0.00005)).toBe('−0.005%');
    expect(takerDiscountPct('lp')).toBeCloseTo(50);
  });
});

describe('partner codes', () => {
  const rand = mulberry32(42);
  const mk = (over: Partial<PartnerCode> = {}): PartnerCode => ({ code: generateCode('lp', rand), tier: 'lp', partner: 'Acme MM', maxUses: 2, uses: 0, createdAt: 0, expiresAt: null, revoked: false, redeemedBy: [], ...over });
  it('generated codes pass format + checksum; single-character typos fail', () => {
    const code = generateCode('partner', rand);
    expect(code).toMatch(/^PT-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(checkFormat(code)).toEqual({ ok: true, tier: 'partner' });
    const typo = code.slice(0, 3) + (code[3] === 'A' ? 'B' : 'A') + code.slice(4);
    expect(checkFormat(typo).ok).toBe(false);
    expect(checkFormat('lp-abcd-efgh').ok).toBe(false);
    expect(checkFormat(' ' + code.toLowerCase() + ' ').ok).toBe(true);
    expect(checkChar('LPABCDEFG')).toHaveLength(1);
  });
  it('redeems once per account, enforces limits, expiry and revocation', () => {
    const c = mk();
    const r1 = redeemCode([c], c.code, 'acct-1');
    expect(r1.ok).toBe(true);
    const after = r1.ok ? r1.code : c;
    expect(redeemCode([after], c.code, 'acct-1')).toMatchObject({ ok: false, error: expect.stringMatching(/Already/) });
    const r2 = redeemCode([after], c.code, 'acct-2');
    const full = r2.ok ? r2.code : after;
    expect(redeemCode([full], c.code, 'acct-3')).toMatchObject({ ok: false, error: expect.stringMatching(/limit/) });
    expect(redeemCode([mk({ code: c.code, expiresAt: 1 })], c.code, 'x', 2)).toMatchObject({ ok: false, error: expect.stringMatching(/expired/) });
    expect(redeemCode([mk({ code: c.code, revoked: true })], c.code, 'x')).toMatchObject({ ok: false, error: expect.stringMatching(/revoked/) });
    expect(redeemCode([], generateCode('lp', rand), 'x')).toMatchObject({ ok: false, error: 'Code not recognised' });
    expect(codeStatus(full)).toBe('used up');
  });
});

describe('deposit addresses', () => {
  it('match each network family format and are stable per account', () => {
    const btc = DEPOSIT_ASSETS.find((a) => a.symbol === 'BTC')!;
    const a1 = depositAddress('acct', 'BTC', btc.networks[0]);
    expect(a1.address).toMatch(/^bc1q[a-z0-9]{38}$/);
    expect(depositAddress('acct', 'BTC', btc.networks[0])).toEqual(a1);
    expect(depositAddress('other', 'BTC', btc.networks[0]).address).not.toBe(a1.address);
    const usdt = DEPOSIT_ASSETS.find((a) => a.symbol === 'USDT')!;
    expect(depositAddress('acct', 'USDT', usdt.networks[0]).address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(depositAddress('acct', 'USDT', usdt.networks[1]).address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    const xrp = DEPOSIT_ASSETS.find((a) => a.symbol === 'XRP')!;
    const x = depositAddress('acct', 'XRP', xrp.networks[0]);
    expect(x.address).toMatch(/^r/);
    expect(x.memo?.label).toBe('Destination tag');
    expect(x.simulated).toBe(true);
  });
});
