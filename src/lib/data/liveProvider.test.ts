import { LiveProvider } from './liveProvider';

class FakeWS {
  static all: FakeWS[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.all.push(this);
  }
  emit(stream: string, data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ stream, data }) });
  }
  close() {
    this.onclose?.({ code: 1000 });
  }
}

describe('LiveProvider (Binance) against fake transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWS.all = [];
    vi.stubGlobal('WebSocket', FakeWS);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fetches klines from REST with the venue symbol', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [[1, '1', '2', '0.5', '1.5', '9', 0]] });
    vi.stubGlobal('fetch', fetchMock);
    const p = new LiveProvider();
    const c = await p.getCandles('MATIC', '5m', 300);
    expect(fetchMock.mock.calls[0][0]).toContain('symbol=POLUSDT&interval=5m&limit=300');
    expect(c).toEqual([{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 9 }]);
  });

  it('subscribes to combined streams, maps tickers back to app symbols, and throttles', () => {
    const p = new LiveProvider();
    const got: { symbol: string; price: number }[][] = [];
    p.subscribeTickers(['BTC', 'ETH'], (ts) => got.push(ts));
    const ws = FakeWS.all[0];
    expect(ws.url).toContain('btcusdt@ticker/ethusdt@ticker');
    ws.onopen?.();
    ws.emit('btcusdt@ticker', { s: 'BTCUSDT', c: '100', b: '99', a: '101', P: '1.5', q: '1000', E: Date.now() });
    ws.emit('btcusdt@ticker', { s: 'BTCUSDT', c: '102', b: '101', a: '103', P: '1.6', q: '1000', E: Date.now() });
    expect(got).toHaveLength(0);
    vi.advanceTimersByTime(260);
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual([expect.objectContaining({ symbol: 'BTC', price: 102, bid: 101, ask: 103 })]);
  });

  it('builds order-book snapshots with cumulative depth', () => {
    const p = new LiveProvider();
    const books: { bids: { cumulative: number }[] }[] = [];
    p.subscribeOrderBook('BTC', (b) => books.push(b));
    FakeWS.all[0].emit('btcusdt@depth20@100ms', { bids: [['100', '1'], ['99', '2']], asks: [['101', '3']] });
    vi.advanceTimersByTime(120);
    expect(books[0].bids.map((l) => l.cumulative)).toEqual([1, 3]);
  });

  it('reconnects with backoff after the socket drops and reports status', () => {
    const p = new LiveProvider();
    const states: string[] = [];
    p.onStatus((s) => states.push(s.state));
    p.subscribeCandles('BTC', '1m', () => {});
    FakeWS.all[0].onopen?.();
    FakeWS.all[0].onclose?.({ code: 1006 });
    expect(states).toContain('reconnecting');
    vi.advanceTimersByTime(600);
    expect(FakeWS.all).toHaveLength(2);
    FakeWS.all[1].onopen?.();
    expect(states.at(-1)).toBe('open');
    p.dispose();
  });
});
