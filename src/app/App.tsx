import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useFunctionKeys } from './useFunctionKeys';
import { CommandPalette } from './CommandPalette';
import { DepositModal } from './DepositModal';
import { ThemeSync } from './ThemeSync';
import { startMarketFeed } from './marketFeed';
import { startScannerFeed } from './scannerFeed';
import { startNewsFeed } from './newsFeed';
import { startOnchainFeed } from './onchainFeed';
import { startPriceAlerts } from './priceAlerts';
import { ChartSettingsMenu } from '@/modules/terminal/chart/ChartSettingsMenu';
import { ChartContextMenu } from '@/modules/terminal/chart/ChartContextMenu';
import { ObjectTree } from '@/modules/terminal/chart/ObjectTree';
import { CliBar } from '@/modules/terminal/CliBar';
import { ShortcutsSheet } from './ShortcutsSheet';
import { useChartShortcuts } from './useChartShortcuts';
import { syncAcrossWindows } from '@/lib/sync/crossWindow';
import { useStudioStore } from '@/stores/useStudioStore';
import { useChartStore } from '@/stores/useChartStore';
import { Toasts } from '@/components/ui/Toasts';
import { useThemeStore } from '@/stores/useThemeStore';
import { useIsPhone } from '@/mobile/useIsPhone';
import { MobileApp } from '@/mobile/MobileApp';
import { PhonePreview } from '@/mobile/PhonePreview';
import { DockHost } from '@/workspace/DockHost';
import { startLinkSync } from '@/workspace/linkSync';
import { startWorkspacePersistence } from '@/workspace/useWorkspaceStore';
import { TopBar } from './shell/TopBar';
import { AppRail } from './shell/AppRail';
import { TabStrip } from './shell/TabStrip';
import { StatusBar } from './shell/StatusBar';
import { PAGE_TITLES, scopeForPath } from './shell/nav';
import { useShellKeys } from './shell/useShellKeys';
import './app.css';
import './shell/shell.css';

// Docked apps render windows (their components load with the registry); plain pages load on demand.
const OnchainPage = lazy(() => import('@/modules/onchain/OnchainPage').then((m) => ({ default: m.OnchainPage })));
// Studio itself is a separate app (studio.html, which servers also answer at /studio); this is its download page.
const StudioDownloadPage = lazy(() => import('@/modules/studio/StudioDownloadPage').then((m) => ({ default: m.StudioDownloadPage })));
const AccountPage = lazy(() => import('@/modules/account/AccountPage').then((m) => ({ default: m.AccountPage })));

export function App() {
  const platform = useThemeStore((s) => s.platform);
  const phone = useIsPhone();
  // Layouts and link groups first, so the feed connects straight to the focused chart's symbol.
  useEffect(() => startWorkspacePersistence(), []);
  useEffect(() => startLinkSync(), []);
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

/**
 * The same shell on every route: top bar, icon rail, workspace tab strip, then the command line
 * and status row along the bottom. Docked apps show their workspace; the rest are pages.
 */
function DesktopShell({ platform }: { platform: string }) {
  const { pathname } = useLocation();
  const scope = scopeForPath(pathname);
  useFunctionKeys();
  useChartShortcuts();
  useShellKeys(scope);
  const page = (el: React.ReactNode) => <div className="shell-page">{el}</div>;
  return (
    <div className="shell" data-platform={platform}>
      <ThemeSync />
      <TopBar />
      <div className="shell-mid">
        <AppRail />
        <div className="shell-main">
          <TabStrip scope={scope} pageTitle={PAGE_TITLES[pathname] ?? ''} />
          <main className="shell-work">
            <ErrorBoundary key={pathname} variant="inline" label="This page">
              <Suspense fallback={<div className="win-empty">Loading…</div>}>
                <Routes>
                  <Route path="/" element={<Navigate to="/terminal" replace />} />
                  <Route path="/terminal" element={<DockHost scope="terminal" />} />
                  <Route path="/discovery" element={<DockHost scope="discovery" />} />
                  <Route path="/community" element={<DockHost scope="community" />} />
                  <Route path="/otc" element={<DockHost scope="otc" />} />
                  <Route path="/onchain" element={page(<OnchainPage />)} />
                  <Route path="/account" element={page(<AccountPage />)} />
                  <Route path="/get-studio" element={page(<StudioDownloadPage />)} />
                  {/* Chart appearance moved onto the chart itself (right-click · F8). */}
                  <Route path="/appearance" element={<Navigate to="/terminal" replace />} />
                  <Route path="/studio" element={<Navigate to="/get-studio" replace />} />
                  {/* Phone-app screens: on desktop everything is on the terminal. */}
                  {['/watchlist', '/trade', '/history', '/menu', '/news'].map((p) => (
                    <Route key={p} path={p} element={<Navigate to="/terminal" replace />} />
                  ))}
                  <Route path="*" element={<Navigate to="/terminal" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <div className="shell-bottom">
        <CliBar />
        <StatusBar />
      </div>
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
