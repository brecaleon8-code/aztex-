import { riskReward, rMultiple, fmtDuration } from './trading/risk';
import { fuzzyFilter, fuzzyScore } from './fuzzy';
import { splitPrice } from './format';

describe('risk / reward', () => {
  it('long: risk to SL, reward to TP, R:R and % of equity', () => {
    const r = riskReward('Long', 100, 110, 95, 2, 1000);
    expect(r).toEqual({ risk: 10, reward: 20, rr: 2, riskPct: 1 });
  });
  it('short mirrors direction', () => {
    expect(riskReward('Short', 100, 90, 105, 1, 500)).toMatchObject({ risk: 5, reward: 10, rr: 2 });
  });
  it('wrong-side levels give no R:R', () => {
    expect(riskReward('Long', 100, 90, 105, 1, 500).rr).toBeNull();
  });
  it('R multiple', () => {
    expect(rMultiple('Long', 100, 95, 110)).toBe(2);
    expect(rMultiple('Short', 100, 105, 102.5)).toBe(-0.5);
    expect(rMultiple('Long', 100, 100, 110)).toBeNull();
  });
  it('formats durations', () => {
    expect(fmtDuration(42_000)).toBe('42s');
    expect(fmtDuration(12 * 60_000)).toBe('12m');
    expect(fmtDuration(3 * 3600_000 + 5 * 60_000)).toBe('3h 05m');
    expect(fmtDuration(50 * 3600_000)).toBe('2d 2h');
  });
});

describe('fuzzy search', () => {
  it('ranks prefix > substring > subsequence and rejects non-matches', () => {
    expect(fuzzyScore('btc', 'BTC Bitcoin')!).toBeGreaterThan(fuzzyScore('btc', 'Go to BTC')!);
    expect(fuzzyScore('tl', 'Theme: light')).not.toBeNull();
    expect(fuzzyScore('xyz', 'Bitcoin')).toBeNull();
  });
  it('filters and orders', () => {
    const items = ['Ethereum', 'Theme: dark', 'ETH', 'Tether'];
    expect(fuzzyFilter(items, 'eth', (x) => x)[0]).toBe('ETH');
  });
});

describe('splitPrice', () => {
  it('emphasises the last four digits', () => {
    expect(splitPrice('62,475.50')).toEqual(['62,4', '75.50']);
    expect(splitPrice('0.12437')).toEqual(['0.1', '2437']);
    expect(splitPrice('148.2')).toEqual(['', '148.2']);
  });
});
