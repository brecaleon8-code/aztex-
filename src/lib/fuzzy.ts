/**
 * Small subsequence fuzzy matcher for the command palette. Returns a score (higher is better) or
 * null when `query` is not a subsequence of `text`. Rewards prefix matches, word starts and runs.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 1000 - t.length;
  const idx = t.indexOf(q);
  if (idx >= 0) return 700 - idx - t.length / 10;
  let score = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    const wordStart = found === 0 || /[\s/·:-]/.test(t[found - 1]);
    run = found === ti ? run + 1 : 0;
    score += 10 + (wordStart ? 15 : 0) + run * 5 - Math.min(10, found - ti);
    ti = found + 1;
  }
  // Scattered subsequences across unrelated words are noise — require a minimum quality.
  return score >= q.length * 12 ? score : null;
}

export function fuzzyFilter<T>(items: T[], query: string, text: (t: T) => string, limit = 50): T[] {
  if (!query.trim()) return items.slice(0, limit);
  return items
    .map((it) => ({ it, s: fuzzyScore(query, text(it)) }))
    .filter((x): x is { it: T; s: number } => x.s != null)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.it);
}
