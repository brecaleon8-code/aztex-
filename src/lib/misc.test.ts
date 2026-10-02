import { textOn, fmtPrice, priceDecimals } from './format';
import { zeroOffset } from '@/modules/terminal/PnlChart';
import { normalize } from '@/modules/discovery/ComparisonChart';
import { computeShares } from '@/modules/discovery/MarketShare';

describe('misc pure helpers', () => {
  it('textOn picks readable text for literal fills', () => {
    expect(textOn('#3FCE84')).toBe('#0B0C0E');
    expect(textOn('#236B48')).toBe('#FFFFFF');
  });
  it('price precision scales with magnitude', () => {
    expect(priceDecimals(62480)).toBe(2);
    expect(priceDecimals(0.1243)).toBe(5);
    expect(fmtPrice(62480.123)).toBe('62,480.12');
  });
  it('P/L gradient stop sits at the zero crossing', () => {
    expect(zeroOffset([30, -10])).toBeCloseTo(0.75);
    expect(zeroOffset([1, 2])).toBe(1);
    expect(zeroOffset([-1, -2])).toBe(0);
  });
  it('comparison normalizes to % change from the window start', () => {
    expect(normalize([100, 110, 90])).toEqual([0, 10, -10.000000000000009].map((v) => expect.closeTo(v)));
  });
  it('market shares sum to 100%', () => {
    const rows = computeShares({ BTC: { price: 100, volume24h: 1 }, ETH: { price: 10, volume24h: 1 } });
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100);
    expect(rows[0].cap).toBeGreaterThanOrEqual(rows[1].cap);
  });
});
