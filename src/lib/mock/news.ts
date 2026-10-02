import { pick } from './rng';

export interface NewsItem {
  id: string;
  time: number;
  source: string;
  symbol: string | null;
  headline: string;
  urgent: boolean;
}

const SOURCES = ['AZN', 'WIRE', 'DESK', 'CHAIN', 'MACRO'];
const TEMPLATES: ((s: string) => string)[] = [
  (s) => `${s} spot ETF flows turn positive for third straight session`,
  (s) => `${s} perpetual funding flips negative across major venues`,
  (s) => `Large ${s} transfer to exchange cold wallet flagged by on-chain monitors`,
  (s) => `${s} options: 25-delta skew moves toward calls ahead of expiry`,
  (s) => `Market makers widen ${s} quotes as weekend liquidity thins`,
  (s) => `${s} open interest hits 30-day high; basis steady`,
  (s) => `Desk note: ${s} reclaiming value-area high, watching for acceptance`,
  (s) => `${s} liquidations top $40M in last hour as price sweeps range`,
];
const MACRO = [
  'FED SPEAKERS: Policy remains data-dependent, balance-sheet runoff unchanged',
  'US 10Y yield edges higher; DXY firm into European close',
  'ECB minutes signal patience on further cuts',
  'Stablecoin supply expands for fifth consecutive week',
  'Treasury auction tails; risk assets soften briefly',
];

export function generateNews(symbols: string[], rand: () => number = Math.random, now = Date.now()): NewsItem {
  const macro = rand() < 0.25;
  const symbol = macro ? null : pick(rand, symbols);
  return {
    id: Math.random().toString(36).slice(2),
    time: now,
    source: macro ? 'MACRO' : pick(rand, SOURCES.slice(0, 4)),
    symbol,
    headline: macro ? pick(rand, MACRO) : pick(rand, TEMPLATES)(symbol!),
    urgent: rand() < 0.15,
  };
}
