import { generateScannerEvent } from '@/lib/mock/scanner';
import { useDiscoveryStore } from '@/stores/useDiscoveryStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { toast } from '@/stores/useToastStore';
import { fmtCompact } from '@/lib/format';

/**
 * Mock on-chain event feed. Production replaces this with a chain-indexing / alerting backend
 * (spec §6) pushing the same ScannerEvent shape over a socket.
 */
export function startScannerFeed(): () => void {
  const prices = () => Object.fromEntries(Object.values(useMarketStore.getState().assets).map((a) => [a.symbol, a.price]));
  const store = useDiscoveryStore.getState();
  const seed = store.events.length === 0;
  for (let i = 0; seed && i < 14; i++) {
    const e = generateScannerEvent(prices());
    e.time -= (14 - i) * 9000;
    store.pushEvent(e);
  }
  let t: ReturnType<typeof setTimeout>;
  const loop = () => {
    const hits = useDiscoveryStore.getState().pushEvent(generateScannerEvent(prices()));
    hits.forEach((h) => toast({ kind: 'info', title: 'Scanner alert', detail: `${h.reason} · $${fmtCompact(h.event.usd)}` }));
    t = setTimeout(loop, 1800 + Math.random() * 2400);
  };
  t = setTimeout(loop, 1500);
  return () => clearTimeout(t);
}
