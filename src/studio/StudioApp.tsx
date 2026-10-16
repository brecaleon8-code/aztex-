import { useEffect } from 'react';
import { Download, ExternalLink, Moon, Sun, CheckCircle2 } from 'lucide-react';
import { Wordmark } from '@/app/Logo';
import { ThemeSync } from '@/app/ThemeSync';
import { startMarketFeed } from '@/app/marketFeed';
import { focusTerminal } from '@/app/studioLauncher';
import { Toasts } from '@/components/ui/Toasts';
import { StudioWorkspace } from '@/modules/studio/StudioPage';
import { syncAcrossWindows } from '@/lib/sync/crossWindow';
import { useStudioStore } from '@/stores/useStudioStore';
import { useChartStore } from '@/stores/useChartStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useFeeStore } from '@/stores/useFeeStore';
import { toast } from '@/stores/useToastStore';
import { useInstallPrompt } from './useInstallPrompt';
import '@/app/app.css';
import './studio-app.css';

/**
 * Aztex Studio — the indicator & strategy editor as its own app (window, bundle and install
 * manifest), the way MetaEditor sits next to MT5. It shares the terminal's library through
 * storage, so whatever you save here appears in the terminal at once.
 */
export function StudioApp() {
  const { theme, toggleTheme } = useThemeStore();
  const { canPrompt, installed, install } = useInstallPrompt();
  const wantsInstall = typeof location !== 'undefined' && new URLSearchParams(location.search).has('install');
  useEffect(() => startMarketFeed(), []);
  useEffect(() => {
    return syncAcrossWindows([useStudioStore, useChartStore, useThemeStore, useFeeStore]);
  }, []);
  useEffect(() => {
    document.title = 'Aztex Studio';
  }, []);

  const onInstall = async () => {
    const r = await install();
    if (r === 'unavailable')
      toast({
        kind: 'info',
        title: 'Install from your browser',
        detail: 'In Chrome or Edge use the Install icon in the address bar (or menu › Install Aztex Studio). Safari: File › Add to Dock.',
      });
  };

  return (
    <div className="studio-app">
      <ThemeSync />
      <header className="sa-bar no-select">
        <div className="sa-brand">
          <Wordmark height={15} />
          <span className="sa-product">Studio</span>
        </div>
        <span className="sa-sub">Indicators &amp; strategies for the Aztex terminal</span>
        <span className="spacer" />
        <span className="sa-sync" title="Your library is shared with the terminal: saves appear there instantly">
          <span className="live-dot" /> Synced with terminal
        </span>
        {installed ? (
          <span className="chip" data-testid="studio-installed">
            <CheckCircle2 size={12} /> Installed
          </span>
        ) : (
          <button className={`btn sm ${wantsInstall || canPrompt ? 'primary' : ''}`} onClick={onInstall} data-testid="studio-install" title="Install Aztex Studio as a desktop app">
            <Download size={12} /> Install app
          </button>
        )}
        <button className="btn sm" onClick={() => focusTerminal()} data-testid="studio-to-terminal" title="Back to the trading terminal">
          <ExternalLink size={12} /> Terminal
        </button>
        <button className="btn sm ghost icon" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
        </button>
      </header>
      <main className="sa-main">
        <h1 className="sr-only">Aztex Studio</h1>
        <StudioWorkspace />
      </main>
      <Toasts />
    </div>
  );
}
