import { useMemo } from 'react';
import { CalendarClock, Percent } from 'lucide-react';
import { useNewsStore } from '@/stores/useNewsStore';
import { fmtTime } from '@/lib/format';
import { Segmented } from '@/components/ui/Segmented';
import { Calendar, useNow } from '@/app/NewsDock';
import { useSetWindowSymbol, useWindowSettings, useWindowSymbol } from '@/workspace/WindowContext';
import './news.css';

type View = 'wire' | 'calendar';
type Settings = { linkedOnly: boolean; view: View };

const until = (ms: number) => {
  if (ms <= 0) return 'now';
  const m = Math.round(ms / 60_000);
  return m < 60 ? `in ${m}m` : m < 48 * 60 ? `in ${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `in ${Math.round(m / 1440)}d`;
};

/**
 * News & events: scrolling headlines (time, source, headline, symbol tags) with a filter for the
 * linked symbol, and a strip of upcoming listings and funding prints. A Calendar view shows the
 * economic and crypto calendar (shared with the phone app). Data arrives through the
 * NewsProvider seam (simulated wire in this build). Clicking a tag loads that symbol into the
 * window's link group.
 */
export function NewsWindow() {
  const stories = useNewsStore((s) => s.stories);
  const events = useNewsStore((s) => s.marketEvents);
  const symbol = useWindowSymbol();
  const setSymbol = useSetWindowSymbol();
  const [settings, patch] = useWindowSettings<Settings>();
  const linkedOnly = settings.linkedOnly ?? false;
  const view = settings.view ?? 'wire';
  const now = useNow(view === 'calendar' ? 1000 : 30_000);
  const shown = useMemo(() => (linkedOnly ? stories.filter((s) => s.symbols.includes(symbol)) : stories), [stories, linkedOnly, symbol]);
  const strip = useMemo(() => events.filter((e) => !linkedOnly || e.symbol === symbol).slice(0, 12), [events, linkedOnly, symbol]);
  return (
    <div className="nw" data-testid="news">
      <div className="nw-bar">
        <Segmented<View>
          value={view}
          onChange={(v) => patch({ view: v })}
          ariaLabel="News view"
          options={[
            { value: 'wire', label: 'Headlines' },
            { value: 'calendar', label: 'Calendar' },
          ]}
        />
        {view === 'wire' && (
          <button className={`cw-btn txt ${linkedOnly ? 'on' : ''}`} onClick={() => patch({ linkedOnly: !linkedOnly })} aria-pressed={linkedOnly} title="Only stories and events for the linked symbol" data-testid="news-linked-only">
            {symbol} only
          </button>
        )}
        <span className="spacer" />
        <span className="faint">{view === 'calendar' ? 'economic & crypto calendar · UTC' : `${shown.length} stories · simulated wire`}</span>
      </div>
      {view === 'calendar' ? (
        <div className="news-dock nw-cal" data-testid="news-calendar-view">
          <Calendar now={now} />
        </div>
      ) : (
        <>
          <div className="nw-events" aria-label="Listings and funding" data-testid="news-events">
            {strip.map((e) => (
              <button key={e.id} className={`nw-ev ${e.kind}`} onClick={() => setSymbol(e.symbol)} title={`${e.title} · ${e.detail} · ${fmtTime(e.time, false)} UTC`} data-testid="news-event">
                {e.kind === 'funding' ? <Percent size={11} /> : <CalendarClock size={11} />}
                <b className="mono">{e.symbol}</b>
                <span className="mono">{e.kind === 'funding' ? e.detail : e.title.replace(`${e.symbol} `, '')}</span>
                <span className="faint">{until(e.time - now)}</span>
              </button>
            ))}
            {strip.length === 0 && <span className="faint">No upcoming listings or funding for {symbol}.</span>}
          </div>
          <div className="nw-list" role="list">
            {shown.map((s) => (
              <div key={s.id} role="listitem" className={`nw-row ${s.impact === 3 ? 'high' : ''}`} data-testid="news-story">
                <span className="mono faint nw-time">{fmtTime(s.time, false)}</span>
                <span className="nw-src">{s.source}</span>
                <span className="nw-hl" title={s.summary}>
                  {s.headline}
                </span>
                <span className="nw-tags">
                  {s.symbols.slice(0, 3).map((t) => (
                    <button key={t} className={`nw-tag ${t === symbol ? 'on' : ''}`} onClick={() => setSymbol(t)} title={`Load ${t} in linked windows`}>
                      {t}
                    </button>
                  ))}
                </span>
              </div>
            ))}
            {shown.length === 0 && <div className="win-empty">No stories for {symbol} yet.</div>}
          </div>
        </>
      )}
    </div>
  );
}
