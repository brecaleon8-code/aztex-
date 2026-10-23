import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleUserRound, ChevronRight, Plus, BarChart3, Blocks, Newspaper, Users, Handshake, Wallet, Settings2, SquareCode, Download, CheckCircle2, ArrowUpFromLine } from 'lucide-react';
import { useWalletStore } from '@/stores/useWalletStore';
import { usePositionStore, committedNotional, totalUnrealized } from '@/stores/usePositionStore';
import { useHoldingsValue } from '@/stores/useHoldingsValue';
import { useFeeStore } from '@/stores/useFeeStore';
import { useCommunityStore } from '@/stores/useCommunityStore';
import { useOnchainStore } from '@/stores/useOnchainStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useThemeStore, type Theme } from '@/stores/useThemeStore';
import { useUiStore } from '@/stores/useUiStore';
import { toast } from '@/stores/useToastStore';
import { Segmented } from '@/components/ui/Segmented';
import { FEE_TIERS, fmtRate } from '@/lib/account/fees';
import { fmtUsd } from '@/lib/format';
import type { ProviderId } from '@/lib/data';
import { useInstallPrompt } from '@/studio/useInstallPrompt';
import { useMobileStore } from '../useMobileStore';
import { MHeader } from '../MobileApp';

/** Menu (TradingView): profile, money in/out, the other modules, chart & app settings. */
export function MenuScreen() {
  const navigate = useNavigate();
  const balance = useWalletStore((s) => s.balance);
  const positions = usePositionStore((s) => s.positions);
  const holdings = useHoldingsValue();
  const tier = useFeeStore((s) => s.tier);
  const handle = useCommunityStore((s) => s.handle);
  const unseen = useOnchainStore((s) => s.unseen);
  const providerId = useMarketStore((s) => s.providerId);
  const { theme, followSystem, setTheme, followSystemTheme } = useThemeStore();
  const { canPrompt, installed, install } = useInstallPrompt();
  const equity = balance + committedNotional(positions) + totalUnrealized(positions) + holdings;
  const themeSel: 'system' | Theme = followSystem ? 'system' : theme;

  return (
    <div className="m-page">
      <MHeader title="Menu" />
      <div className="m-scroll">
        <button className="m-profile" onClick={() => navigate('/account')} data-testid="m-profile">
          <span className="m-avatar">
            <CircleUserRound size={30} strokeWidth={1.4} />
          </span>
          <span className="grow">
            <b>{handle ? `@${handle}` : 'Demo trader'}</b>
            <span className="mono">{fmtUsd(equity)} USDT</span>
            <span className={`tier-chip ${tier}`}>
              {FEE_TIERS[tier].label} · {fmtRate(FEE_TIERS[tier].taker)}
            </span>
          </span>
          <ChevronRight size={18} className="faint" />
        </button>

        <div className="m-quick">
          <button onClick={() => useUiStore.getState().openDeposit()} data-testid="m-deposit">
            <Plus size={18} /> Deposit
          </button>
          <button onClick={() => navigate('/account')}>
            <ArrowUpFromLine size={18} /> Withdraw
          </button>
        </div>

        <Group title="Markets">
          <Item icon={<BarChart3 size={18} />} label="Markets & discovery" onClick={() => navigate('/discovery')} />
          <Item icon={<Blocks size={18} />} label="On-chain" badge={unseen || undefined} onClick={() => navigate('/onchain')} />
          <Item icon={<Newspaper size={18} />} label="News & calendar" onClick={() => navigate('/news')} testId="m-menu-news" />
        </Group>
        <Group title="Trading">
          <Item icon={<Handshake size={18} />} label="OTC desk" onClick={() => navigate('/otc')} />
          <Item icon={<Users size={18} />} label="Community" onClick={() => navigate('/community')} />
          <Item icon={<Wallet size={18} />} label="Account, fees & partner codes" onClick={() => navigate('/account')} />
        </Group>
        <Group title="Chart">
          <Item icon={<Settings2 size={18} />} label="Chart settings & colours" onClick={() => useMobileStore.getState().open({ kind: 'chart-settings' })} testId="m-menu-chart-settings" />
          <Item icon={<SquareCode size={18} />} label="Aztex Studio (desktop app)" onClick={() => navigate('/get-studio')} />
        </Group>
        <Group title="App">
          <div className="m-item static">
            <span className="m-item-label">Theme</span>
            <Segmented<'system' | Theme>
              value={themeSel}
              onChange={(t) => (t === 'system' ? followSystemTheme() : setTheme(t))}
              ariaLabel="Theme"
              options={[
                { value: 'system', label: 'System' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </div>
          <div className="m-item static">
            <span className="m-item-label">Data feed</span>
            <Segmented<ProviderId>
              value={providerId}
              onChange={(id) => useMarketStore.getState().setProvider(id)}
              ariaLabel="Market data source"
              options={[
                { value: 'mock', label: 'Simulated' },
                { value: 'live', label: 'Live' },
              ]}
            />
          </div>
          {installed ? (
            <div className="m-item static">
              <CheckCircle2 size={18} className="up" /> <span className="m-item-label">Installed on this device</span>
            </div>
          ) : (
            <Item
              icon={<Download size={18} />}
              label="Add Aztex to home screen"
              hint={canPrompt ? undefined : 'Share › Add to Home Screen'}
              onClick={async () => {
                if ((await install()) === 'unavailable')
                  toast({ kind: 'info', title: 'Install from your browser', detail: 'Safari: Share › Add to Home Screen. Chrome: ⋮ › Install app / Add to Home screen.' });
              }}
              testId="m-install"
            />
          )}
        </Group>
        <p className="m-foot">Aztex · simulated trading environment — no real funds.</p>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="m-group">
      <div className="m-section-head">{title}</div>
      <div className="m-card">{children}</div>
    </section>
  );
}

function Item({ icon, label, hint, badge, onClick, testId }: { icon: ReactNode; label: string; hint?: string; badge?: number; onClick: () => void; testId?: string }) {
  return (
    <button className="m-item" onClick={onClick} data-testid={testId}>
      <span className="m-item-icon">{icon}</span>
      <span className="m-item-label">{label}</span>
      {hint && <span className="m-item-hint">{hint}</span>}
      {badge ? <span className="m-badge static">{badge > 99 ? '99+' : badge}</span> : null}
      <ChevronRight size={16} className="faint" />
    </button>
  );
}
