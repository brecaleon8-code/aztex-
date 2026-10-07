import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FEE_TIERS, feeFor, type Liquidity, type TierId } from '@/lib/account/fees';
import { generateCode, normalizeCode, redeemCode, type PartnerCode, type PartnerTier } from '@/lib/account/partnerCodes';
import { mulberry32 } from '@/lib/mock/rng';
import { useWalletStore } from './useWalletStore';

export const ACCOUNT_ID = 'AZX-PRIME-001';
const DAY = 86_400_000;

/** Two demo codes so the redeem flow can be tried immediately (deterministic). */
function seedRegistry(now = Date.now()): PartnerCode[] {
  return [
    { code: generateCode('lp', mulberry32(7)), tier: 'lp', partner: 'Kestrel Markets (market maker)', maxUses: 25, uses: 3, createdAt: now - 12 * DAY, expiresAt: now + 180 * DAY, revoked: false, redeemedBy: [] },
    { code: generateCode('partner', mulberry32(11)), tier: 'partner', partner: 'Northstar Capital (introducing broker)', maxUses: 500, uses: 41, createdAt: now - 40 * DAY, expiresAt: now + 90 * DAY, revoked: false, redeemedBy: [] },
  ];
}

interface FeeState {
  tier: TierId;
  /** The code (and partner) that granted the current tier, if any. */
  appliedCode: { code: string; partner: string; at: number } | null;
  feesPaid: number;
  rebatesEarned: number;
  /** Mock issuance registry — server-side in production (see lib/account/partnerCodes). */
  registry: PartnerCode[];
  redeem: (raw: string) => { ok: true; tier: TierId; partner: string } | { ok: false; error: string };
  removeCode: () => void;
  issue: (p: { tier: PartnerTier; partner: string; maxUses: number; expiresInDays: number | null }) => PartnerCode;
  revoke: (code: string) => void;
  /** Charge (or rebate) the fee for a fill against the wallet; returns the signed fee. */
  charge: (notional: number, liq: Liquidity) => number;
}

export const useFeeStore = create<FeeState>()(
  persist(
    (set, get) => ({
      tier: 'standard',
      appliedCode: null,
      feesPaid: 0,
      rebatesEarned: 0,
      registry: seedRegistry(),
      redeem: (raw) => {
        const r = redeemCode(get().registry, raw, ACCOUNT_ID);
        if (!r.ok) return r;
        set((s) => ({
          registry: s.registry.map((c) => (c.code === r.code.code ? r.code : c)),
          tier: r.code.tier,
          appliedCode: { code: r.code.code, partner: r.code.partner, at: Date.now() },
        }));
        return { ok: true, tier: r.code.tier, partner: r.code.partner };
      },
      removeCode: () => set({ tier: 'standard', appliedCode: null }),
      issue: ({ tier, partner, maxUses, expiresInDays }) => {
        const now = Date.now();
        let code = generateCode(tier);
        while (get().registry.some((c) => c.code === code)) code = generateCode(tier);
        const entry: PartnerCode = { code, tier, partner: partner.trim(), maxUses, uses: 0, createdAt: now, expiresAt: expiresInDays ? now + expiresInDays * DAY : null, revoked: false, redeemedBy: [] };
        set((s) => ({ registry: [entry, ...s.registry] }));
        return entry;
      },
      revoke: (code) =>
        set((s) => {
          const c = normalizeCode(code);
          const registry = s.registry.map((x) => (x.code === c ? { ...x, revoked: true } : x));
          // Revoking the code this account is on drops it back to Standard.
          return s.appliedCode?.code === c ? { registry, tier: 'standard', appliedCode: null } : { registry };
        }),
      charge: (notional, liq) => {
        const fee = feeFor(notional, get().tier, liq);
        if (fee === 0) return 0;
        useWalletStore.getState().settle(-fee);
        set((s) => (fee > 0 ? { feesPaid: s.feesPaid + fee } : { rebatesEarned: s.rebatesEarned - fee }));
        return fee;
      },
    }),
    { name: 'aztex.fees' },
  ),
);

export const currentRates = () => FEE_TIERS[useFeeStore.getState().tier];
