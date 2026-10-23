import { fmtPrice } from '@/lib/format';

/**
 * MT5's price split: with three or more decimals the last digit is the raised "pipette" and the two
 * before it are the big "pips" (1.18757 → 1.18 · 75 · 7); with two or fewer, the last two digits
 * are big (62,508.39 → 62,508. · 39).
 */
export function splitQuote(s: string): { head: string; big: string; sup: string } {
  const dot = s.indexOf('.');
  const decimals = dot < 0 ? 0 : s.length - dot - 1;
  const sup = decimals >= 3 ? s.slice(-1) : '';
  const rest = sup ? s.slice(0, -1) : s;
  let i = rest.length;
  for (let digits = 0; i > 0 && digits < 2; ) if (/\d/.test(rest[--i])) digits++;
  return { head: rest.slice(0, i), big: rest.slice(i), sup };
}

/** The spread in points (smallest price step shown), as MT5 quotes it. */
export function spreadPoints(bid: number, ask: number): number {
  const s = fmtPrice(bid);
  const dot = s.indexOf('.');
  const decimals = dot < 0 ? 0 : s.length - dot - 1;
  return Math.round((ask - bid) * 10 ** decimals);
}
