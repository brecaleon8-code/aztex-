/** Price precision scales with magnitude so DOGE and BTC both read sensibly. */
export function priceDecimals(price: number): number {
  const p = Math.abs(price);
  if (p >= 1000) return 2;
  if (p >= 10) return 3;
  if (p >= 1) return 4;
  return 5;
}

export function fmtPrice(price: number, decimals = priceDecimals(price)): string {
  if (!Number.isFinite(price)) return '—';
  return price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtUsd(v: number, decimals = 2): string {
  if (!Number.isFinite(v)) return '—';
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (v < 0 ? '-' : '') + s;
}

export function fmtSigned(v: number, decimals = 2): string {
  if (!Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + fmtUsd(v, decimals);
}

export function fmtPct(v: number, decimals = 2, signed = true): string {
  if (!Number.isFinite(v)) return '—';
  return (signed && v >= 0 ? '+' : '') + v.toFixed(decimals) + '%';
}

export function fmtQty(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
  return v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) });
}

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
export function fmtCompact(v: number): string {
  return Number.isFinite(v) ? COMPACT.format(v) : '—';
}

export function fmtTime(ms: number, withSeconds = true): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return withSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function truncAddr(a: string): string {
  return a.length <= 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Pick readable text for a literal hex fill (user-editable P/L colors can't use --on-accent). */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#0B0C0E';
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  // Contrast against near-black vs white; pick the larger.
  const cDark = (lum + 0.05) / (0.0034 + 0.05);
  const cLight = 1.05 / (lum + 0.05);
  return cDark >= cLight ? '#0B0C0E' : '#FFFFFF';
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
