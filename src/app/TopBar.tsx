import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Sun, Moon, Search, Plus } from 'lucide-react';
import { useHoldingsValue } from '@/stores/useHoldingsValue';
import { useFeeStore } from '@/stores/useFeeStore';
import { useUiStore } from '@/stores/useUiStore';
import { FEE_TIERS, fmtRate } from '@/lib/account/fees';
import { Wordmark } from './Logo';
import { MOD_KEY } from './CommandPalette';
import { useTickFlash } from './useTickFlash';
import { useThemeStore, type Platform } from '@/stores/useThemeStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useWalletStore } from '@/stores/useWalletStore';
import { usePositionStore, committedNotional, totalUnrealized } from '@/stores/usePositionStore';
import { toast } from '@/stores/useToastStore';
import { fmtSigned, fmtTime, fmtUsd } from '@/lib/format';

/** Function-key navigation — each module has a mnemonic like a terminal function. */
export const NAV = [
  { to: '/terminal', key: 'F1', label: 'Terminal' },
  { to: '/discovery', key: 'F2', label: 'Data & Discovery' },
  { to: '/studio', key: 'F3', label: 'Studio' },
  { to: '/community', key: 'F4', label: 'Community' },
  { to: '/otc', key: 'F5', label: 'OTC Desk' },
  { to: '/account', key: 'F6', label: 'Account' },
  { to: '/appearance', key: 'F7', label: 'Appearance' },
];

function sessionLabel(h: number): string {
  if (h >= 13 && h < 21) return h < 16 ? 'London / NY' : 'New York';
  if (h >= 7 && h < 13) return 'London';
  return 'Asia';
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
        <Wordmark height={16} />
      </div>
      <nav className="tb-nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} title={`${n.label} (${n.key})`} className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="spacer" />
      <button className="palette-trigger" onClick={() => window.dispatchEvent(new Event('aztex:palette'))} data-testid="palette-trigger" aria-label="Open command palette">
        <Search size={13} />
        <span>Search or jump to…</span>
        <span className="spacer" />
        <kbd>{MOD_KEY}</kbd>
      </button>
      <div className="tb-status">
        <span className="tb-cell" title={status.detail}>
          <span className={live ? 'live-dot' : 'live-dot off'} />
          <span className="dim">{live ? (providerId === 'live' ? 'Binance live' : 'Simulated feed') : status.state === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</span>
          <span className="num faint">{status.latencyMs == null ? '' : `${status.latencyMs}ms`}</span>
        </span>
        <span className="tb-cell">
          <span className="dim">{sessionLabel(new Date(now).getUTCHours())}</span>
          <span className="num">{fmtTime(now)} UTC</span>
        </span>
        <select className="tb-select" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} aria-label="Platform">
          <option value="website">Web</option>
          <option value="mobile">Mobile</option>
          <option value="terminal">Desktop</option>
        </select>
        <button className="btn sm ghost" onClick={toggleTheme} data-testid="theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle light / dark">
          {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
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
  const [mode, setMode] = useState<null | 'withdraw'>(null);
  const [amount, setAmount] = useState('');
  const holdingsValue = useHoldingsValue();
  const tier = useFeeStore((s) => s.tier);
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
          <NavLink to="/account" className={`tier-chip ${tier}`} title="Fee tier — redeem a partner code on the Account page" data-testid="tier-chip">
            {FEE_TIERS[tier].label} · {fmtRate(FEE_TIERS[tier].taker)}
          </NavLink>
        </span>
      )}
    </div>
  );
}
