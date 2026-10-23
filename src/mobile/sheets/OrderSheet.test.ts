import { describe, expect, it } from 'vitest';
import { qtyStep, roundQty } from './OrderSheet';
import { decimalsOf } from './Stepper';

describe('phone order sheet helpers', () => {
  it('steps a tenth of the leading power of ten', () => {
    expect(qtyStep(0.04)).toBeCloseTo(0.001);
    expect(qtyStep(0.8)).toBeCloseTo(0.01);
    expect(qtyStep(25)).toBeCloseTo(1);
    expect(qtyStep(0)).toBe(0.001);
  });
  it('rounds a sized quantity to its step', () => {
    expect(roundQty(0.801688)).toBe(0.8);
    expect(roundQty(0.0412)).toBe(0.041);
    expect(roundQty(1234.5)).toBe(1200);
  });
  it('decimals for a step', () => {
    expect(decimalsOf(0.01)).toBe(2);
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.0001)).toBe(4);
  });
});
