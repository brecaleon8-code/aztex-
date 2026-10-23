import { describe, expect, it } from 'vitest';
import { splitQuote, spreadPoints } from './quoteFormat';

describe('MT5 quote digits', () => {
  it('3+ decimals: raised last digit, the two before it big', () => {
    expect(splitQuote('1.18757')).toEqual({ head: '1.18', big: '75', sup: '7' });
    expect(splitQuote('148.109')).toEqual({ head: '148.', big: '10', sup: '9' });
    expect(splitQuote('0.12425')).toEqual({ head: '0.12', big: '42', sup: '5' });
  });
  it('2 or fewer decimals: last two digits big, nothing raised', () => {
    expect(splitQuote('62,508.39')).toEqual({ head: '62,508.', big: '39', sup: '' });
    expect(splitQuote('3,121.1')).toEqual({ head: '3,12', big: '1.1', sup: '' });
    expect(splitQuote('7')).toEqual({ head: '', big: '7', sup: '' });
  });
  it('spread in points of the shown precision', () => {
    expect(spreadPoints(62508.39, 62513.39)).toBe(500);
    expect(spreadPoints(0.58233, 0.58245)).toBe(12);
  });
});
