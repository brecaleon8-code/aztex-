import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Chromium fires `beforeinstallprompt` once, usually right after load, so it's caught at import
// time rather than when a screen with an Install button happens to mount.
let deferred: BeforeInstallPromptEvent | null = null;
let installed = typeof window !== 'undefined' && !!window.matchMedia?.('(display-mode: standalone)').matches;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Install the page as an app (Studio on desktop, the phone app on a home screen): Chromium browsers
 * offer an install prompt for pages with a web-app manifest. We hold on to it so the Install button
 * can show it on click.
 */
export function useInstallPrompt() {
  const canPrompt = useSyncExternalStore(subscribe, () => !!deferred);
  const isInstalled = useSyncExternalStore(subscribe, () => installed);
  const install = async (): Promise<'prompted' | 'unavailable'> => {
    const ev = deferred;
    if (!ev) return 'unavailable';
    await ev.prompt();
    const choice = await ev.userChoice;
    if (choice.outcome === 'accepted') installed = true;
    deferred = null;
    emit();
    return 'prompted';
  };
  return { canPrompt, installed: isInstalled, install };
}
