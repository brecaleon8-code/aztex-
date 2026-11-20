import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AppWindow, ChevronDown, CircleUserRound, Download, Keyboard, Plus, Search, Settings, SquareCode, Wallet } from 'lucide-react';
import { Logo } from '../Logo';
import { MOD_KEY } from '../CommandPalette';
import { useTickFlash } from '../useTickFlash';
import { openStudio } from '../studioLauncher';
import { useHoldingsValue } from '@/stores/useHoldingsValue';
import { useFeeStore } from '@/stores/useFeeStore';
import { useUiStore } from '@/stores/useUiStore';
import { useWalletStore } from '@/stores/useWalletStore';
import { usePositionStore, committedNotional, totalUnrealized } from '@/stores/usePositionStore';
import { useCommunityStore } from '@/stores/useCommunityStore';
import { useThemeStore, type Platform, type Theme } from '@/stores/useThemeStore';
import { toast } from '@/stores/useToastStore';
import { FEE_TIERS, fmtRate } from '@/lib/account/fees';
import { fmtSigned, fmtTime, fmtUsd } from '@/lib/format';
import { Segmented } from '@/components/ui/Segmented';
import { ACCOUNT_NAV } from './nav';
import { UniversalSearch } from './UniversalSearch';

/** Closes a popover on an outside press or Esc (Esc consumed, so a maximized window stays). */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
    };
    document.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [open, close]);
  return ref;
}

/**
 * 40px top bar: logo mark, one universal search / command field, then the UTC clock, fee tier, a
 * compact wallet (deposit / withdraw in its menu) and the profile menu (theme, layout, account).
 */
export function TopBar() {
  return (
    <header className="shell-top no-select" data-testid="topbar">
      <NavLink to="/terminal" className="st-brand" aria-label="Aztex terminal">
        <Logo size={20} />
      </NavLink>
      <UniversalSearch />
      <button className="st-palette" onClick={() => window.dispatchEvent(new Event('aztex:palette'))} data-testid="palette-trigger" aria-label="Open command palette" title={`Command palette (${MOD_KEY})`}>
        <Search size={12} />
        <kbd>{MOD_KEY}</kbd>
      </button>
      <span className="spacer" />
      <Clock />
      <TierChip />
      <WalletMenu />
      <ProfileMenu />
    </header>
  );
}

function Clock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="st-clock mono" title="UTC" data-testid="clock">
      {fmtTime(now)} <span className="faint">UTC</span>
    </span>
  );
}

function TierChip() {
  const tier = useFeeStore((s) => s.tier);
  return (
    <NavLink to="/account" className={`tier-chip ${tier}`} title="Fee tier: maker / taker. Redeem a partner code on the Account page." data-testid="tier-chip">
      {FEE_TIERS[tier].label} · {fmtRate(FEE_TIERS[tier].maker)} / {fmtRate(FEE_TIERS[tier].taker)}
    </NavLink>
  );
}

function useEquity() {
  const balance = useWalletStore((s) => s.balance);
  const positions = usePositionStore((s) => s.positions);
  const realized = usePositionStore((s) => s.realized);
  const holdings = useHoldingsValue();
  const upnl = totalUnrealized(positions);
  const committed = committedNotional(positions);
  return { balance, committed, upnl, realized, holdings, equity: balance + committed + upnl + holdings };
}

/** Equity in the bar; the breakdown, Add crypto and Withdraw in its menu. */
function WalletMenu() {
  const [open, setOpen] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const ref = useDismiss(open, () => setOpen(false));
  const e = useEquity();
  const flash = useTickFlash(Math.round(e.equity * 100));
  const submit = () => {
    const n = Number(amount);
    if (useWalletStore.getState().withdraw(n)) {
      toast({ kind: 'success', title: 'Withdrawal sent', detail: `${fmtUsd(n)} USDT` });
      setAmount('');
      setWithdraw(false);
      setOpen(false);
    } else toast({ kind: 'error', title: 'Insufficient balance' });
  };
  const row = (label: string, value: string, cls = '', testId?: string) => (
    <div className="wm-row">
      <span className="label">{label}</span>
      <span className={`num ${cls}`} data-testid={testId}>
        {value}
      </span>
    </div>
  );
  return (
    <div ref={ref} className="st-pop" data-testid="wallet">
      <button className={`st-wallet ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" title="Wallet: equity, deposit and withdraw" data-testid="wallet-menu">
        <Wallet size={13} />
        <span className={`num ${flash.cls}`} key={flash.key}>
          {fmtUsd(e.equity)}
        </span>
        <span className="faint">USDT</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="menu wallet-menu" role="menu" data-testid="wallet-panel">
          {row('Equity', fmtUsd(e.equity))}
          {row('Available', fmtUsd(e.balance), '', 'wallet-balance')}
          {row('In positions', fmtUsd(e.committed))}
          {row('Unrealized', fmtSigned(e.upnl), e.upnl >= 0 ? 'up' : 'down')}
          {row('Realized', fmtSigned(e.realized), e.realized >= 0 ? 'up' : 'down')}
          <div className="divider" />
          {withdraw ? (
            <div className="wm-withdraw">
              <span className="input-wrap">
                <input autoFocus inputMode="decimal" placeholder="Amount" value={amount} onChange={(ev) => setAmount(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && submit()} aria-label="withdraw amount" />
                <span className="suffix">USDT</span>
              </span>
              <button className="btn sm primary" onClick={submit}>
                Withdraw
              </button>
            </div>
          ) : (
            <div className="wm-actions">
              <button
                className="btn sm primary"
                onClick={() => {
                  setOpen(false);
                  useUiStore.getState().openDeposit();
                }}
                data-testid="open-deposit"
              >
                <Plus size={12} /> Add crypto
              </button>
              <button className="btn sm ghost" onClick={() => setWithdraw(true)} data-testid="open-withdraw">
                Withdraw
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Who you are, the account page, Studio, shortcuts, layout density and System / Dark / Light. */
function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const navigate = useNavigate();
  const { theme, followSystem, setTheme, followSystemTheme, platform, setPlatform } = useThemeStore();
  const tier = useFeeStore((s) => s.tier);
  const handle = useCommunityStore((s) => s.handle);
  const { equity } = useEquity();
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const themeSel: 'system' | Theme = followSystem ? 'system' : theme;
  return (
    <div ref={ref} className="st-pop">
      <button className={`tb-account ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="Account menu" title="Account, settings and theme" data-testid="account-menu">
        <CircleUserRound size={17} strokeWidth={1.6} />
      </button>
      {open && (
        <div className="menu acct-menu" role="menu" data-testid="account-menu-panel">
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
          <button className="menu-item" onClick={act(() => useUiStore.getState().openChartMenu())}>
            <Settings size={15} /> <span className="grow">Chart settings</span>
            <kbd className="cm-kbd">Ctrl+,</kbd>
          </button>
          <div className="divider" />
          <button className="menu-item" onClick={act(() => window.open('/terminal', '_blank', 'popup=yes,width=1440,height=900'))} data-testid="menu-new-window">
            <AppWindow size={15} /> <span className="grow">New window</span>
          </button>
          <button className="menu-item" onClick={act(() => openStudio())} data-testid="open-studio">
            <SquareCode size={15} /> <span className="grow">Aztex Studio</span>
            <kbd className="cm-kbd">F4</kbd>
          </button>
          <button className="menu-item" onClick={act(() => navigate('/get-studio'))} data-testid="get-studio">
            <Download size={15} /> <span className="grow">Install Studio as an app…</span>
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
