import type { Candle, OrderBookSnapshot, Ticker, Timeframe } from '@/types';
import { ASSET_UNIVERSE, BASE_PRICES, SPREAD } from '@/lib/mock/assets';
import { TIMEFRAME_MS, applyTick, generateCandles, stepVol } from '@/lib/mock/candles';
import { generateOrderBook } from '@/lib/mock/orderbook';
import { gaussian, hashSeed, mulberry32 } from '@/lib/mock/rng';
import type { ConnectionStatus, MarketDataProvider, Unsubscribe } from './provider';

const TICK_MS = 1000;
const BOOK_MS = 2600;
/** Mock moves are exaggerated vs. real 1s vol so the demo visibly breathes. */
const LIVELINESS = 4;

interface SymState {
  price: number;
  open24: number;
  vol24: number;
}

/** In-browser simulated market. Pure generators live in lib/mock; this wires them to timers. */
export class MockProvider implements MarketDataProvider {
  readonly id = 'mock' as const;
  readonly label = 'Simulated';
  private state = new Map<string, SymState>();
  private tickListeners = new Set<(prices: Map<string, SymState>) => void>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private rand = Math.random;

  constructor() {
    for (const a of ASSET_UNIVERSE) {
      const r = mulberry32(hashSeed(a.symbol + ':24h'));
      const price = BASE_PRICES[a.symbol];
      const change = (r() - 0.45) * 0.09;
      this.state.set(a.symbol, { price, open24: price / (1 + change), vol24: price * a.supply * (0.015 + r() * 0.04) });
    }
    this.timers.push(setInterval(() => this.step(), TICK_MS));
    this.timers.push(
      setInterval(() => {
        const latency = 6 + Math.round(Math.random() * 14);
        this.statusListeners.forEach((cb) => cb({ state: 'open', latencyMs: latency }));
      }, 1200),
    );
  }

  private step() {
    for (const [sym, s] of this.state) {
      const v = stepVol(sym, TICK_MS) * LIVELINESS;
      s.price *= Math.exp(gaussian(this.rand) * v);
      s.vol24 *= 1 + (this.rand() - 0.5) * 0.002;
    }
    this.tickListeners.forEach((cb) => cb(this.state));
  }

  private ticker(sym: string, s: SymState): Ticker {
    const half = (s.price * (SPREAD[sym] ?? 0.0002)) / 2;
    return { symbol: sym, price: s.price, bid: s.price - half, ask: s.price + half, change24h: (s.price / s.open24 - 1) * 100, volume24h: s.vol24, time: Date.now() };
  }

  async getCandles(symbol: string, tf: Timeframe, limit: number): Promise<Candle[]> {
    const s = this.state.get(symbol);
    return generateCandles(symbol, tf, limit, s?.price ?? BASE_PRICES[symbol]);
  }

  subscribeTickers(symbols: string[], onTickers: (t: Ticker[]) => void): Unsubscribe {
    const set = new Set(symbols);
    const emit = (m: Map<string, SymState>) => onTickers([...m].filter(([k]) => set.has(k)).map(([k, s]) => this.ticker(k, s)));
    emit(this.state);
    this.tickListeners.add(emit);
    return () => this.tickListeners.delete(emit);
  }

  subscribeCandles(symbol: string, tf: Timeframe, onCandle: (c: Candle) => void): Unsubscribe {
    const step = TIMEFRAME_MS[tf];
    let series: Candle[] | null = null;
    const listener = (m: Map<string, SymState>) => {
      const s = m.get(symbol);
      if (!s) return;
      const now = Date.now();
      if (!series) {
        const bucket = Math.floor(now / step) * step;
        series = [{ time: bucket, open: s.price, high: s.price, low: s.price, close: s.price, volume: 0 }];
      }
      const qty = (s.vol24 / s.price / 86_400) * (TICK_MS / 1000) * (0.4 + this.rand() * 1.2);
      series = applyTick(series, s.price, now, step, qty).slice(-2);
      onCandle(series[series.length - 1]);
    };
    // Seed from the history's last candle so the forming candle continues it seamlessly.
    this.getCandles(symbol, tf, 2).then((h) => {
      if (!series) series = h.slice(-1);
    });
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  subscribeOrderBook(symbol: string, onBook: (b: OrderBookSnapshot) => void): Unsubscribe {
    const emit = () => {
      const s = this.state.get(symbol);
      if (s) onBook(generateOrderBook(s.price, SPREAD[symbol] ?? 0.0002));
    };
    emit();
    const t = setInterval(emit, BOOK_MS);
    return () => clearInterval(t);
  }

  onStatus(cb: (s: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(cb);
    cb({ state: 'open', latencyMs: 12 });
    return () => this.statusListeners.delete(cb);
  }

  dispose() {
    this.timers.forEach(clearInterval);
    this.tickListeners.clear();
    this.statusListeners.clear();
  }
}
