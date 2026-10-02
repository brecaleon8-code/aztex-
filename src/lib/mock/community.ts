import type { TradeChipData } from '@/types';

export interface MockUser {
  code: string;
  name: string;
  handle: string;
  online: boolean;
}

/** Directory of friend codes resolvable in the mock (stands in for a backend lookup). */
export const MOCK_USERS: MockUser[] = [
  { code: 'AZT-7K2Q-9XM', name: 'Mara Lindqvist', handle: 'maralq', online: true },
  { code: 'AZT-3HV8-2PL', name: 'Dev Okafor', handle: 'okafor_fx', online: true },
  { code: 'AZT-9TR4-6WN', name: 'Yuki Arai', handle: 'arai_flow', online: false },
  { code: 'AZT-5MB1-8QD', name: 'Tomás Reyes', handle: 'treyes_vol', online: true },
  { code: 'AZT-2LC6-4ZK', name: 'Priya Natarajan', handle: 'priya_dv', online: false },
];

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateFriendCode(rand: () => number = Math.random): string {
  const c = (n: number) => Array.from({ length: n }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join('');
  return `AZT-${c(4)}-${c(3)}`;
}

export const CANNED_REPLIES = [
  'Seen. Flow on the bid looks thin above here though.',
  'Interesting — I am leaning the other way, sharing mine.',
  'Like the R:R. Watching funding before I size in.',
  'Agreed, that level held three times this week.',
];

export interface SeedPost {
  author: string;
  handle: string;
  text: string;
  trade?: TradeChipData;
  likes: number;
  comments: number;
  minutesAgo: number;
}

export const SEED_POSTS: SeedPost[] = [
  { author: 'Mara Lindqvist', handle: 'maralq', text: 'Reclaiming the weekly open with spot-led bid. Running a tight stop under the range low.', trade: { symbol: 'BTC', side: 'Long', entry: 61850, tp: 64200, sl: 61100 }, likes: 42, comments: 9, minutesAgo: 18 },
  { author: 'Dev Okafor', handle: 'okafor_fx', text: 'ETH/BTC still bleeding; fading the bounce into 0.0505 resistance.', trade: { symbol: 'ETH', side: 'Short', entry: 3168, tp: 3020, sl: 3215 }, likes: 27, comments: 4, minutesAgo: 47 },
  { author: 'Tomás Reyes', handle: 'treyes_vol', text: 'Implied vol at multi-month lows across majors. Not a trade by itself, but I would not be selling gamma here.', likes: 63, comments: 15, minutesAgo: 95 },
];
