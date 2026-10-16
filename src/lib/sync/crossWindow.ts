/** The bit of zustand's persist API this needs. */
interface Persisted {
  persist: { getOptions: () => { name?: string }; rehydrate: () => Promise<void> | void };
}

/**
 * Terminal and Studio run in separate windows of the same origin and share their persisted stores
 * (indicator library, chart indicators, theme…). When one window writes, the other re-reads, so a
 * study saved in Studio shows up in the terminal's menus at once — no reload.
 */
export function syncAcrossWindows(stores: Persisted[]): () => void {
  const byKey = new Map<string, Persisted>();
  for (const s of stores) {
    const name = s.persist.getOptions().name;
    if (name) byKey.set(name, s);
  }
  const onStorage = (e: StorageEvent) => {
    if (e.storageArea !== localStorage || e.key == null || e.newValue == null) return;
    void byKey.get(e.key)?.persist.rehydrate();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
