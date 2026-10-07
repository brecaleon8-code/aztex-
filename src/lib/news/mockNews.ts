import { hashSeed, mulberry32, pick } from '@/lib/mock/rng';
import type { EconEvent, Impact, NewsCategory, NewsHandlers, NewsProvider, NewsStory, Region } from './types';
import { fmtEventValue, surprise } from './types';

/* ── Headline wire ───────────────────────────────────────────────────────────────────────── */

interface Tpl {
  cat: NewsCategory;
  src: string;
  impact: Impact;
  sent: -1 | 0 | 1;
  h: (s: string) => string;
  sum: (s: string) => string;
  sym?: boolean;
}
const T: Tpl[] = [
  { cat: 'crypto', src: 'Aztex Desk', impact: 2, sent: 1, sym: true, h: (s) => `${s} spot ETF flows turn positive for a third straight session`, sum: (s) => `Net creations led by the two largest issuers; ${s} basis firmed as flows returned.` },
  { cat: 'crypto', src: 'Wire', impact: 2, sent: -1, sym: true, h: (s) => `${s} perpetual funding flips negative across major venues`, sum: () => `Shorts are now paying longs on most venues — positioning has turned defensive.` },
  { cat: 'onchain', src: 'On-chain', impact: 2, sent: -1, sym: true, h: (s) => `Large ${s} transfer to exchange hot wallet flagged by monitors`, sum: () => `Inflows of this size often precede distribution, though many are internal reshuffles.` },
  { cat: 'markets', src: 'Aztex Desk', impact: 1, sent: 1, sym: true, h: (s) => `${s} options: 25-delta skew moves toward calls ahead of Friday expiry`, sum: () => `Upside demand concentrated in near-dated strikes; implied vol little changed.` },
  { cat: 'markets', src: 'Wire', impact: 1, sent: 0, sym: true, h: (s) => `Market makers widen ${s} quotes as weekend liquidity thins`, sum: () => `Top-of-book depth down roughly a third versus the weekday average.` },
  { cat: 'markets', src: 'Aztex Desk', impact: 2, sent: 0, sym: true, h: (s) => `${s} open interest hits a 30-day high; basis steady`, sum: () => `Leverage is building without a matching move in funding — watch for a squeeze either way.` },
  { cat: 'markets', src: 'Wire', impact: 3, sent: -1, sym: true, h: (s) => `${s} liquidations top $40M in an hour as price sweeps the range`, sum: () => `Long liquidations dominated; cascades concentrated on two offshore venues.` },
  { cat: 'onchain', src: 'On-chain', impact: 1, sent: 1, sym: true, h: (s) => `${s} exchange reserves fall to a multi-month low`, sum: () => `Coins continue to move into self-custody and staking contracts.` },
  { cat: 'crypto', src: 'Wire', impact: 2, sent: 1, sym: true, h: (s) => `Major custodian adds ${s} support for institutional clients`, sum: () => `Coverage extends to prime-brokerage and collateral accounts later this quarter.` },
  { cat: 'crypto', src: 'Wire', impact: 3, sent: -1, sym: true, h: (s) => `${s} network reports degraded block production; validators investigating`, sum: () => `Transactions are confirming slowly; several exchanges paused deposits as a precaution.` },
  { cat: 'regulation', src: 'Reg Watch', impact: 3, sent: 0, h: () => `SEC opens comment period on proposed digital-asset custody rule`, sum: () => `The 60-day window covers qualified-custodian definitions for advisers holding crypto.` },
  { cat: 'regulation', src: 'Reg Watch', impact: 2, sent: 1, h: () => `EU regulators publish final MiCA technical standards for stablecoins`, sum: () => `Reserve and redemption rules take effect in phases; issuers get a transition window.` },
  { cat: 'regulation', src: 'Reg Watch', impact: 2, sent: -1, h: () => `UK FCA warns firms over unregistered crypto promotions`, sum: () => `The regulator says it has flagged over 400 promotions this quarter.` },
  { cat: 'regulation', src: 'Reg Watch', impact: 2, sent: 1, h: () => `Hong Kong approves two more licensed virtual-asset exchanges`, sum: () => `Retail access permitted for large-cap tokens under the new regime.` },
  { cat: 'macro', src: 'Macro', impact: 2, sent: 0, h: () => `Fed speakers: policy remains data-dependent, balance-sheet runoff unchanged`, sum: () => `No new signal on the path of cuts; markets price little change for the next meeting.` },
  { cat: 'macro', src: 'Macro', impact: 2, sent: -1, h: () => `US 10Y yield edges higher; DXY firm into the European close`, sum: () => `A stronger dollar has weighed on risk assets including crypto this session.` },
  { cat: 'macro', src: 'Macro', impact: 1, sent: 0, h: () => `ECB minutes signal patience on further cuts`, sum: () => `Members want more evidence that services inflation is easing.` },
  { cat: 'macro', src: 'Macro', impact: 1, sent: 1, h: () => `Stablecoin supply expands for a fifth consecutive week`, sum: () => `Aggregate supply growth is a common proxy for fresh liquidity entering crypto.` },
  { cat: 'macro', src: 'Macro', impact: 2, sent: -1, h: () => `Treasury auction tails; risk assets soften briefly`, sum: () => `Weak demand at the long end pushed yields up three basis points.` },
  { cat: 'macro', src: 'Macro', impact: 2, sent: 1, h: () => `Oil slides 2% as supply worries ease; inflation expectations dip`, sum: () => `Breakevens moved lower across the curve.` },
];

let seq = 0;
const nid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function generateStory(symbols: string[], rand: () => number = Math.random, now = Date.now()): NewsStory {
  const t = pick(rand, T);
  const s = t.sym ? pick(rand, symbols) : '';
  return {
    id: nid('n'),
    time: now,
    source: t.src,
    category: t.cat,
    symbols: t.sym ? [s] : [],
    headline: t.h(s),
    summary: t.sum(s),
    impact: t.impact,
    sentiment: t.sent,
  };
}

/* ── Economic calendar ───────────────────────────────────────────────────────────────────── */

interface EvTpl {
  region: Region;
  title: string;
  impact: Impact;
  unit?: string;
  dec?: number;
  base?: number;
  spread?: number;
  hib?: boolean;
  hourUtc: number;
  minute?: number;
  crypto?: (r: () => number) => string;
}
const MACRO_EVENTS: EvTpl[] = [
  { region: 'US', title: 'CPI (YoY)', impact: 3, unit: '%', dec: 1, base: 3.0, spread: 0.3, hib: false, hourUtc: 12, minute: 30 },
  { region: 'US', title: 'Core CPI (MoM)', impact: 3, unit: '%', dec: 1, base: 0.3, spread: 0.1, hib: false, hourUtc: 12, minute: 30 },
  { region: 'US', title: 'Nonfarm Payrolls', impact: 3, unit: 'K', dec: 0, base: 180, spread: 60, hib: true, hourUtc: 12, minute: 30 },
  { region: 'US', title: 'Unemployment Rate', impact: 3, unit: '%', dec: 1, base: 4.1, spread: 0.1, hib: false, hourUtc: 12, minute: 30 },
  { region: 'US', title: 'Fed Interest Rate Decision', impact: 3, unit: '%', dec: 2, base: 4.5, spread: 0, hib: false, hourUtc: 18 },
  { region: 'US', title: 'Initial Jobless Claims', impact: 2, unit: 'K', dec: 0, base: 225, spread: 12, hib: false, hourUtc: 12, minute: 30 },
  { region: 'US', title: 'ISM Services PMI', impact: 2, dec: 1, base: 52.5, spread: 1.4, hib: true, hourUtc: 14 },
  { region: 'US', title: 'Retail Sales (MoM)', impact: 2, unit: '%', dec: 1, base: 0.3, spread: 0.4, hib: true, hourUtc: 12, minute: 30 },
  { region: 'US', title: 'Crude Oil Inventories', impact: 1, unit: 'M', dec: 1, base: -1.2, spread: 2.5, hib: false, hourUtc: 14, minute: 30 },
  { region: 'US', title: 'PPI (MoM)', impact: 2, unit: '%', dec: 1, base: 0.2, spread: 0.2, hib: false, hourUtc: 12, minute: 30 },
  { region: 'EU', title: 'ECB Interest Rate Decision', impact: 3, unit: '%', dec: 2, base: 3.25, spread: 0, hib: false, hourUtc: 12, minute: 15 },
  { region: 'EU', title: 'HICP Flash (YoY)', impact: 2, unit: '%', dec: 1, base: 2.2, spread: 0.2, hib: false, hourUtc: 9 },
  { region: 'EU', title: 'ZEW Economic Sentiment', impact: 1, dec: 1, base: 12, spread: 5, hib: true, hourUtc: 9 },
  { region: 'UK', title: 'GDP (MoM)', impact: 2, unit: '%', dec: 1, base: 0.1, spread: 0.2, hib: true, hourUtc: 6 },
  { region: 'UK', title: 'BoE Interest Rate Decision', impact: 3, unit: '%', dec: 2, base: 4.75, spread: 0, hib: false, hourUtc: 11 },
  { region: 'JP', title: 'BoJ Interest Rate Decision', impact: 3, unit: '%', dec: 2, base: 0.25, spread: 0, hib: false, hourUtc: 3 },
  { region: 'CN', title: 'Caixin Manufacturing PMI', impact: 2, dec: 1, base: 50.4, spread: 0.8, hib: true, hourUtc: 1, minute: 45 },
  { region: 'CA', title: 'Employment Change', impact: 2, unit: 'K', dec: 1, base: 22, spread: 15, hib: true, hourUtc: 12, minute: 30 },
  { region: 'AU', title: 'RBA Interest Rate Decision', impact: 2, unit: '%', dec: 2, base: 4.35, spread: 0, hib: false, hourUtc: 3, minute: 30 },
];
const CRYPTO_EVENTS: EvTpl[] = [
  { region: 'CRYPTO', title: 'BTC & ETH options expiry (Deribit)', impact: 2, hourUtc: 8, crypto: (r) => `$${(3 + r() * 4).toFixed(1)}B notional; max pain near spot` },
  { region: 'CRYPTO', title: 'ARB token unlock', impact: 2, hourUtc: 13, crypto: (r) => `${(80 + r() * 30).toFixed(1)}M ARB (${(2 + r()).toFixed(1)}% of supply)` },
  { region: 'CRYPTO', title: 'Ethereum core devs call', impact: 1, hourUtc: 14, crypto: () => 'Next hard-fork scope and devnet timeline' },
  { region: 'CRYPTO', title: 'SOL validator client upgrade', impact: 1, hourUtc: 16, crypto: () => 'Mainnet-beta rollout of the latest validator release' },
  { region: 'CRYPTO', title: 'Spot ETF decision deadline', impact: 3, hourUtc: 20, crypto: () => 'Final deadline for an SEC ruling on a pending spot ETF filing' },
  { region: 'CRYPTO', title: 'OP token unlock', impact: 1, hourUtc: 0, crypto: (r) => `${(25 + r() * 10).toFixed(1)}M OP (${(1 + r()).toFixed(1)}% of supply)` },
];

const DAY = 86_400_000;
const round = (v: number, d: number) => +v.toFixed(d);

function makeEvent(t: EvTpl, time: number, r: () => number, id: string): EconEvent {
  if (t.crypto) return { id, time, region: t.region, title: t.title, impact: t.impact, kind: 'crypto', detail: t.crypto(r) };
  const d = t.dec ?? 1;
  const forecast = round(t.base! + (r() - 0.5) * t.spread!, d);
  const previous = round(forecast + (r() - 0.5) * t.spread! * 1.4, d);
  return { id, time, region: t.region, title: t.title, impact: t.impact, kind: 'macro', unit: t.unit, decimals: d, forecast, previous, higherIsBetter: t.hib };
}

/** Releases a print: in line ~40% of the time, otherwise a beat or miss sized to the series' noise. */
export function releaseValue(e: EconEvent, r: () => number = Math.random): number | undefined {
  if (e.kind !== 'macro' || e.forecast == null) return undefined;
  const tpl = MACRO_EVENTS.find((t) => t.title === e.title && t.region === e.region);
  const spread = tpl?.spread ?? 0;
  if (spread === 0 || r() < 0.4) return e.forecast;
  return round(e.forecast + (r() - 0.5) * spread * 1.2, e.decimals ?? 1);
}

/**
 * A week of calendar around `now` (yesterday → +6 days), stable per UTC day so reloads look the same.
 * One extra high-impact event is placed a few minutes ahead so the live release flow is visible.
 */
export function buildCalendar(now = Date.now()): EconEvent[] {
  const day0 = Math.floor(now / DAY) * DAY;
  const out: EconEvent[] = [];
  // Demo: a high-impact print a few minutes out, on a 5-minute boundary.
  const soon = Math.ceil((now + 3 * 60_000) / 300_000) * 300_000;
  const rs = mulberry32(hashSeed(`soon:${soon}`));
  const demo = makeEvent(pick(rs, MACRO_EVENTS.filter((t) => t.impact === 3 && t.spread! > 0)), soon, rs, `ev_soon_${soon}`);
  out.push(demo);
  // Each release appears once in the window (no Fed decision two days running); weekly series excepted.
  const WEEKLY = new Set(['Initial Jobless Claims', 'Crude Oil Inventories', 'Ethereum core devs call']);
  const used = new Set<string>([demo.title]);
  for (let d = -1; d <= 6; d++) {
    const start = day0 + d * DAY;
    const r = mulberry32(hashSeed(`cal:${start}`));
    const wd = new Date(start).getUTCDay();
    if (wd === 0 || wd === 6) {
      if (r() < 0.6) out.push(makeEvent(pick(r, CRYPTO_EVENTS.filter((c) => c.impact < 3)), start + 13 * 3600_000, r, `ev${start}c`));
      continue;
    }
    const n = 3 + Math.floor(r() * 4);
    const today = new Set<string>();
    for (let k = 0; k < n; k++) {
      const t = r() < 0.2 ? pick(r, CRYPTO_EVENTS) : pick(r, MACRO_EVENTS);
      if (today.has(t.title) || (used.has(t.title) && !WEEKLY.has(t.title))) continue;
      today.add(t.title);
      used.add(t.title);
      const time = start + t.hourUtc * 3600_000 + (t.minute ?? 0) * 60_000;
      const e = makeEvent(t, time, r, `ev${start}_${k}`);
      if (e.time < now) e.actual = releaseValue(e, r);
      out.push(e);
    }
    if (wd === 5) out.push(makeEvent(CRYPTO_EVENTS[0], start + 8 * 3600_000, r, `ev${start}x`));
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Headline generated when a calendar event prints. */
export function releaseStory(e: EconEvent): NewsStory {
  const s = surprise(e);
  const region = e.region === 'CRYPTO' ? '' : `${e.region} `;
  const vs = e.kind === 'macro' ? `${fmtEventValue(e, e.actual)} vs ${fmtEventValue(e, e.forecast)} expected` : (e.detail ?? 'now live');
  const tone = s > 0 ? ' — better than expected' : s < 0 ? ' — worse than expected' : e.kind === 'macro' ? ' — in line' : '';
  return {
    id: nid('r'),
    time: e.time,
    source: e.kind === 'macro' ? 'Calendar' : 'Crypto cal.',
    category: e.kind === 'macro' ? 'macro' : 'crypto',
    symbols: [],
    headline: `${region}${e.title}: ${vs}${tone}`,
    summary: e.kind === 'macro' ? `Previous ${fmtEventValue(e, e.previous)}. Macro prints of this size typically move rates, the dollar and crypto in the minutes after release.` : e.detail,
    impact: e.impact,
    sentiment: s,
    eventId: e.id,
  };
}

/* ── Provider ────────────────────────────────────────────────────────────────────────────── */

export class MockNewsProvider implements NewsProvider {
  id = 'mock';
  label = 'Simulated wire';
  constructor(private symbols: string[]) {}

  start(h: NewsHandlers): () => void {
    const now = Date.now();
    const backlog = Array.from({ length: 28 }, (_, i) => generateStory(this.symbols, Math.random, now - (i + 1) * (150_000 + Math.random() * 240_000)));
    const events = buildCalendar(now);
    const released = events.filter((e) => e.time <= now && e.time > now - 6 * 3600_000 && (e.impact >= 2 || e.kind === 'crypto')).map(releaseStory);
    h.onStories([...backlog, ...released].sort((a, b) => b.time - a.time));
    h.onCalendar(events);

    let storyTimer: ReturnType<typeof setTimeout>;
    const loop = () => {
      h.onStories([generateStory(this.symbols)]);
      storyTimer = setTimeout(loop, 7000 + Math.random() * 13000);
    };
    storyTimer = setTimeout(loop, 4000 + Math.random() * 4000);

    // Release events as their time arrives.
    const pending = events.filter((e) => e.time > now);
    const clock = setInterval(() => {
      const t = Date.now();
      while (pending.length && pending[0].time <= t) {
        const e = { ...pending.shift()! };
        e.actual = releaseValue(e);
        h.onEventUpdate(e);
        h.onStories([releaseStory(e)]);
      }
    }, 1000);

    return () => {
      clearTimeout(storyTimer);
      clearInterval(clock);
    };
  }
}
