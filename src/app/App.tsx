import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { TopBar, AccountStrip } from './TopBar';
import { GasTicker } from './GasTicker';
import { useFunctionKeys } from './useFunctionKeys';
import { CommandPalette } from './CommandPalette';
import { DepositModal } from './DepositModal';
import { ThemeSync } from './ThemeSync';
import { startMarketFeed } from './marketFeed';
import { startScannerFeed } from './scannerFeed';
import { startNewsFeed } from './newsFeed';
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
const StudioPage = lazy(() => import('@/modules/studio/StudioPage').then((m) => ({ default: m.StudioPage })));
const AccountPage = lazy(() => import('@/modules/account/AccountPage').then((m) => ({ default: m.AccountPage })));
const AppearancePage = lazy(() => import('@/modules/appearance/AppearancePage').then((m) => ({ default: m.AppearancePage })));

export function App() {
  const platform = useThemeStore((s) => s.platform);
  useEffect(() => startMarketFeed(), []);
  useEffect(() => startScannerFeed(), []);
  useEffect(() => startNewsFeed(), []);
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
          <Suspense fallback={<div className="empty">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/terminal" replace />} />
            <Route path="/terminal" element={<TerminalPage />} />
            <Route path="/discovery" element={<DiscoveryPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/otc" element={<OtcPage />} />
            <Route path="/appearance" element={<AppearancePage />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="*" element={<Navigate to="/terminal" replace />} />
          </Routes>
          </Suspense>
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
