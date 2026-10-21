import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Search, Plus, CircleUserRound, SquareCode, AppWindow, Download, Settings, Keyboard } from 'lucide-react';
import { openStudio } from './studioLauncher';
import { useHoldingsValue } from '@/stores/useHoldingsValue';
import { useFeeStore } from '@/stores/useFeeStore';
import { useUiStore } from '@/stores/useUiStore';
import { FEE_TIERS, fmtRate } from '@/lib/account/fees';
import { Wordmark } from './Logo';
import { MOD_KEY } from './CommandPalette';
import { useTickFlash } from './useTickFlash';
import { NewsToggle } from './NewsDock';
import { useThemeStore, type Platform, type Theme } from '@/stores/useThemeStore';
import { useCommunityStore } from '@/stores/useCommunityStore';
import { Segmented } from '@/components/ui/Segmented';
import { CliBar } from '@/modules/terminal/CliBar';
import { GasTicker } from './GasTicker';
import { NEW_TAB_EVENT } from './useChartShortcuts';
import { useMarketStore } from '@/stores/useMarketStore';
import { useOnchainStore } from '@/stores/useOnchainStore';
import { useWalletStore } from '@/stores/useWalletStore';
import { usePositionStore, committedNotional, totalUnrealized } from '@/stores/usePositionStore';
import { toast } from '@/stores/useToastStore';
import { fmtSigned, fmtTime, fmtUsd } from '@/lib/format';

/**
 * Function-key navigation — each module has a mnemonic like a terminal function. As in MT5, F4
 * opens the separate editor (Aztex Studio) and F8 the chart's properties (colours, theme, feed).
 */
export const NAV = [
  { to: '/terminal', key: 'F1', label: 'Terminal' },
  { to: '/discovery', key: 'F2', label: 'Data & Discovery' },
  { to: '/onchain', key: 'F3', label: 'On-chain' },
  { to: '/community', key: 'F5', label: 'Community' },
  { to: '/otc', key: 'F6', label: 'OTC Desk' },
];
/** Account lives in the account menu at the right of the top bar. */
export const ACCOUNT_NAV = { to: '/account', key: 'F7', label: 'Account' };

function sessionLabel(h: number): string {
  if (h >= 13 && h < 21) return h < 16 ? 'London / NY' : 'New York';
  if (h >= 7 && h < 13) return 'London';
  return 'Asia';
}

/**
 * One slim row up top — brand, command line, account, then search / news / Studio / account menu.
 * Page tabs and status live in the bottom bar so the top stays uncluttered.
 */
export function TopBar() {
  return (
    <header className="topbar no-select">
      <div className="tb-brand">
        <Wordmark height={16} />
      </div>
      <CliBar />
      <AccountStrip />
      <div className="spacer" />
      <NewsToggle />
      <button className="palette-trigger" onClick={() => window.dispatchEvent(new Event('aztex:palette'))} data-testid="palette-trigger" aria-label="Open command palette" title={`Search symbols, pages and actions (${MOD_KEY})`}>
        <Search size={13} />
        <span>Search or jump to…</span>
        <span className="spacer" />
        <kbd>{MOD_KEY}</kbd>
      </button>
      <StudioButton />
      <AccountMenu />
    </header>
  );
}

/** Page tabs (TradingView keeps its panels along the bottom), fee tier, network fees, feed and clock. */
export function BottomBar() {
  const status = useMarketStore((s) => s.status);
  const providerId = useMarketStore((s) => s.providerId);
  const tier = useFeeStore((s) => s.tier);
  const onchainUnseen = useOnchainStore((s) => s.unseen);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const live = status.state === 'open';
  return (
    <footer className="bottombar no-select">
      <nav className="bb-nav" aria-label="Pages">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} title={`${n.label} (${n.key})`} className={({ isActive }) => `bb-tab ${isActive ? 'active' : ''}`}>
            {n.label}
            {n.to === '/onchain' && onchainUnseen > 0 && (
              <span className="nav-count" title={`${onchainUnseen} new on-chain alert${onchainUnseen === 1 ? '' : 's'}`} data-testid="onchain-unseen">
                {onchainUnseen > 99 ? '99+' : onchainUnseen}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <span className="spacer" />
      <NavLink to="/account" className={`tier-chip ${tier}`} title="Fee tier — redeem a partner code on the Account page" data-testid="tier-chip">
        {FEE_TIERS[tier].label} · {fmtRate(FEE_TIERS[tier].taker)}
      </NavLink>
      <GasTicker />
      <span className="bb-cell" title={status.detail}>
        <span className={live ? 'live-dot' : 'live-dot off'} />
        <span className="dim tb-feed-label">{live ? (providerId === 'live' ? 'Binance live' : 'Simulated feed') : status.state === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</span>
        <span className="num faint tb-latency">{status.latencyMs == null ? '' : `${status.latencyMs}ms`}</span>
      </span>
      <span className="bb-cell">
        <span className="dim tb-session">{sessionLabel(new Date(now).getUTCHours())}</span>
        <span className="num">{fmtTime(now)} UTC</span>
      </span>
    </footer>
  );
}

/**
 * Account menu, TradingView style: who you are and your equity, the account page, quick actions,
 * layout density and System / Dark / Light theme.
 */
function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { theme, followSystem, setTheme, followSystemTheme, platform, setPlatform } = useThemeStore();
  const tier = useFeeStore((s) => s.tier);
  const handle = useCommunityStore((s) => s.handle);
  const balance = useWalletStore((s) => s.balance);
  const positions = usePositionStore((s) => s.positions);
  const holdingsValue = useHoldingsValue();
  const equity = balance + committedNotional(positions) + totalUnrealized(positions) + holdingsValue;
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const themeSel: 'system' | Theme = followSystem ? 'system' : theme;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className={`tb-account ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="Account menu" title="Account, settings and theme" data-testid="account-menu">
        <CircleUserRound size={17} strokeWidth={1.6} />
      </button>
      {open && (
        <div className="menu acct-menu" role="menu" style={{ right: 0, top: 38 }} data-testid="account-menu-panel">
          <div className="am-head">
            <span className="am-avatar">
              <CircleUserRound size={26} strokeWidth={1.4} />
            </span>
            <div className="am-who">
              <div className="am-name">{handle ? `@${handle}` : 'Demo trader'}</div>
              <div className="label mono">
                {fmtUsd(equity)} USDT · {FEE_TIERS[tier].label}
              </div>
            </div>
          </div>
          <div className="divider" />
          <button className="menu-item" onClick={act(() => navigate(ACCOUNT_NAV.to))} data-testid="menu-account">
            <CircleUserRound size={15} /> <span className="grow">Account &amp; balances</span>
            <kbd className="cm-kbd">F7</kbd>
          </button>
          <button className="menu-item" onClick={act(() => useUiStore.getState().openDeposit())}>
            <Plus size={15} /> <span className="grow">Add crypto</span>
          </button>
          <button
            className="menu-item"
            onClick={act(() => {
              if (!location.pathname.startsWith('/terminal')) navigate('/terminal');
              requestAnimationFrame(() => useUiStore.getState().openChartMenu());
            })}
          >
            <Settings size={15} /> <span className="grow">Chart settings</span>
            <kbd className="cm-kbd">Ctrl+,</kbd>
          </button>
          <div className="divider" />
          <button
            className="menu-item"
            onClick={act(() => {
              if (!location.pathname.startsWith('/terminal')) navigate('/terminal');
              requestAnimationFrame(() => window.dispatchEvent(new Event(NEW_TAB_EVENT)));
            })}
            data-testid="menu-new-tab"
          >
            <Plus size={15} /> <span className="grow">New chart tab</span>
            <kbd className="cm-kbd">Alt+Shift+T</kbd>
          </button>
          <button className="menu-item" onClick={act(() => window.open('/terminal', '_blank', 'popup=yes,width=1440,height=900'))} data-testid="menu-new-window">
            <AppWindow size={15} /> <span className="grow">New window</span>
          </button>
          <button className="menu-item" onClick={act(() => openStudio())}>
            <SquareCode size={15} /> <span className="grow">Aztex Studio</span>
            <kbd className="cm-kbd">F4</kbd>
          </button>
          <button className="menu-item" onClick={act(() => useUiStore.getState().setShortcuts(true))} data-testid="menu-shortcuts">
            <Keyboard size={15} /> <span className="grow">Keyboard shortcuts</span>
            <kbd className="cm-kbd">?</kbd>
          </button>
          <div className="divider" />
          <div className="am-row">
            <span className="label">Layout</span>
            <Segmented<Platform>
              value={platform}
              onChange={setPlatform}
              ariaLabel="Layout density"
              options={[
                { value: 'website', label: 'Web' },
                { value: 'mobile', label: 'Mobile' },
                { value: 'terminal', label: 'Desktop' },
              ]}
            />
          </div>
          <div className="am-themes" role="radiogroup" aria-label="Theme">
            {(['system', 'dark', 'light'] as const).map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={themeSel === t}
                className={`am-theme ${themeSel === t ? 'on' : ''}`}
                onClick={() => (t === 'system' ? followSystemTheme() : setTheme(t))}
                data-testid={`theme-${t}`}
              >
                <span className={`am-thumb ${t}`}>
                  <i />
                  <i />
                  <i />
                </span>
                {t === 'system' ? 'System' : t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Aztex Studio lives outside the terminal: open its window (F4) or install it as a desktop app. */
function StudioButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className={`btn sm ghost icon ${open ? 'active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="studio-menu" aria-label="Aztex Studio" title="Aztex Studio — the indicator & strategy editor app (F4)">
        <SquareCode size={14} />
      </button>
      {open && (
        <div className="menu" style={{ right: 0, top: 32, width: 250 }}>
          <div className="menu-group">Aztex Studio · separate app</div>
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false);
              openStudio();
            }}
            data-testid="open-studio"
          >
            <AppWindow size={14} /> <span className="grow">Open Studio</span>
            <kbd className="cm-kbd">F4</kbd>
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false);
              navigate('/get-studio');
            }}
            data-testid="get-studio"
          >
            <Download size={14} /> <span className="grow">Install as desktop app…</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Account strip: equity, available, unrealized, realized + deposit/withdraw. */
export function AccountStrip() {
  const balance = useWalletStore((s) => s.balance);
  const positions = usePositionStore((s) => s.positions);
  const realized = usePositionStore((s) => s.realized);
  const [mode, setMode] = useState<null | 'withdraw'>(null);
  const [amount, setAmount] = useState('');
  const holdingsValue = useHoldingsValue();
  const upnl = totalUnrealized(positions);
  const committed = committedNotional(positions);
  const equity = balance + committed + upnl + holdingsValue;
  const flash = useTickFlash(Math.round(equity * 100));

  const submit = () => {
    const n = Number(amount);
    const w = useWalletStore.getState();
    if (w.withdraw(n)) {
      toast({ kind: 'success', title: 'Withdrawal sent', detail: `${fmtUsd(n)} USDT` });
      setMode(null);
      setAmount('');
    } else toast({ kind: 'error', title: 'Insufficient balance' });
  };

  return (
    <div className="acct no-select" data-testid="wallet">
      <span className="acct-cell">
        <span className="label">Equity</span>
        <span className={`num acct-eq ${flash.cls}`} key={flash.key}>
          {fmtUsd(equity)}
        </span>
      </span>
      <span className="acct-cell">
        <span className="label">Available</span>
        <span className="num" data-testid="wallet-balance">{fmtUsd(balance)}</span>
      </span>
      <span className="acct-cell hide-narrow">
        <span className="label">In positions</span>
        <span className="num">{fmtUsd(committed)}</span>
      </span>
      <span className="acct-cell">
        <span className="label">Unrealized</span>
        <span className={`num ${upnl >= 0 ? 'up' : 'down'}`}>{fmtSigned(upnl)}</span>
      </span>
      <span className="acct-cell hide-narrow">
        <span className="label">Realized</span>
        <span className={`num ${realized >= 0 ? 'up' : 'down'}`}>{fmtSigned(realized)}</span>
      </span>
      {mode ? (
        <span className="row" style={{ gap: 4 }}>
          <span className="input-wrap" style={{ width: 150 }}>
            <input autoFocus inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label={`${mode} amount`} />
            <span className="suffix">USDT</span>
          </span>
          <button className="btn sm primary" onClick={submit}>Withdraw</button>
          <button className="btn sm ghost" onClick={() => setMode(null)}>Cancel</button>
        </span>
      ) : (
        <span className="row" style={{ gap: 4 }}>
          <button className="btn sm primary" onClick={() => useUiStore.getState().openDeposit()} data-testid="open-deposit">
            <Plus size={12} /> Add crypto
          </button>
          <button className="btn sm ghost" onClick={() => setMode('withdraw')}>Withdraw</button>
        </span>
      )}
    </div>
  );
}
