import { LiveProvider } from './liveProvider';
import { MockProvider } from './mockProvider';
import type { MarketDataProvider } from './provider';

export type ProviderId = 'mock' | 'live';

/** Default source comes from env so dev/demos never need live keys. */
export const DEFAULT_PROVIDER: ProviderId = import.meta.env.VITE_MARKET_DATA === 'live' ? 'live' : 'mock';

export function createProvider(id: ProviderId): MarketDataProvider {
  return id === 'live' ? new LiveProvider() : new MockProvider();
}

export type { MarketDataProvider } from './provider';
