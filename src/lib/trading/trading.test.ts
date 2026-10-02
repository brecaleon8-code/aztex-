import { levelHit, pctFromEntry, pnlPct, positionSize, progressOnRange, suggestedLevels, unrealizedPnl } from './pnl';
import { parseCli } from './cli';

describe('P/L math', () => {
  it('long and short unrealized P/L', () => {
    expect(unrealizedPnl('Long', 100, 110, 2)).toBe(20);
    expect(unrealizedPnl('Short', 100, 110, 2)).toBe(-20);
    expect(pnlPct('Short', 100, 90)).toBe(10);
  });
  it('suggested TP/SL are ±3.2% / ±1.6% by side', () => {
    expect(suggestedLevels('Long', 100).tp).toBeCloseTo(103.2);
    expect(suggestedLevels('Long', 100).sl).toBeCloseTo(98.4);
    expect(suggestedLevels('Short', 100).tp).toBeCloseTo(96.8);
    expect(suggestedLevels('Short', 100).sl).toBeCloseTo(101.6);
    expect(pctFromEntry(103.2, 100)).toBeCloseTo(3.2);
  });
  it('progress bar maps SL→entry→TP to 0→0.5→1', () => {
    expect(progressOnRange('Long', 90, 100, 120, 100)).toBe(0.5);
    expect(progressOnRange('Long', 90, 100, 120, 110)).toBe(0.75);
    expect(progressOnRange('Long', 90, 100, 120, 95)).toBe(0.25);
    expect(progressOnRange('Long', 90, 100, 120, 200)).toBe(1);
    expect(progressOnRange('Short', 110, 100, 80, 90)).toBe(0.75);
  });
  it('detects TP/SL hits per side', () => {
    expect(levelHit('Long', 110, 90, 111)).toEqual({ tp: true, sl: false });
    expect(levelHit('Short', 90, 110, 111)).toEqual({ tp: false, sl: true });
  });
  it('sizes by % of equity or flat USDT', () => {
    expect(positionSize('pct', 10, 20_000, 50)).toEqual({ notional: 2000, size: 40 });
    expect(positionSize('usdt', 500, 20_000, 50)).toEqual({ notional: 500, size: 10 });
    expect(positionSize('pct', 150, 1000, 10).notional).toBe(1000); // capped at 100%
    expect(positionSize('pct', NaN, 1000, 10)).toEqual({ notional: 0, size: 0 });
  });
});

describe('CLI parser', () => {
  const syms = ['BTC', 'ETH', 'SOL'];
  it('parses orders', () => {
    expect(parseCli('buy 0.5 btc', syms)).toEqual({ ok: true, cmd: { kind: 'order', side: 'buy', amount: 0.5, symbol: 'BTC' } });
    expect(parseCli('SELL 2 ETHUSDT', syms)).toEqual({ ok: true, cmd: { kind: 'order', side: 'sell', amount: 2, symbol: 'ETH' } });
  });
  it('parses flatten / close all, watch, theme, jump, help', () => {
    expect(parseCli('close all', syms)).toEqual({ ok: true, cmd: { kind: 'flatten' } });
    expect(parseCli('flatten', syms)).toEqual({ ok: true, cmd: { kind: 'flatten' } });
    expect(parseCli('watch sol', syms)).toEqual({ ok: true, cmd: { kind: 'watch', symbol: 'SOL' } });
    expect(parseCli('unwatch SOL', syms)).toEqual({ ok: true, cmd: { kind: 'unwatch', symbol: 'SOL' } });
    expect(parseCli('theme light', syms)).toEqual({ ok: true, cmd: { kind: 'theme', theme: 'light' } });
    expect(parseCli('eth', syms)).toEqual({ ok: true, cmd: { kind: 'jump', symbol: 'ETH' } });
    expect(parseCli('help', syms)).toEqual({ ok: true, cmd: { kind: 'help' } });
  });
  it('rejects bad input with a reason', () => {
    expect(parseCli('buy -1 btc', syms)).toMatchObject({ ok: false, error: expect.stringMatching(/Invalid amount/) });
    expect(parseCli('buy 1 xyz', syms)).toMatchObject({ ok: false, error: expect.stringMatching(/Unknown symbol/) });
    expect(parseCli('theme blue', syms)).toMatchObject({ ok: false });
    expect(parseCli('rm -rf', syms)).toMatchObject({ ok: false, error: expect.stringMatching(/Unknown command/) });
  });
});
