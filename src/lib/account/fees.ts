/**
 * Fee schedule. Rates are fractions of notional per fill; a negative maker rate is a rebate.
 * Market and marketable orders take liquidity (taker); resting limit orders that fill add it (maker).
 */
export type TierId = 'standard' | 'partner' | 'lp';
export type Liquidity = 'maker' | 'taker';

export interface FeeTier {
  id: TierId;
  label: string;
  maker: number;
  taker: number;
  blurb: string;
}

export const FEE_TIERS: Record<TierId, FeeTier> = {
  standard: { id: 'standard', label: 'Standard', maker: 0.0002, taker: 0.0006, blurb: 'Default schedule for all accounts.' },
  partner: { id: 'partner', label: 'Partner', maker: 0.0001, taker: 0.0004, blurb: 'Referral partners and introducing brokers.' },
  lp: { id: 'lp', label: 'Liquidity Provider', maker: -0.00005, taker: 0.0003, blurb: 'Designated market makers — maker rebate.' },
};

export function feeRate(tier: TierId, liq: Liquidity): number {
  return FEE_TIERS[tier][liq];
}

/** Fee in quote currency for a fill. Negative = rebate paid to the account. */
export function feeFor(notional: number, tier: TierId, liq: Liquidity): number {
  return Math.abs(notional) * feeRate(tier, liq);
}

/** "0.060%" / "−0.005%" */
export function fmtRate(r: number): string {
  return `${r < 0 ? '−' : ''}${(Math.abs(r) * 100).toFixed(3)}%`;
}

/** Saving vs. Standard for a tier, as a percentage of the standard taker fee. */
export function takerDiscountPct(tier: TierId): number {
  return (1 - FEE_TIERS[tier].taker / FEE_TIERS.standard.taker) * 100;
}
