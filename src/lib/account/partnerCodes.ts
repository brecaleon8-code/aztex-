/**
 * Partner / liquidity-provider referral codes.
 *
 * Format: PREFIX-XXXX-XXXC  (PT = partner, LP = liquidity provider). C is a check character over
 * the body (mod-32 weighted sum), so typos are rejected before any lookup.
 *
 * IMPORTANT: in this build, issuance and redemption run client-side against a mock registry so the
 * flow can be demoed end-to-end. Production must issue, store and redeem codes server-side (signed,
 * rate-limited, audited) — a client must never be able to grant itself a fee tier.
 */
import type { TierId } from './fees';

export type PartnerTier = Exclude<TierId, 'standard'>;
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
const PREFIX: Record<PartnerTier, string> = { partner: 'PT', lp: 'LP' };

export interface PartnerCode {
  code: string;
  tier: PartnerTier;
  /** Organisation the code was issued to. */
  partner: string;
  maxUses: number;
  uses: number;
  createdAt: number;
  expiresAt: number | null;
  revoked: boolean;
  redeemedBy: string[];
}

export function checkChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (CODE_ALPHABET.indexOf(body[i]) + 1) * (i + 3);
  return CODE_ALPHABET[sum % CODE_ALPHABET.length];
}

export function generateCode(tier: PartnerTier, rand: () => number = Math.random): string {
  const pick = () => CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  const body = Array.from({ length: 7 }, pick).join('');
  const full = PREFIX[tier] + body;
  return `${PREFIX[tier]}-${body.slice(0, 4)}-${body.slice(4)}${checkChar(full)}`;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '').replace(/_/g, '-');
}

export type FormatCheck = { ok: true; tier: PartnerTier } | { ok: false; error: string };

/** Structural validation (prefix, length, alphabet, check character) — no registry lookup. */
export function checkFormat(raw: string): FormatCheck {
  const code = normalizeCode(raw);
  const m = /^(PT|LP)-([A-Z0-9]{4})-([A-Z0-9]{4})$/.exec(code);
  if (!m) return { ok: false, error: 'Codes look like LP-XXXX-XXXX or PT-XXXX-XXXX' };
  const body = m[2] + m[3].slice(0, 3);
  if ([...body, m[3][3]].some((ch) => !CODE_ALPHABET.includes(ch))) return { ok: false, error: 'Code contains characters that are never used (0, 1, I, L, O)' };
  if (checkChar(m[1] + body) !== m[3][3]) return { ok: false, error: 'That code doesn’t look right — check for a typo' };
  return { ok: true, tier: m[1] === 'LP' ? 'lp' : 'partner' };
}

export type RedeemResult = { ok: true; code: PartnerCode } | { ok: false; error: string };

export function redeemCode(registry: PartnerCode[], raw: string, accountId: string, now = Date.now()): RedeemResult {
  const fmt = checkFormat(raw);
  if (!fmt.ok) return fmt;
  const code = normalizeCode(raw);
  const entry = registry.find((c) => c.code === code);
  if (!entry) return { ok: false, error: 'Code not recognised' };
  if (entry.revoked) return { ok: false, error: 'This code has been revoked' };
  if (entry.expiresAt != null && now > entry.expiresAt) return { ok: false, error: 'This code has expired' };
  if (entry.redeemedBy.includes(accountId)) return { ok: false, error: 'Already redeemed on this account' };
  if (entry.uses >= entry.maxUses) return { ok: false, error: 'This code has reached its usage limit' };
  return { ok: true, code: { ...entry, uses: entry.uses + 1, redeemedBy: [...entry.redeemedBy, accountId] } };
}

export function codeStatus(c: PartnerCode, now = Date.now()): 'active' | 'expired' | 'revoked' | 'used up' {
  if (c.revoked) return 'revoked';
  if (c.expiresAt != null && now > c.expiresAt) return 'expired';
  if (c.uses >= c.maxUses) return 'used up';
  return 'active';
}
