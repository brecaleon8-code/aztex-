import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Newspaper, CalendarDays, PanelLeft, PanelRight, ChevronsLeft, ChevronsRight, X, Bell, BellOff, ArrowUp } from 'lucide-react';
import { useNewsStore, NEWS_CATEGORIES, unreadCount, type DockSide } from '@/stores/useNewsStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { usePositionStore } from '@/stores/usePositionStore';
import { fmtEventValue, surprise, type EconEvent, type Impact, type NewsStory } from '@/lib/news/types';
import { fmtTime } from '@/lib/format';
import './news-dock.css';

/* ── Shared helpers ─────────────────────────────────────────────────────────────────────── */

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function ago(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function countdown(ms: number): string {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function ImpactBars({ impact }: { impact: Impact }) {
  return (
    <span className={`impact i${impact}`} aria-label={['', 'Low', 'Medium', 'High'][impact] + ' impact'} title={['', 'Low', 'Medium', 'High'][impact] + ' impact'}>
      <i />
      <i />
      <i />
    </span>
  );
}

function ImpactFilter({ value, onChange, label }: { value: Impact; onChange: (i: Impact) => void; label: string }) {
  return (
    <select className="nd-select" value={value} onChange={(e) => onChange(+e.target.value as Impact)} aria-label={label}>
      <option value={1}>All impact</option>
      <option value={2}>Medium +</option>
      <option value={3}>High only</option>
    </select>
  );
}

const nextHigh = (events: EconEvent[], now: number) => events.find((e) => e.time > now && e.impact === 3);

/* ── Dock ───────────────────────────────────────────────────────────────────────────────── */

/** Renders on the side it is pinned to; the App mounts one per side and each checks `side`. */
export function NewsDock({ side }: { side: DockSide }) {
  const pinned = useNewsStore((s) => s.pinned);
  const current = useNewsStore((s) => s.side);
  const collapsed = useNewsStore((s) => s.collapsed);
  if (!pinned || current !== side) return null;
  return collapsed ? <DockRail side={side} /> : <DockPanel side={side} />;
}

function DockRail({ side }: { side: DockSide }) {
  const { stories, events, lastSeen, setCollapsed, setTab } = useNewsStore();
  const now = useNow(1000);
  const unread = unreadCount(stories, lastSeen);
  const nh = nextHigh(events, now);
  const open = (t: 'feed' | 'calendar') => {
    setTab(t);
    setCollapsed(false);
  };
  return (
    <aside className={`news-rail ${side}`} data-testid="news-rail" aria-label="News (collapsed)">
      <button className="rail-btn" onClick={() => setCollapsed(false)} aria-label="Expand news" title="Expand">
        {side === 'right' ? <ChevronsLeft size={14} /> : <ChevronsRight size={14} />}
      </button>
      <button className="rail-btn" onClick={() => open('feed')} aria-label={`Headlines, ${unread} new`} title="Headlines">
        <Newspaper size={15} />
        {unread > 0 && <span className="rail-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <button className="rail-btn" onClick={() => open('calendar')} aria-label="Economic calendar" title="Calendar">
        <CalendarDays size={15} />
      </button>
      {nh && (
        <button className="rail-next" onClick={() => open('calendar')} title={`${nh.region} ${nh.title}`}>
          <span className="mono">{countdown(nh.time - now)}</span>
          <span>{nh.region}</span>
        </button>
      )}
    </aside>
  );
}

function DockPanel({ side }: { side: DockSide }) {
  const { width, setWidth, tab, setTab, setSide, setCollapsed, setPinned, alerts, setAlerts, markSeen, events } = useNewsStore();
  const now = useNow(1000);
  const nh = nextHigh(events, now);

  // Opening the panel marks everything read; so does new news arriving while it is open.
  const storiesLen = useNewsStore((s) => s.stories.length);
  useEffect(() => markSeen(), [storiesLen, markSeen]);

  const drag = useRef<{ x: number; w: number } | null>(null);
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    setWidth(drag.current.w + (side === 'right' ? -dx : dx));
  };
  const onUp = () => (drag.current = null);

  return (
    <aside className={`news-dock ${side}`} style={{ width }} data-testid="news-dock" aria-label="News and calendar">
      <div className="nd-resize" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={() => setWidth(360)} role="separator" aria-orientation="vertical" aria-label="Resize news panel" />
      <header className="nd-head">
        <div className="nd-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'feed'} className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')} data-testid="news-tab-feed">
            <Newspaper size={13} /> Headlines
          </button>
          <button role="tab" aria-selected={tab === 'calendar'} className={tab === 'calendar' ? 'on' : ''} onClick={() => setTab('calendar')} data-testid="news-tab-calendar">
            <CalendarDays size={13} /> Calendar
          </button>
        </div>
        <span className="spacer" />
        <button className="nd-icon" onClick={() => setAlerts(!alerts)} aria-pressed={alerts} aria-label={alerts ? 'Mute high-impact alerts' : 'Enable high-impact alerts'} title={alerts ? 'High-impact alerts on' : 'Alerts muted'}>
          {alerts ? <Bell size={13} /> : <BellOff size={13} />}
        </button>
        <button className="nd-icon" onClick={() => setSide(side === 'right' ? 'left' : 'right')} aria-label={`Move to the ${side === 'right' ? 'left' : 'right'}`} title={`Pin to ${side === 'right' ? 'left' : 'right'}`} data-testid="news-swap">
          {side === 'right' ? <PanelLeft size={13} /> : <PanelRight size={13} />}
        </button>
        <button className="nd-icon" onClick={() => setCollapsed(true)} aria-label="Collapse to rail" title="Collapse">
          {side === 'right' ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
        </button>
        <button className="nd-icon" onClick={() => setPinned(false)} aria-label="Close news" title="Close (Alt+N)" data-testid="news-close">
          <X size={13} />
        </button>
      </header>
      {nh && (
        <button className="nd-next" onClick={() => setTab('calendar')} data-testid="news-next">
          <span className="live-dot" />
          <span className="faint">Next high impact</span>
          <span className="nd-next-title">
            {nh.region === 'CRYPTO' ? '' : `${nh.region} `}
            {nh.title}
          </span>
          <span className="mono nd-next-cd">{countdown(nh.time - now)}</span>
        </button>
      )}
      {tab === 'feed' ? <Feed now={now} /> : <Calendar now={now} />}
    </aside>
  );
}

/* ── Headlines ──────────────────────────────────────────────────────────────────────────── */

function Feed({ now }: { now: number }) {
  const { stories, categories, toggleCategory, setAllCategories, mineOnly, setMineOnly, minImpact, setMinImpact } = useNewsStore();
  const selected = useMarketStore((s) => s.selected);
  const watchlist = useMarketStore((s) => s.watchlist);
  const positions = usePositionStore((s) => s.positions);
  const mine = useMemo(() => new Set([selected, ...watchlist, ...positions.map((p) => p.symbol)]), [selected, watchlist, positions]);
  const all = categories.length === NEWS_CATEGORIES.length;

  const shown = stories.filter((s) => categories.includes(s.category) && s.impact >= minImpact && (!mineOnly || s.symbols.some((x) => mine.has(x)) || (s.category === 'macro' && s.impact === 3)));

  // Freeze the list while the reader is scrolled down, and offer a "N new" pill instead of shifting content.
  const listRef = useRef<HTMLDivElement>(null);
  const [frozenAt, setFrozenAt] = useState<number | null>(null);
  const onScroll = () => {
    const top = listRef.current?.scrollTop ?? 0;
    if (top > 40 && frozenAt == null) setFrozenAt(shown[0]?.time ?? Date.now());
    else if (top <= 40 && frozenAt != null) setFrozenAt(null);
  };
  const visible = frozenAt == null ? shown : shown.filter((s) => s.time <= frozenAt);
  const pending = shown.length - visible.length;

  return (
    <>
      <div className="nd-filters">
        <button className={`nd-chip ${all ? 'on' : ''}`} onClick={setAllCategories}>
          All
        </button>
        {NEWS_CATEGORIES.map((c) => (
          <button key={c.id} className={`nd-chip ${!all && categories.includes(c.id) ? 'on' : ''}`} onClick={() => toggleCategory(c.id)} data-testid={`news-cat-${c.id}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="nd-filters sub">
        <label className="nd-check">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} data-testid="news-mine" />
          My assets
          <span className="faint" title="Selected symbol, watchlist and open positions">
            ({mine.size})
          </span>
        </label>
        <span className="spacer" />
        <ImpactFilter value={minImpact} onChange={setMinImpact} label="Headline impact filter" />
      </div>
      <div className="nd-list" ref={listRef} onScroll={onScroll} data-testid="news-list">
        {pending > 0 && (
          <button
            className="nd-new-pill"
            onClick={() => {
              listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              setFrozenAt(null);
            }}
          >
            <ArrowUp size={12} /> {pending} new
          </button>
        )}
        {visible.map((s) => (
          <StoryRow key={s.id} s={s} now={now} mine={s.symbols.some((x) => mine.has(x))} />
        ))}
        {visible.length === 0 && <div className="empty">No headlines match these filters.</div>}
      </div>
    </>
  );
}

const catLabel = (s: NewsStory) => {
  const l = NEWS_CATEGORIES.find((c) => c.id === s.category)?.label ?? '';
  return l.toLowerCase() === s.source.toLowerCase() ? '' : l;
};

function StoryRow({ s, now, mine }: { s: NewsStory; now: number; mine: boolean }) {
  const [open, setOpen] = useState(false);
  const select = useMarketStore((st) => st.select);
  const navigate = useNavigate();
  const fresh = now - s.time < 60_000;
  return (
    <article className={`nd-story ${s.impact === 3 ? 'high' : ''} ${mine ? 'mine' : ''} ${fresh ? 'fresh' : ''}`} data-testid="news-story">
      <button className="nd-story-main" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="nd-meta">
          <span className="mono faint" title={fmtTime(s.time)}>
            {ago(s.time, now)}
          </span>
          <span className="nd-src">{s.source}</span>
          {catLabel(s) && <span className={`nd-cat c-${s.category}`}>{catLabel(s)}</span>}
          {s.impact === 3 && <span className="nd-flag">High</span>}
        </span>
        <span className="nd-hl">{s.headline}</span>
        {open && s.summary && <span className="nd-sum">{s.summary}</span>}
      </button>
      {s.symbols.length > 0 && (
        <span className="nd-syms">
          {s.symbols.map((x) => (
            <button
              key={x}
              className={`nd-sym ${s.sentiment > 0 ? 'pos' : s.sentiment < 0 ? 'neg' : ''}`}
              onClick={() => {
                select(x);
                navigate('/terminal');
              }}
              title={`Open ${x} on the chart`}
            >
              {x}
              {s.sentiment > 0 ? ' ▲' : s.sentiment < 0 ? ' ▼' : ''}
            </button>
          ))}
        </span>
      )}
    </article>
  );
}

/* ── Economic calendar ─────────────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
function dayLabel(t: number, now: number) {
  const d = Math.floor(t / DAY) - Math.floor(now / DAY);
  const name = new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return d === 0 ? `Today · ${name}` : d === 1 ? `Tomorrow · ${name}` : d === -1 ? `Yesterday · ${name}` : name;
}

function Calendar({ now }: { now: number }) {
  const { events, calMinImpact, setCalMinImpact } = useNewsStore();
  const [kind, setKind] = useState<'all' | 'macro' | 'crypto'>('all');
  const [past, setPast] = useState(false);
  const list = events.filter((e) => e.impact >= calMinImpact && (kind === 'all' || e.kind === kind) && (past || e.time > now - 6 * 3600_000));
  const nowRef = useRef<HTMLDivElement>(null);
  useEffect(() => nowRef.current?.scrollIntoView({ block: 'center' }), []);

  const groups: { label: string; items: EconEvent[] }[] = [];
  for (const e of list) {
    const label = dayLabel(e.time, now);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1)!.items.push(e);
  }
  let nowPlaced = false;

  return (
    <>
      <div className="nd-filters">
        {(['all', 'macro', 'crypto'] as const).map((k) => (
          <button key={k} className={`nd-chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
            {k === 'all' ? 'All' : k === 'macro' ? 'Economic' : 'Crypto'}
          </button>
        ))}
        <span className="spacer" />
        <ImpactFilter value={calMinImpact} onChange={setCalMinImpact} label="Calendar impact filter" />
      </div>
      <div className="nd-cal-head">
        <span>UTC</span>
        <span>Event</span>
        <span className="r">Actual</span>
        <span className="r">F'cast</span>
        <span className="r">Prev</span>
      </div>
      <div className="nd-list" data-testid="news-calendar">
        <button className="nd-more" onClick={() => setPast((v) => !v)}>
          {past ? 'Hide earlier events' : 'Show earlier events'}
        </button>
        {groups.map((g) => (
          <section key={g.label}>
            <div className="nd-day">{g.label}</div>
            {g.items.map((e) => {
              const marker = !nowPlaced && e.time > now;
              if (marker) nowPlaced = true;
              return (
                <div key={e.id}>
                  {marker && (
                    <div className="nd-now" ref={nowRef}>
                      <span>Now · {fmtTime(now, false)}</span>
                    </div>
                  )}
                  <EventRow e={e} now={now} />
                </div>
              );
            })}
          </section>
        ))}
        {!nowPlaced && <div className="nd-now" ref={nowRef}><span>Now · {fmtTime(now, false)}</span></div>}
        {list.length === 0 && <div className="empty">No events match these filters.</div>}
      </div>
    </>
  );
}

function EventRow({ e, now }: { e: EconEvent; now: number }) {
  const upcoming = e.time > now;
  const soon = upcoming && e.time - now < 3600_000;
  const s = surprise(e);
  return (
    <div className={`nd-ev ${upcoming ? 'ev-up' : 'ev-done'} ${soon ? 'soon' : ''} i${e.impact}`} data-testid="news-event">
      <span className="nd-ev-time mono">
        {fmtTime(e.time, false)}
        {upcoming && e.time - now < DAY && <span className="nd-cd">{countdown(e.time - now)}</span>}
      </span>
      <span className="nd-ev-main">
        <span className="nd-ev-title">
          <span className={`nd-region r-${e.region}`}>{e.region === 'CRYPTO' ? '₿' : e.region}</span>
          <ImpactBars impact={e.impact} />
          <span className="nd-ev-name">{e.title}</span>
        </span>
        {e.kind === 'crypto' && e.detail && <span className="nd-ev-detail">{e.detail}</span>}
      </span>
      {e.kind === 'macro' ? (
        <>
          <span className={`r mono nd-actual ${s > 0 ? 'beat' : s < 0 ? 'miss' : ''}`} title={s > 0 ? 'Better than expected' : s < 0 ? 'Worse than expected' : undefined}>
            {fmtEventValue(e, e.actual)}
          </span>
          <span className="r mono dim">{fmtEventValue(e, e.forecast)}</span>
          <span className="r mono faint">{fmtEventValue(e, e.previous)}</span>
        </>
      ) : (
        <span className="nd-ev-span" />
      )}
    </div>
  );
}

/* ── Top-bar toggle ─────────────────────────────────────────────────────────────────────── */

export function NewsToggle() {
  const pinned = useNewsStore((s) => s.pinned);
  const collapsed = useNewsStore((s) => s.collapsed);
  const stories = useNewsStore((s) => s.stories);
  const lastSeen = useNewsStore((s) => s.lastSeen);
  const toggle = useNewsStore((s) => s.toggleDock);
  const unread = pinned && !collapsed ? 0 : unreadCount(stories, lastSeen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyN') {
        e.preventDefault();
        useNewsStore.getState().toggleDock();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <button className={`btn sm ghost news-toggle ${pinned ? 'active' : ''}`} onClick={toggle} aria-pressed={pinned && !collapsed} aria-label="News & calendar" title="News & calendar (Alt+N)" data-testid="news-toggle">
      <Newspaper size={14} />
      <span className="hide-narrow">News</span>
      {unread > 0 && <span className="news-badge">{unread > 99 ? '99+' : unread}</span>}
    </button>
  );
}
