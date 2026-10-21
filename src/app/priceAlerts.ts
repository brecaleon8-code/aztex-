import { useMarketStore } from '@/stores/useMarketStore';
import { firedAlerts, usePriceAlertStore } from '@/stores/usePriceAlertStore';
import { toast } from '@/stores/useToastStore';
import { fmtPrice } from '@/lib/format';

/** Watches live prices and fires chart price alerts once (they're removed when they trigger). */
export function startPriceAlerts(): () => void {
  return useMarketStore.subscribe((s, prev) => {
    if (s.assets === prev.assets) return;
    const { alerts, remove } = usePriceAlertStore.getState();
    if (!alerts.length) return;
    const prices = Object.fromEntries(Object.values(s.assets).map((a) => [a.symbol, a.price]));
    for (const a of firedAlerts(alerts, prices)) {
      remove(a.id);
      toast({ kind: 'info', title: `${a.symbol} ${a.direction === 'above' ? 'rose to' : 'fell to'} ${fmtPrice(a.price)}`, detail: `Price alert · now ${fmtPrice(prices[a.symbol])}` });
    }
  });
}
