import type { Candle, OrderBookSnapshot, Ticker, Timeframe, Trade } from '@/types';

export type Unsubscribe = () => void;

export interface ConnectionStatus {
  state: 'connecting' | 'open' | 'reconnecting' | 'closed';
  latencyMs: number | null;
  /** Human-readable detail, e.g. last error. */
  detail?: string;
}

/**
 * The mock ↔ real seam (spec §9). Everything the UI knows about market data comes through this
 * interface, so swapping MockProvider for LiveProvider changes no UI code.
 */
export interface MarketDataProvider {
  readonly id: 'mock' | 'live';
  readonly label: string;
  /** Historical candles, oldest first. */
  getCandles(symbol: string, tf: Timeframe, limit: number): Promise<Candle[]>;
  /** Batched ticker updates for the given symbols (provider may throttle). */
  subscribeTickers(symbols: string[], onTickers: (t: Ticker[]) => void): Unsubscribe;
  /** The forming candle: same `time` as the last one replaces it, a newer `time` appends. */
  subscribeCandles(symbol: string, tf: Timeframe, onCandle: (c: Candle) => void): Unsubscribe;
  /** Executed trades (the tape), batched. */
  subscribeTrades(symbol: string, onTrades: (t: Trade[]) => void): Unsubscribe;
  /** L2 book snapshots (best levels first). */
  subscribeOrderBook(symbol: string, onBook: (b: OrderBookSnapshot) => void): Unsubscribe;
  onStatus(cb: (s: ConnectionStatus) => void): Unsubscribe;
  dispose(): void;
}

/**
 * Decouples render rate from socket message rate: collects updates by key and flushes the
 * latest of each at most `hz` times per second.
 */
export function createBatcher<T>(hz: number, flush: (items: T[]) => void, keyOf: (t: T) => string) {
  const pending = new Map<string, T>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const interval = 1000 / hz;
  return {
    push(item: T) {
      pending.set(keyOf(item), item);
      if (timer == null) {
        timer = setTimeout(() => {
          timer = null;
          const items = [...pending.values()];
          pending.clear();
          if (items.length) flush(items);
        }, interval);
      }
    },
    cancel() {
      if (timer != null) clearTimeout(timer);
      timer = null;
      pending.clear();
    },
  };
}
