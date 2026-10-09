import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { TopBar, AccountStrip } from './TopBar';
import { GasTicker } from './GasTicker';
import { useFunctionKeys } from './useFunctionKeys';
import { CommandPalette } from './CommandPalette';
import { DepositModal } from './DepositModal';
import { ThemeSync } from './ThemeSync';
import { startMarketFeed } from './marketFeed';
import { startScannerFeed } from './scannerFeed';
import { startNewsFeed } from './newsFeed';
import { startOnchainFeed } from './onchainFeed';
import { NewsDock } from './NewsDock';
import { CliBar } from '@/modules/terminal/CliBar';
import { Toasts } from '@/components/ui/Toasts';
import { TerminalPage } from '@/modules/terminal/TerminalPage';
import { useThemeStore } from '@/stores/useThemeStore';
import './app.css';

// The Terminal ships in the main bundle; secondary modules load on demand.
const DiscoveryPage = lazy(() => import('@/modules/discovery/DiscoveryPage').then((m) => ({ default: m.DiscoveryPage })));
const CommunityPage = lazy(() => import('@/modules/community/CommunityPage').then((m) => ({ default: m.CommunityPage })));
const OtcPage = lazy(() => import('@/modules/otc/OtcPage').then((m) => ({ default: m.OtcPage })));
const OnchainPage = lazy(() => import('@/modules/onchain/OnchainPage').then((m) => ({ default: m.OnchainPage })));
const StudioPage = lazy(() => import('@/modules/studio/StudioPage').then((m) => ({ default: m.StudioPage })));
const AccountPage = lazy(() => import('@/modules/account/AccountPage').then((m) => ({ default: m.AccountPage })));
const AppearancePage = lazy(() => import('@/modules/appearance/AppearancePage').then((m) => ({ default: m.AppearancePage })));

export function App() {
  const platform = useThemeStore((s) => s.platform);
  const { pathname } = useLocation();
  useEffect(() => startMarketFeed(), []);
  useEffect(() => startScannerFeed(), []);
  useEffect(() => startNewsFeed(), []);
  useEffect(() => startOnchainFeed(), []);
  useFunctionKeys();

  return (
    <div className="app" data-platform={platform}>
      <ThemeSync />
      <TopBar />
      <div className="cmdrow">
        <CliBar />
        <AccountStrip />
        <GasTicker />
      </div>
      <main className="main">
        <NewsDock side="left" />
        <div className="content">
          <ErrorBoundary key={pathname} variant="inline" label="This page">
          <Suspense fallback={<div className="empty">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/terminal" replace />} />
            <Route path="/terminal" element={<TerminalPage />} />
            <Route path="/discovery" element={<DiscoveryPage />} />
            <Route path="/onchain" element={<OnchainPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/otc" element={<OtcPage />} />
            <Route path="/appearance" element={<AppearancePage />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="*" element={<Navigate to="/terminal" replace />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </div>
        <NewsDock side="right" />
      </main>
      {/* App-level overlay: visible regardless of route. */}
      <Toasts />
      <CommandPalette />
      <DepositModal />
    </div>
  );
}
