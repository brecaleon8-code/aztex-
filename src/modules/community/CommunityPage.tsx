import { useEffect, useRef, useState } from 'react';
import { AtSign, BadgeCheck, Copy, Check, UserPlus, Send, Heart, MessageCircle, Share2, Unlink } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { useCommunityStore, userByCode, type Post } from '@/stores/useCommunityStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { toast } from '@/stores/useToastStore';
import { CANNED_REPLIES } from '@/lib/mock/community';
import { suggestedLevels } from '@/lib/trading/pnl';
import { fmtTime } from '@/lib/format';
import type { TradeChipData } from '@/types';
import { TradeChip } from './TradeChip';
import { AttachTrade } from './AttachTrade';
import './community.css';

export function CommunityPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Community</h1>
          <p>Private by default: connect by friend code, share live setups, discuss reads.</p>
        </div>
      </div>
      <div className="comm-grid">
        <div className="col" style={{ gap: 'var(--gap)' }}>
          <Identity />
          <Contacts />
        </div>
        <Chat />
        <Forum />
      </div>
    </div>
  );
}

function Identity() {
  const { handle, friendCode, linkHandle, unlinkHandle } = useCommunityStore();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(friendCode);
    } catch {
      /* clipboard may be unavailable; still show feedback */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <Panel title="Your identity" testId="identity">
      <div className="col" style={{ gap: 12 }}>
        <div className="field">
          <span className="label">X handle</span>
          {handle && !editing ? (
            <div className="row">
              <span className="handle">
                <AtSign size={13} />
                {handle}
                <BadgeCheck size={14} className="verified" aria-label="Verified" />
              </span>
              <span className="spacer" />
              <button className="btn ghost sm" onClick={() => { setDraft(handle); setEditing(true); }}>Change</button>
              <button className="btn ghost sm icon" onClick={unlinkHandle} aria-label="Unlink handle" title="Unlink">
                <Unlink size={12} />
              </button>
            </div>
          ) : (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (linkHandle(draft)) {
                  setEditing(false);
                  setErr('');
                  toast({ kind: 'success', title: 'X handle linked', detail: '@' + draft.replace(/^@/, '') });
                } else setErr('1–15 letters, numbers or underscores');
              }}
            >
              <span className="input-wrap grow">
                <AtSign size={13} className="faint" />
                <input placeholder="handle" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="X handle" data-testid="handle-input" />
              </span>
              <button className="btn primary" type="submit">Link</button>
            </form>
          )}
          {err && <span className="error-text">{err}</span>}
        </div>
        <div className="field">
          <span className="label">Your friend code — share it to let someone message you</span>
          <div className="row">
            <span className="friend-code mono" data-testid="friend-code">{friendCode}</span>
            <button className="btn sm" onClick={copy}>
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Contacts() {
  const { contacts, active, setActive, addContact, threads } = useCommunityStore();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  return (
    <Panel title="Contacts" sub={`${contacts.length}`} flush testId="contacts">
      <form
        className="row contact-add"
        onSubmit={(e) => {
          e.preventDefault();
          const r = addContact(code);
          if (r.ok) {
            toast({ kind: 'success', title: 'Contact added', detail: r.name });
            setCode('');
            setErr('');
          } else setErr(r.error);
        }}
      >
        <input className="input mono grow" placeholder="AZT-XXXX-XXX" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Friend code" data-testid="add-contact-input" />
        <button className="btn" type="submit" aria-label="Add contact">
          <UserPlus size={13} />
        </button>
      </form>
      {err && <div className="error-text" style={{ padding: '0 14px 8px' }}>{err}</div>}
      <div className="contacts-list">
        {contacts.map((c) => {
          const u = userByCode(c);
          if (!u) return null;
          const last = threads[c]?.at(-1);
          return (
            <button key={c} className={`contact ${active === c ? 'on' : ''}`} onClick={() => setActive(c)}>
              <span className="avatar">
                {u.name.split(' ').map((p) => p[0]).join('')}
                <span className={`presence ${u.online ? 'online' : ''}`} />
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="contact-name">{u.name}</span>
                <span className="label contact-last">{last ? (last.trade ? `Shared ${last.trade.side} ${last.trade.symbol}` : last.text) : '@' + u.handle}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="label" style={{ padding: '8px 14px 12px' }}>Try code AZT-9TR4-6WN or AZT-5MB1-8QD</div>
    </Panel>
  );
}

function Chat() {
  const { active, threads, send } = useCommunityStore();
  const [text, setText] = useState('');
  const [trade, setTrade] = useState<TradeChipData | undefined>();
  const [typing, setTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const user = active ? userByCode(active) : undefined;
  const msgs = active ? (threads[active] ?? []) : [];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length, typing]);

  if (!active || !user) return <Panel title="Messages"><div className="empty">Pick a contact.</div></Panel>;

  const submit = () => {
    if (!text.trim() && !trade) return;
    send(active, { text: text.trim() || undefined, trade });
    setText('');
    setTrade(undefined);
    // Mock counterpart replies — sometimes with their own live setup.
    const code = active;
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const reply = CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)];
      let theirs: TradeChipData | undefined;
      if (trade || Math.random() < 0.4) {
        const sym = trade?.symbol ?? 'ETH';
        const side = trade ? (trade.side === 'Long' ? 'Short' : 'Long') : 'Long';
        const px = useMarketStore.getState().assets[sym].price;
        theirs = { symbol: sym, side, entry: px, ...suggestedLevels(side, px) };
      }
      useCommunityStore.getState().send(code, { text: reply, trade: theirs }, code);
    }, 1300 + Math.random() * 1200);
  };

  return (
    <Panel
      title={user.name}
      sub={
        <span className="row" style={{ gap: 5 }}>
          <span className={`presence-inline ${user.online ? 'online' : ''}`} />@{user.handle} · {user.online ? 'online' : 'away'}
        </span>
      }
      flush
      className="chat"
      testId="chat"
    >
      <div className="chat-scroll" ref={scroller}>
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.from === 'me' ? 'mine' : ''}`} data-testid="message">
            {m.text && <div className="bubble">{m.text}</div>}
            {m.trade && <TradeChip trade={m.trade} />}
            <span className="label">{fmtTime(m.time, false)}</span>
          </div>
        ))}
        {typing && (
          <div className="msg">
            <div className="bubble typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {trade && <TradeChip trade={trade} compact />}
        <div className="row">
          <AttachTrade value={trade} onChange={setTrade} />
          <input className="input grow" placeholder={`Message ${user.name.split(' ')[0]}…`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" data-testid="message-input" />
          <button className="btn primary icon" type="submit" aria-label="Send" disabled={!text.trim() && !trade} data-testid="send-message">
            <Send size={14} />
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Forum() {
  const { posts, post, handle } = useCommunityStore();
  const [text, setText] = useState('');
  const [trade, setTrade] = useState<TradeChipData | undefined>();
  return (
    <Panel title="Forum" sub="trades & market reads" flush className="forum" testId="forum">
      <form
        className="composer forum-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          post(text.trim(), trade);
          setText('');
          setTrade(undefined);
        }}
      >
        <textarea className="input" rows={2} placeholder="Share a trade or a read…" value={text} onChange={(e) => setText(e.target.value)} aria-label="New post" data-testid="post-input" />
        {trade && <TradeChip trade={trade} compact />}
        <div className="row">
          <AttachTrade value={trade} onChange={setTrade} />
          <span className="spacer" />
          <span className="label">{handle ? `posting as @${handle}` : 'link your X handle to show it on posts'}</span>
          <button className="btn primary sm" type="submit" disabled={!text.trim()} data-testid="publish-post">Post</button>
        </div>
      </form>
      <div className="forum-feed">
        {posts.map((p) => (
          <PostCard key={p.id} p={p} />
        ))}
      </div>
    </Panel>
  );
}

function PostCard({ p }: { p: Post }) {
  const { toggleLike } = useCommunityStore.getState();
  const mins = Math.max(1, Math.round((Date.now() - p.time) / 60_000));
  return (
    <article className="post" data-testid="post">
      <div className="row">
        <span className="avatar sm">{p.author.split(' ').map((x) => x[0]).join('')}</span>
        <span style={{ fontWeight: 600 }}>{p.author}</span>
        {p.handle && (
          <span className="handle sm">
            @{p.handle}
            <BadgeCheck size={12} className="verified" />
          </span>
        )}
        <span className="spacer" />
        <span className="label">{mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`}</span>
      </div>
      <p className="post-text">{p.text}</p>
      {p.trade && <TradeChip trade={p.trade} />}
      <div className="row post-actions">
        <button className={`btn ghost sm ${p.liked ? 'liked' : ''}`} onClick={() => toggleLike(p.id)} aria-pressed={p.liked}>
          <Heart size={13} fill={p.liked ? 'currentColor' : 'none'} /> <span className="mono">{p.likes}</span>
        </button>
        <span className="btn ghost sm" style={{ cursor: 'default' }}>
          <MessageCircle size={13} /> <span className="mono">{p.comments}</span>
        </span>
        <button
          className="btn ghost sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${location.origin}/community#${p.id}`);
            } catch {
              /* ignore */
            }
            toast({ kind: 'info', title: 'Link copied' });
          }}
        >
          <Share2 size={13} /> Share
        </button>
      </div>
    </article>
  );
}
