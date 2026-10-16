import { toast } from '@/stores/useToastStore';

/** Aztex Studio ships as its own app (its own window, installable), like MetaEditor next to MT5. */
export const STUDIO_URL = '/studio.html';
export const STUDIO_WINDOW = 'aztex-studio';

let studio: Window | null = null;

/** From Studio: bring the terminal forward — the window that opened Studio, else a terminal tab. */
export function focusTerminal(): Window | null {
  const opener = window.opener as Window | null;
  if (opener && !opener.closed) {
    opener.focus();
    return opener;
  }
  return window.open('/terminal', 'aztex-terminal');
}

/** Opens Studio in its own window, or brings the open one to the front. */
export function openStudio(path = STUDIO_URL): Window | null {
  if (studio && !studio.closed) {
    studio.focus();
    return studio;
  }
  studio = window.open(path, STUDIO_WINDOW, 'popup=yes,width=1380,height=880');
  if (!studio) toast({ kind: 'error', title: 'Pop-up blocked', detail: 'Allow pop-ups for Aztex to open Studio in its own window, or open /studio.html in a new tab.' });
  return studio;
}
