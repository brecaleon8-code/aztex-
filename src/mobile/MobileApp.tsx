import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpDown, CandlestickChart, BriefcaseBusiness, History, Menu, ChevronLeft } from 'lucide-react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Toasts } from '@/components/ui/Toasts';
import { usePositionStore } from '@/stores/usePositionStore';
import { useOnchainStore } from '@/stores/useOnchainStore';
import { QuotesScreen } from './screens/QuotesScreen';
import { ChartScreen } from './screens/ChartScreen';
import { TradeScreen } from './screens/TradeScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { MenuScreen } from './screens/MenuScreen';
import { NewsScreen } from './screens/NewsScreen';
import { MobileSheets } from './sheets/MobileSheets';
import './mobile.css';

const DiscoveryPage = lazy(() => import('@/modules/discovery/DiscoveryPage').then((m) => ({ default: m.DiscoveryPage })));
const CommunityPage = lazy(() => import('@/modules/community/CommunityPage').then((m) => ({ default: m.CommunityPage })));
const OtcPage = lazy(() => import('@/modules/otc/OtcPage').then((m) => ({ default: m.OtcPage })));
const OnchainPage = lazy(() => import('@/modules/onchain/OnchainPage').then((m) => ({ default: m.OnchainPage })));
const StudioDownloadPage = lazy(() => import('@/modules/studio/StudioDownloadPage').then((m) => ({ default: m.StudioDownloadPage })));
const AccountPage = lazy(() => import('@/modules/account/AccountPage').then((m) => ({ default: m.AccountPage })));

const TABS = [
  { to: '/watchlist', label: 'Quotes', icon: ArrowUpDown },
  { to: '/terminal', label: 'Chart', icon: CandlestickChart },
  { to: '/trade', label: 'Trade', icon: BriefcaseBusiness },
  { to: '/history', label: 'History', icon: History },
  { to: '/menu', label: 'Menu', icon: Menu },
] as const;

/**
 * The phone app — MT5's tab layout (Quotes · Chart · Trade · History) with TradingView's watchlist
 * and chart feel. Same stores, feeds and order engine as the desktop terminal.
 */
export function MobileApp({ framed = false }: { framed?: boolean }) {
  const { pathname } = useLocation();
  return (
    <div className={`m-app ${framed ? 'framed' : ''}`} data-testid="mobile-app">
      <div className="m-screen">
        <ErrorBoundary key={pathname} variant="inline" label="This screen">
          <Suspense fallback={<div className="empty">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Navigate to="/watchlist" replace />} />
              <Route path="/watchlist" element={<QuotesScreen />} />
              <Route path="/terminal" element={<ChartScreen />} />
              <Route path="/trade" element={<TradeScreen />} />
              <Route path="/history" element={<HistoryScreen />} />
              <Route path="/menu" element={<MenuScreen />} />
              <Route path="/news" element={<NewsScreen />} />
              <Route path="/discovery" element={<SubPage title="Markets"><DiscoveryPage /></SubPage>} />
              <Route path="/onchain" element={<SubPage title="On-chain"><OnchainPage /></SubPage>} />
              <Route path="/community" element={<SubPage title="Community"><CommunityPage /></SubPage>} />
              <Route path="/otc" element={<SubPage title="OTC Desk"><OtcPage /></SubPage>} />
              <Route path="/account" element={<SubPage title="Account"><AccountPage /></SubPage>} />
              <Route path="/get-studio" element={<SubPage title="Aztex Studio"><StudioDownloadPage /></SubPage>} />
              <Route path="/studio" element={<Navigate to="/get-studio" replace />} />
              <Route path="/appearance" element={<Navigate to="/terminal" replace />} />
              <Route path="*" element={<Navigate to="/watchlist" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
      <TabBar />
      <MobileSheets />
      <Toasts />
    </div>
  );
}

function TabBar() {
  const open = usePositionStore((s) => s.positions.length);
  const unseen = useOnchainStore((s) => s.unseen);
  return (
    <nav className="m-tabbar" aria-label="Main">
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `m-tab ${isActive ? 'active' : ''}`} data-testid={`m-tab-${label.toLowerCase()}`}>
          <span className="m-tab-icon">
            <Icon size={21} strokeWidth={1.7} />
            {to === '/trade' && open > 0 && <span className="m-badge">{open}</span>}
            {to === '/menu' && unseen > 0 && <span className="m-dot" />}
          </span>
          <span className="m-tab-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Screen header: title (and subtitle) with optional back button and actions, iOS / Android style. */
export function MHeader({ title, sub, back, left, right }: { title: ReactNode; sub?: ReactNode; back?: boolean | string; left?: ReactNode; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="m-header">
      <div className="m-header-side">
        {back ? (
          <button className="m-icon-btn" onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))} aria-label="Back" data-testid="m-back">
            <ChevronLeft size={22} />
          </button>
        ) : (
          left
        )}
      </div>
      <div className="m-header-title">
        <div className="m-title">{title}</div>
        {sub && <div className="m-sub">{sub}</div>}
      </div>
      <div className="m-header-side right">{right}</div>
    </header>
  );
}

/** Desktop pages opened from the Menu: a back header over the page, scrolling. */
function SubPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="m-page">
      <MHeader title={title} back="/menu" />
      <div className="m-scroll m-sub-page">{children}</div>
    </div>
  );
}
