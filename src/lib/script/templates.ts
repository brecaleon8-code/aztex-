/** Starter scripts shown in the Studio. Each must run cleanly (asserted in engine.test.ts). */
export interface ScriptTemplate {
  name: string;
  type: 'overlay' | 'oscillator';
  code: string;
}

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    name: 'Keltner channel',
    type: 'overlay',
    code: `// Keltner channel — EMA basis ± ATR envelope.
const len  = input('Length', 20, { min: 2, max: 200 });
const mult = input('ATR mult', 2, { min: 0.5, max: 5, step: 0.25 });

const basis = ta.ema(close, len);
const atr   = ta.atr(len);

plot(basis, { title: 'Basis', style: 'dashed' });
plot(zip((b, a) => b + mult * a, basis, atr), { title: 'Upper' });
plot(zip((b, a) => b - mult * a, basis, atr), { title: 'Lower' });
`,
  },
  {
    name: 'Supertrend',
    type: 'overlay',
    code: `// Supertrend — a per-candle state machine using each().
const len  = input('ATR length', 10, { min: 2, max: 100 });
const mult = input('Factor', 3, { min: 1, max: 10, step: 0.5 });
const atr  = ta.atr(len);

let dir = 1, upper = null, lower = null;
const st = each((i) => {
  if (atr[i] == null) return null;
  const up = hl2[i] + mult * atr[i];
  const dn = hl2[i] - mult * atr[i];
  upper = upper == null || up < upper || close[i - 1] > upper ? up : upper;
  lower = lower == null || dn > lower || close[i - 1] < lower ? dn : lower;
  if (dir === 1 && close[i] < lower) dir = -1;
  else if (dir === -1 && close[i] > upper) dir = 1;
  return dir === 1 ? lower : upper;
});

plot(st, { title: 'Supertrend' });
`,
  },
  {
    name: 'Z-score',
    type: 'oscillator',
    code: `// How many standard deviations price is from its mean.
const len = input('Length', 50, { min: 5, max: 500 });
const z = zip((c, m, s) => (s ? (c - m) / s : 0), close, ta.sma(close, len), ta.stdev(close, len));

plot(z, { title: 'Z', style: 'histogram' });
hline(2,  { title: '+2σ' });
hline(-2, { title: '−2σ' });
hline(0);
`,
  },
  {
    name: 'Stochastic RSI',
    type: 'oscillator',
    code: `// Stochastic of RSI, smoothed.
const rsiLen = input('RSI length', 14, { min: 2, max: 100 });
const stLen  = input('Stoch length', 14, { min: 2, max: 100 });
const k      = input('K smoothing', 3, { min: 1, max: 20 });

const r  = ta.rsi(close, rsiLen);
const hi = ta.highest(r, stLen);
const lo = ta.lowest(r, stLen);
const raw = zip((x, h, l) => (h === l ? 50 : ((x - l) / (h - l)) * 100), r, hi, lo);
const K = ta.sma(raw, k);

plot(K, { title: '%K' });
plot(ta.sma(K, 3), { title: '%D', style: 'dashed' });
hline(80); hline(20);
`,
  },
  {
    name: 'Volume pressure',
    type: 'oscillator',
    code: `// Signed volume: up-candles add, down-candles subtract; smoothed.
const len = input('Smoothing', 14, { min: 1, max: 200 });
const signed = each((i) => (close[i] >= open[i] ? volume[i] : -volume[i]));
plot(ta.ema(signed, len), { title: 'Pressure', style: 'histogram' });
hline(0);
log('last value', ta.ema(signed, len)[n - 1]);
`,
  },
];

export const BLANK_SCRIPT = `// Runs once over the whole series. Arrays: open high low close volume time hl2 hlc3 (length n).
const len = input('Length', 20, { min: 2, max: 200 });

plot(ta.ema(close, len), { title: 'EMA' });
`;
