import type { Candle, Timeframe } from '@/types';
import { BASE_PRICES, VOL } from './assets';
import { gaussian, hashSeed, mulberry32 } from './rng';

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

const YEAR_MS = 365 * 86_400_000;

/** Per-step stdev of log returns for an asset at a given step duration. */
export function stepVol(symbol: string, stepMs: number): number {
  return (VOL[symbol] ?? 0.8) * Math.sqrt(stepMs / YEAR_MS);
}

/**
 * Deep mock history (≥200 candles so zoom/pan has real data). Generated as a seeded random walk
 * and rescaled so the final close lands exactly on `endPrice`, keeping history consistent with
 * the live ticker regardless of timeframe.
 */
export function generateCandles(symbol: string, tf: Timeframe, count = 320, endPrice = BASE_PRICES[symbol] ?? 100, now = Date.now()): Candle[] {
  const step = TIMEFRAME_MS[tf];
  const rand = mulberry32(hashSeed(`${symbol}:${tf}`));
  const vol = stepVol(symbol, step);
  const lastOpen = Math.floor(now / step) * step;
  const raw: Candle[] = [];
  let price = 1;
  let regime = 0;
  for (let i = 0; i < count; i++) {
    if (i % 40 === 0) regime = gaussian(rand) * vol * 0.25; // slow-varying drift so trends look real
    const open = price;
    const ret = regime + gaussian(rand) * vol;
    const close = open * Math.exp(ret);
    const wick = Math.abs(gaussian(rand)) * vol * 0.6;
    const wick2 = Math.abs(gaussian(rand)) * vol * 0.6;
    const high = Math.max(open, close) * Math.exp(wick);
    const low = Math.min(open, close) * Math.exp(-wick2);
    const volume = (0.6 + rand() * 1.4) * (1 + Math.abs(ret) / vol) * 100;
    raw.push({ time: lastOpen - (count - 1 - i) * step, open, high, low, close, volume });
    price = close;
  }
  const k = endPrice / price;
  const baseVol = (1_000_000 / endPrice) * (step / 60_000);
  return raw.map((c) => ({
    time: c.time,
    open: c.open * k,
    high: c.high * k,
    low: c.low * k,
    close: c.close * k,
    volume: (c.volume / 100) * baseVol,
  }));
}

/** Fold a live price tick into the candle series: update the forming candle or open a new one. */
export function applyTick(candles: Candle[], price: number, time: number, step: number, qty = 0): Candle[] {
  if (candles.length === 0) return candles;
  const last = candles[candles.length - 1];
  const bucket = Math.floor(time / step) * step;
  if (bucket > last.time) {
    return [...candles, { time: bucket, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, volume: qty }];
  }
  const updated: Candle = { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price, volume: last.volume + qty };
  return [...candles.slice(0, -1), updated];
}

/** Daily closes for the comparison chart (Data & Discovery). */
export function generateDailyCloses(symbol: string, days: number, endPrice: number): { time: number; close: number }[] {
  return generateCandles(symbol, '1d', days + 1, endPrice).map((c) => ({ time: c.time, close: c.close }));
}
