import { ASSET_UNIVERSE } from '@/lib/mock/assets';
import { MockNewsProvider } from '@/lib/news/mockNews';
import { fmtEventValue, surprise } from '@/lib/news/types';
import { useNewsStore } from '@/stores/useNewsStore';
import { toast } from '@/stores/useToastStore';

const PRE_ALERT_MS = 5 * 60_000;

/**
 * Wires the news provider to the store (runs app-wide, so the dock's unread badge stays current while
 * it is collapsed or closed) and raises toasts for high-impact calendar events: once when one is
 * five minutes out, and again when it prints.
 */
export function startNewsFeed(): () => void {
  const provider = new MockNewsProvider(ASSET_UNIVERSE.map((a) => a.symbol));
  const st = useNewsStore.getState;
  const stop = provider.start({
    onStories: (s) => st().addStories(s),
    onCalendar: (e) => st().setEvents(e),
    onEventUpdate: (e) => {
      st().updateEvent(e);
      if (!st().alerts || e.impact < 3) return;
      const s = surprise(e);
      toast({
        kind: 'info',
        title: `${e.region === 'CRYPTO' ? '' : `${e.region} `}${e.title}`,
        detail: e.kind === 'macro' ? `${fmtEventValue(e, e.actual)} vs ${fmtEventValue(e, e.forecast)} f'cast${s > 0 ? ' · beat' : s < 0 ? ' · miss' : ' · in line'}` : (e.detail ?? 'Now'),
      });
    },
  });

  // Pre-alerts fire only on crossing the threshold while the app is open (never a burst on load).
  const warned = new Set<string>();
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const e of st().events) {
      if (e.impact < 3 || warned.has(e.id)) continue;
      const left = e.time - now;
      if (left > 0 && left <= PRE_ALERT_MS) {
        warned.add(e.id);
        if (st().alerts && e.time - startedAt > PRE_ALERT_MS) toast({ kind: 'info', title: `In ${Math.ceil(left / 60_000)} min: ${e.region === 'CRYPTO' ? '' : `${e.region} `}${e.title}`, detail: e.forecast != null ? `Forecast ${fmtEventValue(e, e.forecast)} · prev ${fmtEventValue(e, e.previous)}` : e.detail });
      }
    }
  }, 5000);

  return () => {
    stop();
    clearInterval(timer);
  };
}
