import type { Candle, OrderBookLevel, OrderBookSnapshot, Ticker, Timeframe } from '@/types';
import { createBatcher, type ConnectionStatus, type MarketDataProvider, type Unsubscribe } from './provider';
import { ReconnectingSocket } from './reconnectingSocket';

/**
 * LiveProvider — Binance public market data (no API key; read-only). Uses Binance's
 * market-data-only hosts, which serve the same payloads as api/stream.binance.com.
 * Venue-specific symbol mapping is isolated here (multi-venue note, §9).
 */
const REST = 'https://data-api.binance.vision';
const WS = 'wss://data-stream.binance.vision/stream?streams=';

const SYMBOL_OVERRIDES: Record<string, string> = { MATIC: 'POLUSDT' }; // MATIC migrated to POL
export function toVenueSymbol(symbol: string): string {
  return SYMBOL_OVERRIDES[symbol] ?? `${symbol}USDT`;
}

type Kline = [number, string, string, string, string, string, ...unknown[]];
export function parseKline(k: Kline): Candle {
  return { time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] };
}

function levels(raw: [string, string][]): OrderBookLevel[] {
  let cum = 0;
  return raw.map(([p, q]) => {
    const size = +q;
    cum += size;
    return { price: +p, size, cumulative: cum };
  });
}

interface StreamMsg<T> {
  stream: string;
  data: T;
}

export class LiveProvider implements MarketDataProvider {
  readonly id = 'live' as const;
  readonly label = 'Binance (live)';
  private sockets = new Set<ReconnectingSocket>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private status: ConnectionStatus = { state: 'connecting', latencyMs: null };

  private setStatus(patch: Partial<ConnectionStatus>) {
    this.status = { ...this.status, ...patch };
    this.statusListeners.forEach((cb) => cb(this.status));
  }

  private open<T>(streams: string[], onData: (d: T) => void): Unsubscribe {
    const sock = new ReconnectingSocket({
      url: WS + streams.join('/'),
      onMessage: (m) => {
        const msg = m as StreamMsg<T & { E?: number }>;
        if (msg.data?.E) this.setStatus({ latencyMs: Math.max(0, Date.now() - msg.data.E) });
        onData(msg.data);
      },
      onState: (state, detail) => this.setStatus({ state, detail }),
    });
    this.sockets.add(sock);
    return () => {
      sock.close();
      this.sockets.delete(sock);
    };
  }

  async getCandles(symbol: string, tf: Timeframe, limit: number): Promise<Candle[]> {
    const res = await fetch(`${REST}/api/v3/klines?symbol=${toVenueSymbol(symbol)}&interval=${tf}&limit=${Math.min(1000, limit)}`);
    if (!res.ok) throw new Error(`klines ${symbol}: HTTP ${res.status}`);
    return ((await res.json()) as Kline[]).map(parseKline);
  }

  subscribeTickers(symbols: string[], onTickers: (t: Ticker[]) => void): Unsubscribe {
    const bySymbol = new Map(symbols.map((s) => [toVenueSymbol(s), s]));
    const batch = createBatcher<Ticker>(4, onTickers, (t) => t.symbol);
    type Raw = { s: string; c: string; b: string; a: string; P: string; q: string; E: number };
    const off = this.open<Raw>(
      symbols.map((s) => `${toVenueSymbol(s).toLowerCase()}@ticker`),
      (d) => {
        const sym = bySymbol.get(d.s);
        if (sym) batch.push({ symbol: sym, price: +d.c, bid: +d.b, ask: +d.a, change24h: +d.P, volume24h: +d.q, time: d.E });
      },
    );
    return () => {
      batch.cancel();
      off();
    };
  }

  subscribeCandles(symbol: string, tf: Timeframe, onCandle: (c: Candle) => void): Unsubscribe {
    const batch = createBatcher<Candle>(15, (cs) => cs.forEach(onCandle), (c) => String(c.time));
    type Raw = { k: { t: number; o: string; h: string; l: string; c: string; v: string } };
    const off = this.open<Raw>([`${toVenueSymbol(symbol).toLowerCase()}@kline_${tf}`], ({ k }) =>
      batch.push({ time: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v }),
    );
    return () => {
      batch.cancel();
      off();
    };
  }

  subscribeOrderBook(symbol: string, onBook: (b: OrderBookSnapshot) => void): Unsubscribe {
    // Partial-depth stream (top 20, 100ms). A full L2 diff-stream with local book maintenance is
    // the next step if deeper books are needed; the UI contract (snapshots) stays the same.
    const batch = createBatcher<OrderBookSnapshot>(10, (b) => onBook(b[b.length - 1]), () => 'book');
    type Raw = { bids: [string, string][]; asks: [string, string][] };
    const off = this.open<Raw>([`${toVenueSymbol(symbol).toLowerCase()}@depth20@100ms`], (d) =>
      batch.push({ bids: levels(d.bids.slice(0, 14)), asks: levels(d.asks.slice(0, 14)), time: Date.now() }),
    );
    return () => {
      batch.cancel();
      off();
    };
  }

  onStatus(cb: (s: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  dispose() {
    this.sockets.forEach((s) => s.close());
    this.sockets.clear();
    this.statusListeners.clear();
  }
}
