import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { Logo } from './Logo';
import { useTickFlash } from './useTickFlash';
import { useThemeStore, type Platform } from '@/stores/useThemeStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useWalletStore } from '@/stores/useWalletStore';
import { usePositionStore, committedNotional, totalUnrealized } from '@/stores/usePositionStore';
import { toast } from '@/stores/useToastStore';
import { fmtSigned, fmtTime, fmtUsd } from '@/lib/format';

/** Function-key navigation — each module has a mnemonic like a terminal function. */
export const NAV = [
  { to: '/terminal', key: 'F1', code: 'TRM', label: 'Terminal' },
  { to: '/discovery', key: 'F2', code: 'MKT', label: 'Data & Discovery' },
  { to: '/community', key: 'F3', code: 'MSG', label: 'Community' },
  { to: '/otc', key: 'F4', code: 'OTC', label: 'OTC Desk' },
  { to: '/appearance', key: 'F5', code: 'CFG', label: 'Appearance' },
];

function sessionLabel(h: number): string {
  if (h >= 13 && h < 21) return h < 16 ? 'LDN/NY' : 'NEW YORK';
  if (h >= 7 && h < 13) return 'LONDON';
  return 'ASIA';
}

export function TopBar() {
  const { theme, toggleTheme, platform, setPlatform } = useThemeStore();
  const status = useMarketStore((s) => s.status);
  const providerId = useMarketStore((s) => s.providerId);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const live = status.state === 'open';

  return (
    <header className="topbar no-select">
      <div className="tb-brand">
        <Logo size={20} />
        <span className="tb-name">AZTEX</span>
        <span className="tb-sub">PROFESSIONAL</span>
      </div>
      <nav className="tb-nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `fkey ${isActive ? 'active' : ''}`}>
            <span className="fkey-k">{n.key}</span>
            <span className="fkey-c">{n.code}</span>
            <span className="fkey-l">{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="spacer" />
      <div className="tb-status">
        <span className="row" style={{ gap: 5 }}>
          <span className={live ? 'live-dot' : 'live-dot off'} />
          <span className={live ? 'go-text' : 'down'}>{live ? (providerId === 'live' ? 'BINANCE LIVE' : 'SIM FEED') : status.state === 'reconnecting' ? 'RECONNECTING' : 'CONNECTING'}</span>
        </span>
        <span className="tb-cell">
          <span className="label">LAT</span>
          <span className="num">{status.latencyMs == null ? '—' : `${status.latencyMs}ms`}</span>
        </span>
        <span className="tb-cell">
          <span className="label">FIX</span>
          <span className="num go-text">UP</span>
        </span>
        <span className="tb-cell">
          <span className="label">{sessionLabel(new Date(now).getUTCHours())}</span>
          <span className="num amber">{fmtTime(now)}Z</span>
        </span>
        <select className="tb-select" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} aria-label="Platform">
          <option value="website">WEB</option>
          <option value="mobile">MOBILE</option>
          <option value="terminal">DESKTOP</option>
        </select>
        <button className="btn sm" onClick={toggleTheme} data-testid="theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={theme === 'dark' ? 'Paper (light)' : 'Terminal (dark)'}>
          {theme === 'dark' ? <Moon size={11} /> : <Sun size={11} />}
          {theme === 'dark' ? 'DARK' : 'PAPER'}
        </button>
      </div>
    </header>
  );
}

/** Account strip: equity, available, unrealized, realized + deposit/withdraw. */
export function AccountStrip() {
  const balance = useWalletStore((s) => s.balance);
  const positions = usePositionStore((s) => s.positions);
  const realized = usePositionStore((s) => s.realized);
  const [mode, setMode] = useState<null | 'deposit' | 'withdraw'>(null);
  const [amount, setAmount] = useState('');
  const upnl = totalUnrealized(positions);
  const committed = committedNotional(positions);
  const equity = balance + committed + upnl;
  const flash = useTickFlash(Math.round(equity * 100));

  const submit = () => {
    const n = Number(amount);
    const w = useWalletStore.getState();
    const ok = mode === 'deposit' ? w.deposit(n) : w.withdraw(n);
    if (ok) {
      toast({ kind: 'success', title: mode === 'deposit' ? 'Deposit credited' : 'Withdrawal sent', detail: `${fmtUsd(n)} USDT` });
      setMode(null);
      setAmount('');
    } else toast({ kind: 'error', title: mode === 'deposit' ? 'Invalid amount' : 'Insufficient balance' });
  };

  return (
    <div className="acct no-select" data-testid="wallet">
      <span className="acct-id">
        <span className="label">ACCT</span> <span className="mono amber">AZX-PRIME-001</span>
      </span>
      <span className="acct-cell">
        <span className="label">EQUITY</span>
        <span className={`num acct-eq ${flash.cls}`} key={flash.key}>
          {fmtUsd(equity)}
        </span>
      </span>
      <span className="acct-cell">
        <span className="label">AVAIL</span>
        <span className="num" data-testid="wallet-balance">{fmtUsd(balance)}</span>
      </span>
      <span className="acct-cell">
        <span className="label">MARGIN USED</span>
        <span className="num">{fmtUsd(committed)}</span>
      </span>
      <span className="acct-cell">
        <span className="label">UPNL</span>
        <span className={`num ${upnl >= 0 ? 'up' : 'down'}`}>{fmtSigned(upnl)}</span>
      </span>
      <span className="acct-cell">
        <span className="label">RPNL</span>
        <span className={`num ${realized >= 0 ? 'up' : 'down'}`}>{fmtSigned(realized)}</span>
      </span>
      <span className="spacer" />
      {mode ? (
        <span className="row" style={{ gap: 4 }}>
          <span className="input-wrap" style={{ width: 150 }}>
            <input autoFocus inputMode="decimal" placeholder="AMOUNT" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label={`${mode} amount`} />
            <span className="suffix">USDT</span>
          </span>
          <button className="btn sm go" onClick={submit}>{mode === 'deposit' ? 'DEPOSIT' : 'WITHDRAW'} &lt;GO&gt;</button>
          <button className="btn sm" onClick={() => setMode(null)}>CANCEL</button>
        </span>
      ) : (
        <span className="row" style={{ gap: 4 }}>
          <button className="btn sm" onClick={() => setMode('deposit')}>DEPOSIT</button>
          <button className="btn sm" onClick={() => setMode('withdraw')}>WITHDRAW</button>
        </span>
      )}
    </div>
  );
}
