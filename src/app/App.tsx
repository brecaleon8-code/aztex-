import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { TopBar, BottomBar } from './TopBar';
import { useFunctionKeys } from './useFunctionKeys';
import { CommandPalette } from './CommandPalette';
import { DepositModal } from './DepositModal';
import { ThemeSync } from './ThemeSync';
import { startMarketFeed } from './marketFeed';
import { startScannerFeed } from './scannerFeed';
import { startNewsFeed } from './newsFeed';
import { startOnchainFeed } from './onchainFeed';
import { NewsDock } from './NewsDock';
import { startChartTabsSync } from './chartTabsSync';
import { startPriceAlerts } from './priceAlerts';
import { ChartSettingsMenu } from '@/modules/terminal/chart/ChartSettingsMenu';
import { ChartContextMenu } from '@/modules/terminal/chart/ChartContextMenu';
import { ObjectTree } from '@/modules/terminal/chart/ObjectTree';
import { ShortcutsSheet } from './ShortcutsSheet';
import { useChartShortcuts } from './useChartShortcuts';
import { syncAcrossWindows } from '@/lib/sync/crossWindow';
import { useStudioStore } from '@/stores/useStudioStore';
import { useChartStore } from '@/stores/useChartStore';
import { Toasts } from '@/components/ui/Toasts';
import { TerminalPage } from '@/modules/terminal/TerminalPage';
import { useThemeStore } from '@/stores/useThemeStore';
import { useIsPhone } from '@/mobile/useIsPhone';
import { MobileApp } from '@/mobile/MobileApp';
import { PhonePreview } from '@/mobile/PhonePreview';
import './app.css';

// The Terminal ships in the main bundle; secondary modules load on demand.
const DiscoveryPage = lazy(() => import('@/modules/discovery/DiscoveryPage').then((m) => ({ default: m.DiscoveryPage })));
const CommunityPage = lazy(() => import('@/modules/community/CommunityPage').then((m) => ({ default: m.CommunityPage })));
const OtcPage = lazy(() => import('@/modules/otc/OtcPage').then((m) => ({ default: m.OtcPage })));
const OnchainPage = lazy(() => import('@/modules/onchain/OnchainPage').then((m) => ({ default: m.OnchainPage })));
// Studio itself is a separate app (studio.html, which servers also answer at /studio); this is its download page.
const StudioDownloadPage = lazy(() => import('@/modules/studio/StudioDownloadPage').then((m) => ({ default: m.StudioDownloadPage })));
const AccountPage = lazy(() => import('@/modules/account/AccountPage').then((m) => ({ default: m.AccountPage })));

export function App() {
  const platform = useThemeStore((s) => s.platform);
  const phone = useIsPhone();
  // Tabs first, so the feed connects straight to the active tab's chart.
  useEffect(() => startChartTabsSync(), []);
  useEffect(() => startMarketFeed(), []);
  useEffect(() => startScannerFeed(), []);
  useEffect(() => startNewsFeed(), []);
  useEffect(() => startOnchainFeed(), []);
  useEffect(() => startPriceAlerts(), []);
  // Studio runs in its own window: pick up what it saves (library, chart indicators, theme).
  useEffect(() => {
    return syncAcrossWindows([useStudioStore, useChartStore, useThemeStore]);
  }, []);

  // Phones get the phone app; on desktop, the "Mobile" layout previews it in a phone frame.
  if (phone || platform === 'mobile')
    return (
      <>
        <ThemeSync />
        {phone ? <MobileApp /> : <PhonePreview />}
        <DepositModal />
      </>
    );
  return <DesktopShell platform={platform} />;
}

function DesktopShell({ platform }: { platform: string }) {
  const { pathname } = useLocation();
  useFunctionKeys();
  useChartShortcuts();
  return (
    <div className="app" data-platform={platform}>
      <ThemeSync />
      <TopBar />
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
            {/* Chart appearance moved onto the chart itself (right-click · F8). */}
            <Route path="/appearance" element={<Navigate to="/terminal" replace />} />
            <Route path="/get-studio" element={<StudioDownloadPage />} />
            <Route path="/studio" element={<Navigate to="/get-studio" replace />} />
            <Route path="/account" element={<AccountPage />} />
            {/* Phone-app screens: on desktop everything is on the terminal. */}
            {['/watchlist', '/trade', '/history', '/menu', '/news'].map((p) => (
              <Route key={p} path={p} element={<Navigate to="/terminal" replace />} />
            ))}
            <Route path="*" element={<Navigate to="/terminal" replace />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </div>
        <NewsDock side="right" />
      </main>
      <BottomBar />
      {/* App-level overlay: visible regardless of route. */}
      <Toasts />
      <CommandPalette />
      <DepositModal />
      <ChartSettingsMenu />
      <ChartContextMenu />
      <ObjectTree />
      <ShortcutsSheet />
    </div>
  );
}
