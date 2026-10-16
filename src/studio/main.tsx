import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource-variable/inter';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ui.css';
import { useMarketStore } from '@/stores/useMarketStore';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { StudioApp } from './StudioApp';

// Studio's backtest symbol/timeframe are its own: don't move the terminal's chart when you pick one here.
useMarketStore.persist.setOptions({ name: 'aztex.studio.market' });
void useMarketStore.persist.rehydrate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="Aztex Studio">
      <StudioApp />
    </ErrorBoundary>
  </StrictMode>,
);
