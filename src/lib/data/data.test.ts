import { createBatcher } from './provider';
import { backoffDelay } from './reconnectingSocket';
import { parseKline, toVenueSymbol } from './liveProvider';
import { MockProvider } from './mockProvider';

describe('provider seam helpers', () => {
  it('maps symbols to venue tickers', () => {
    expect(toVenueSymbol('BTC')).toBe('BTCUSDT');
    expect(toVenueSymbol('MATIC')).toBe('POLUSDT');
  });
  it('parses Binance klines', () => {
    expect(parseKline([1, '1.5', '2', '1', '1.8', '10', 0])).toEqual({ time: 1, open: 1.5, high: 2, low: 1, close: 1.8, volume: 10 });
  });
  it('backoff grows exponentially with jitter and caps', () => {
    expect(backoffDelay(0, 500, 15_000, () => 0)).toBe(250);
    expect(backoffDelay(3, 500, 15_000, () => 1)).toBe(4000);
    expect(backoffDelay(20, 500, 15_000, () => 1)).toBe(15_000);
  });
});

describe('createBatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('keeps the latest item per key and flushes at the throttle rate', () => {
    const flush = vi.fn();
    const b = createBatcher<{ k: string; v: number }>(10, flush, (x) => x.k);
    b.push({ k: 'a', v: 1 });
    b.push({ k: 'a', v: 2 });
    b.push({ k: 'b', v: 3 });
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(flush).toHaveBeenCalledWith([{ k: 'a', v: 2 }, { k: 'b', v: 3 }]);
  });
});

describe('MockProvider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('streams tickers for subscribed symbols and history consistent with the ticker', async () => {
    const p = new MockProvider();
    const got: string[][] = [];
    const off = p.subscribeTickers(['BTC', 'ETH'], (ts) => got.push(ts.map((t) => t.symbol)));
    vi.advanceTimersByTime(1000);
    expect(got.at(-1)).toEqual(['BTC', 'ETH']);
    const hist = await p.getCandles('BTC', '1m', 250);
    expect(hist).toHaveLength(250);
    off();
    p.dispose();
  });
});
