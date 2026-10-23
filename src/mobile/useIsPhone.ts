import { useSyncExternalStore } from 'react';

/** Phone-sized screens (portrait phones, and landscape phones that are short and touch-first). */
export const PHONE_QUERY = '(max-width: 760px), (pointer: coarse) and (max-height: 500px)';

function subscribe(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const snapshot = () => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches;

/** True on a phone: the app switches to its phone layout (bottom tabs, sheets, full-screen chart). */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
