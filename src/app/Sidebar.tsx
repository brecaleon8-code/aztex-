import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { CandlestickChart, Radar, Users, Handshake, Palette, Sun, Moon, Globe, Smartphone, Monitor, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { Logo } from './Logo';
import { useTickFlash } from './useTickFlash';
import { useThemeStore, type Platform } from '@/stores/useThemeStore';
import { useWalletStore } from '@/stores/useWalletStore';
import { usePositionStore, committedNotional, totalUnrealized } from '@/stores/usePositionStore';
import { toast } from '@/stores/useToastStore';
import { fmtSigned, fmtUsd } from '@/lib/format';

const NAV = [
  { to: '/terminal', label: 'Terminal', icon: CandlestickChart },
  { to: '/discovery', label: 'Data & Discovery', icon: Radar },
  { to: '/community', label: 'Community', icon: Users },
  { to: '/otc', label: 'OTC Desk', icon: Handshake },
  { to: '/appearance', label: 'Appearance', icon: Palette },
];

export function Sidebar() {
  const { theme, toggleTheme, platform, setPlatform } = useThemeStore();
  return (
    <aside className="sidebar glass">
      <div className="brand">
        <Logo size={30} />
        <span className="brand-name">Aztex</span>
        <span className="brand-tag">PRIME</span>
      </div>

      <nav className="nav">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">
              <Icon size={16} />
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="side-section">
        <span className="label">Platform</span>
        <Segmented<Platform>
          full
          ariaLabel="Platform"
          value={platform}
          onChange={setPlatform}
          options={[
            { value: 'website', label: <Globe size={13} />, title: 'Website' },
            { value: 'mobile', label: <Smartphone size={13} />, title: 'Mobile app' },
            { value: 'terminal', label: <Monitor size={13} />, title: 'Desktop terminal' },
          ]}
        />
      </div>

      <div className="side-section">
        <span className="label">Theme</span>
        <button className="btn theme-toggle" onClick={toggleTheme} data-testid="theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
          {theme === 'dark' ? 'Dark' : 'Light'}
        </button>
      </div>

      <div className="spacer" />
      <WalletCard />
    </aside>
  );
}

function WalletCard() {
  const balance = useWalletStore((s) => s.balance);
  const positions = usePositionStore((s) => s.positions);
  const [mode, setMode] = useState<null | 'deposit' | 'withdraw'>(null);
  const [amount, setAmount] = useState('');
  const upnl = totalUnrealized(positions);
  const equity = balance + committedNotional(positions) + upnl;
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
    <div className="wallet-card" data-testid="wallet">
      <div className="row">
        <span className="label">Equity</span>
        <span className="spacer" />
        <span className="badge accent">USDT</span>
      </div>
      <div className={`wallet-equity ${flash.cls}`} key={flash.key}>
        {fmtUsd(equity)}
      </div>
      <div className="wallet-rows">
        <div className="row">
          <span className="label">Available</span>
          <span className="spacer" />
          <span className="num" data-testid="wallet-balance">{fmtUsd(balance)}</span>
        </div>
        <div className="row">
          <span className="label">Unrealized</span>
          <span className="spacer" />
          <span className={`num ${upnl >= 0 ? 'up' : 'down'}`}>{fmtSigned(upnl)}</span>
        </div>
      </div>
      {mode ? (
        <div className="col" style={{ gap: 6 }}>
          <span className="input-wrap">
            <input className="mono" autoFocus inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label={`${mode} amount`} />
            <span className="suffix">USDT</span>
          </span>
          <div className="row">
            <button className="btn sm ghost grow" onClick={() => setMode(null)}>Cancel</button>
            <button className="btn sm primary grow" onClick={submit}>{mode === 'deposit' ? 'Deposit' : 'Withdraw'}</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="btn sm grow" onClick={() => setMode('deposit')}><ArrowDownToLine size={12} /> Deposit</button>
          <button className="btn sm grow" onClick={() => setMode('withdraw')}><ArrowUpFromLine size={12} /> Withdraw</button>
        </div>
      )}
    </div>
  );
}
