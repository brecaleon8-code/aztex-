import type { Candle } from '@/types';

const DAY = 86_400_000;

export interface Extreme {
  value: number;
  time: number;
}

export interface QuoteStats {
  /** Today's UTC session: open, high and low so far (the live price included). */
  open: number | null;
  high: number | null;
  low: number | null;
  /** Yesterday's close. */
  prevClose: number | null;
  high52w: Extreme | null;
  low52w: Extreme | null;
  /** Period-to-date returns (fractions, 0.05 = +5%), against the last close before the period. */
  wtd: number | null;
  mtd: number | null;
  qtd: number | null;
  ytd: number | null;
  /** Trailing returns against the close that many days ago. */
  r1w: number | null;
  r1m: number | null;
  r3m: number | null;
  r1y: number | null;
  /** Average daily quote volume over the last 30 sessions. */
  avgVol30d: number | null;
  /** Annualised volatility of daily log returns over the last 30 sessions. */
  vol30d: number | null;
}

const startOfDay = (t: number) => Math.floor(t / DAY) * DAY;
/** Monday 00:00 UTC of t's week. */
export function startOfWeek(t: number): number {
  const d = new Date(startOfDay(t));
  const back = (d.getUTCDay() + 6) % 7;
  return d.getTime() - back * DAY;
}
export const startOfMonth = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
export const startOfQuarter = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1);
};
export const startOfYear = (t: number) => Date.UTC(new Date(t).getUTCFullYear(), 0, 1);

/**
 * Key statistics for the Quote window from daily candles (oldest first) and the live price.
 * Everything is UTC; a return is null when the history doesn't reach back far enough.
 */
export function quoteStats(daily: Candle[], price: number, now: number): QuoteStats {
  const today = startOfDay(now);
  const past = daily.filter((c) => c.time < today);
  const todayBar = daily.find((c) => c.time === today);
  /** The close of the last session that started before t. */
  const closeBefore = (t: number): number | null => {
    if (!past.length || past[0].time >= t) return null;
    let ref: Candle | null = null;
    for (const c of past) {
      if (c.time < t) ref = c;
      else break;
    }
    return ref ? ref.close : null;
  };
  const ret = (t: number) => {
    const ref = closeBefore(t);
    return ref ? price / ref - 1 : null;
  };

  const open = todayBar ? todayBar.open : past.length ? past[past.length - 1].close : null;
  const high = todayBar ? Math.max(todayBar.high, price) : open != null ? Math.max(open, price) : null;
  const low = todayBar ? Math.min(todayBar.low, price) : open != null ? Math.min(open, price) : null;

  const yearAgo = today - 364 * DAY;
  const window52 = daily.filter((c) => c.time >= yearAgo);
  let high52w: Extreme | null = null;
  let low52w: Extreme | null = null;
  for (const c of window52) {
    if (!high52w || c.high > high52w.value) high52w = { value: c.high, time: c.time };
    if (!low52w || c.low < low52w.value) low52w = { value: c.low, time: c.time };
  }
  if (high52w && price > high52w.value) high52w = { value: price, time: today };
  if (low52w && price < low52w.value) low52w = { value: price, time: today };

  const last30 = past.slice(-30);
  const avgVol30d = last30.length ? last30.reduce((t, c) => t + c.volume * c.close, 0) / last30.length : null;
  let vol30d: number | null = null;
  if (last30.length >= 10) {
    const rets = last30.slice(1).map((c, i) => Math.log(c.close / last30[i].close));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
    vol30d = Math.sqrt(variance) * Math.sqrt(365);
  }

  return {
    open,
    high,
    low,
    prevClose: past.length ? past[past.length - 1].close : null,
    high52w,
    low52w,
    wtd: ret(startOfWeek(now)),
    mtd: ret(startOfMonth(now)),
    qtd: ret(startOfQuarter(now)),
    ytd: ret(startOfYear(now)),
    r1w: ret(today - 6 * DAY),
    r1m: ret(today - 29 * DAY),
    r3m: ret(today - 90 * DAY),
    r1y: ret(today - 364 * DAY),
    avgVol30d,
    vol30d,
  };
}
