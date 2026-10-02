import type { Candle } from '@/types';

/**
 * Proper Heikin-Ashi: smoothed synthetic candles derived from real OHLC.
 *   HA close = (O + H + L + C) / 4
 *   HA open  = (prev HA open + prev HA close) / 2   (first: (O + C) / 2)
 *   HA high  = max(H, HA open, HA close);  HA low = min(L, HA open, HA close)
 */
export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = i === 0 ? (c.open + c.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({
      time: c.time,
      open,
      close,
      high: Math.max(c.high, open, close),
      low: Math.min(c.low, open, close),
      volume: c.volume,
    });
  }
  return out;
}
