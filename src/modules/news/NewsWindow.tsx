import { useMemo, useState } from 'react';
import { CalendarClock, Percent, Search, X } from 'lucide-react';
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
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return stories.filter((s) => (!linkedOnly || s.symbols.includes(symbol)) && (!t || s.headline.toLowerCase().includes(t) || s.source.toLowerCase().includes(t) || s.symbols.some((x) => x.toLowerCase() === t)));
  }, [stories, linkedOnly, symbol, q]);
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
        {view === 'wire' && (
          <label className="nw-search">
            <Search size={12} className="faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search headlines, sources, symbols" aria-label="Search news" spellCheck={false} data-testid="news-search" />
            {q && (
              <button className="nw-clear" onClick={() => setQ('')} aria-label="Clear search">
                <X size={11} />
              </button>
            )}
          </label>
        )}
        <span className="spacer" />
        <span className="faint nw-count">{view === 'calendar' ? 'economic & crypto calendar · UTC' : `${shown.length} ${shown.length === 1 ? 'story' : 'stories'} · simulated wire`}</span>
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
          <div className="nw-list" role="table" aria-label="Headlines">
            <div className="nw-row nw-th" role="row">
              <span role="columnheader">Time</span>
              <span role="columnheader">Headline</span>
              <span role="columnheader" className="right">
                Source
              </span>
            </div>
            {shown.map((s) => (
              <div key={s.id} role="row" className={`nw-row ${s.impact === 3 ? 'high' : ''} ${open === s.id ? 'open' : ''}`} onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id} data-testid="news-story">
                <span role="cell" className="mono nw-time">
                  {fmtTime(s.time)}
                </span>
                <span role="cell" className="nw-main">
                  <span className="nw-hl">{s.headline}</span>
                  {s.symbols.slice(0, 3).map((t) => (
                    <button
                      key={t}
                      className={`nw-tag ${t === symbol ? 'on' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSymbol(t);
                      }}
                      title={`Load ${t} in linked windows`}
                    >
                      {t}
                    </button>
                  ))}
                  {open === s.id && (
                    <span className="nw-summary" data-testid="news-summary">
                      {s.summary}
                    </span>
                  )}
                </span>
                <span role="cell" className="nw-src">
                  {s.source}
                </span>
              </div>
            ))}
            {shown.length === 0 && <div className="win-empty">{q ? `No stories match "${q}".` : `No stories for ${symbol} yet.`}</div>}
          </div>
        </>
      )}
    </div>
  );
}
