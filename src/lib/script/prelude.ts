/**
 * The script API, as JavaScript source evaluated INSIDE the QuickJS sandbox before the user's code.
 * Everything here runs in the WASM VM — it never touches the host page's JS engine.
 *
 * The host injects `__AZ_DATA` (a JSON string) and `__AZ_INPUTS`; this prelude parses them, exposes
 * the public API as frozen globals, then deletes every `__AZ_*` handle except the result collector.
 */
export const PRELUDE = String.raw`
(function () {
  'use strict';
  var D = JSON.parse(globalThis.__AZ_DATA);
  var OV = JSON.parse(globalThis.__AZ_INPUTS);
  delete globalThis.__AZ_DATA;
  delete globalThis.__AZ_INPUTS;
  var L = D.limits;
  var N = D.close.length;
  var plots = [], hlines = [], inputs = [], logs = [];

  function fin(v) { return typeof v === 'number' && isFinite(v); }
  function num(v, d) { return fin(v) ? v : d; }
  function isSeries(s) { return Array.isArray(s) || (s && typeof s.length === 'number'); }
  function need(s, name) { if (!isSeries(s)) throw new TypeError(name + ': expected a series (array)'); return s; }
  function per(p, name) { p = Math.floor(Number(p)); if (!(p >= 1) || p > 5000) throw new RangeError(name + ': period must be 1..5000'); return p; }
  function blank() { var a = new Array(N); for (var i = 0; i < N; i++) a[i] = null; return a; }
  function ser(x) { if (isSeries(x)) return x; var a = new Array(N); for (var i = 0; i < N; i++) a[i] = x; return a; }

  function freeze(a) { return Object.freeze(a); }
  var open = freeze(D.open), high = freeze(D.high), low = freeze(D.low), close = freeze(D.close), volume = freeze(D.volume), time = freeze(D.time);
  var hl2 = freeze(high.map(function (h, i) { return (h + low[i]) / 2; }));
  var hlc3 = freeze(high.map(function (h, i) { return (h + low[i] + close[i]) / 3; }));
  var ohlc4 = freeze(high.map(function (h, i) { return (open[i] + h + low[i] + close[i]) / 4; }));

  var ta = {
    sma: function (s, p) { need(s, 'ta.sma'); p = per(p, 'ta.sma'); var o = blank(), sum = 0, cnt = 0;
      for (var i = 0; i < N; i++) { var v = s[i]; if (fin(v)) { sum += v; cnt++; } if (i >= p) { var w = s[i - p]; if (fin(w)) { sum -= w; cnt--; } } if (i >= p - 1 && cnt === p) o[i] = sum / p; } return o; },
    ema: function (s, p) { need(s, 'ta.ema'); p = per(p, 'ta.ema'); var o = blank(), k = 2 / (p + 1), prev = null, seed = 0, c = 0;
      for (var i = 0; i < N; i++) { var v = s[i]; if (!fin(v)) continue; if (prev == null) { seed += v; c++; if (c === p) { prev = seed / p; o[i] = prev; } } else { prev = v * k + prev * (1 - k); o[i] = prev; } } return o; },
    rma: function (s, p) { need(s, 'ta.rma'); p = per(p, 'ta.rma'); var o = blank(), prev = null, seed = 0, c = 0;
      for (var i = 0; i < N; i++) { var v = s[i]; if (!fin(v)) continue; if (prev == null) { seed += v; c++; if (c === p) { prev = seed / p; o[i] = prev; } } else { prev = (prev * (p - 1) + v) / p; o[i] = prev; } } return o; },
    wma: function (s, p) { need(s, 'ta.wma'); p = per(p, 'ta.wma'); var o = blank(), den = p * (p + 1) / 2;
      for (var i = p - 1; i < N; i++) { var acc = 0, ok = true; for (var j = 0; j < p; j++) { var v = s[i - j]; if (!fin(v)) { ok = false; break; } acc += v * (p - j); } if (ok) o[i] = acc / den; } return o; },
    stdev: function (s, p) { need(s, 'ta.stdev'); p = per(p, 'ta.stdev'); var m = ta.sma(s, p), o = blank();
      for (var i = p - 1; i < N; i++) { if (m[i] == null) continue; var acc = 0; for (var j = 0; j < p; j++) { var d = s[i - j] - m[i]; acc += d * d; } o[i] = Math.sqrt(acc / p); } return o; },
    highest: function (s, p) { need(s, 'ta.highest'); p = per(p, 'ta.highest'); var o = blank();
      for (var i = p - 1; i < N; i++) { var m = -Infinity; for (var j = 0; j < p; j++) { var v = s[i - j]; if (fin(v) && v > m) m = v; } o[i] = m === -Infinity ? null : m; } return o; },
    lowest: function (s, p) { need(s, 'ta.lowest'); p = per(p, 'ta.lowest'); var o = blank();
      for (var i = p - 1; i < N; i++) { var m = Infinity; for (var j = 0; j < p; j++) { var v = s[i - j]; if (fin(v) && v < m) m = v; } o[i] = m === Infinity ? null : m; } return o; },
    sum: function (s, p) { need(s, 'ta.sum'); p = per(p, 'ta.sum'); var o = blank();
      for (var i = p - 1; i < N; i++) { var acc = 0, ok = true; for (var j = 0; j < p; j++) { var v = s[i - j]; if (!fin(v)) { ok = false; break; } acc += v; } if (ok) o[i] = acc; } return o; },
    change: function (s, p) { need(s, 'ta.change'); p = p == null ? 1 : per(p, 'ta.change'); var o = blank();
      for (var i = p; i < N; i++) if (fin(s[i]) && fin(s[i - p])) o[i] = s[i] - s[i - p]; return o; },
    roc: function (s, p) { need(s, 'ta.roc'); p = per(p, 'ta.roc'); var o = blank();
      for (var i = p; i < N; i++) if (fin(s[i]) && fin(s[i - p]) && s[i - p] !== 0) o[i] = (s[i] / s[i - p] - 1) * 100; return o; },
    rsi: function (s, p) { need(s, 'ta.rsi'); p = per(p == null ? 14 : p, 'ta.rsi'); var up = blank(), dn = blank();
      for (var i = 1; i < N; i++) if (fin(s[i]) && fin(s[i - 1])) { var d = s[i] - s[i - 1]; up[i] = Math.max(d, 0); dn[i] = Math.max(-d, 0); }
      var u = ta.rma(up, p), w = ta.rma(dn, p), o = blank();
      for (var k = 0; k < N; k++) if (u[k] != null && w[k] != null) o[k] = w[k] === 0 ? 100 : 100 - 100 / (1 + u[k] / w[k]); return o; },
    tr: function () { var o = blank(); for (var i = 0; i < N; i++) o[i] = i === 0 ? high[i] - low[i] : Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])); return o; },
    atr: function (p) { return ta.rma(ta.tr(), per(p == null ? 14 : p, 'ta.atr')); },
    vwap: function () { var o = blank(), pv = 0, vv = 0; for (var i = 0; i < N; i++) { pv += hlc3[i] * volume[i]; vv += volume[i]; o[i] = vv ? pv / vv : null; } return o; },
    crossover: function (a, b) { a = ser(a); b = ser(b); var o = new Array(N); o[0] = false;
      for (var i = 1; i < N; i++) o[i] = fin(a[i]) && fin(b[i]) && fin(a[i - 1]) && fin(b[i - 1]) && a[i] > b[i] && a[i - 1] <= b[i - 1]; return o; },
    crossunder: function (a, b) { a = ser(a); b = ser(b); var o = new Array(N); o[0] = false;
      for (var i = 1; i < N; i++) o[i] = fin(a[i]) && fin(b[i]) && fin(a[i - 1]) && fin(b[i - 1]) && a[i] < b[i] && a[i - 1] >= b[i - 1]; return o; },
  };
  Object.freeze(ta);

  /** Run fn(i, prev) once per candle, oldest → newest; prev is the series built so far. */
  function each(fn) { if (typeof fn !== 'function') throw new TypeError('each: expected a function (i) => value'); var o = blank();
    for (var i = 0; i < N; i++) { var v = fn(i, o); o[i] = v === undefined ? null : v; } return o; }
  /** Element-wise combine: zip((a, b) => a - b, s1, s2). Any null/NaN input → null. */
  function zip(fn) { var ss = Array.prototype.slice.call(arguments, 1).map(ser), o = blank();
    for (var i = 0; i < N; i++) { var args = new Array(ss.length), ok = true; for (var j = 0; j < ss.length; j++) { var v = ss[j][i]; if (!fin(v)) { ok = false; break; } args[j] = v; } if (ok) o[i] = fn.apply(null, args); } return o; }
  function nz(v, d) { return fin(v) ? v : d == null ? 0 : d; }

  function input(name, def, opts) {
    name = String(name).slice(0, 40); opts = opts || {};
    if (!fin(def)) throw new TypeError('input("' + name + '"): default must be a number');
    if (inputs.length >= L.inputs && !inputs.some(function (x) { return x.name === name; })) throw new RangeError('Too many inputs (max ' + L.inputs + ')');
    var min = num(opts.min, null), max = num(opts.max, null), step = num(opts.step, null);
    var v = fin(OV[name]) ? OV[name] : def;
    if (min != null) v = Math.max(min, v); if (max != null) v = Math.min(max, v);
    if (!inputs.some(function (x) { return x.name === name; })) inputs.push({ name: name, def: def, min: min, max: max, step: step, value: v });
    return v;
  }

  var COLOR = /^#[0-9a-fA-F]{6}$/;
  function plot(s, opts) {
    if (plots.length >= L.plots) throw new RangeError('Too many plots (max ' + L.plots + ')');
    s = ser(s); if (s.length !== N) throw new RangeError('plot: series has ' + s.length + ' values, expected ' + N + ' (one per candle)');
    opts = opts || {}; var vals = new Array(N);
    for (var i = 0; i < N; i++) { var v = s[i]; vals[i] = typeof v === 'boolean' ? (v ? 1 : 0) : fin(v) ? v : null; }
    plots.push({ title: String(opts.title || 'Plot ' + (plots.length + 1)).slice(0, 40), color: COLOR.test(opts.color) ? opts.color : null,
      style: opts.style === 'histogram' || opts.style === 'dashed' ? opts.style : 'line', values: vals });
  }
  function hline(v, opts) { if (!fin(v)) throw new TypeError('hline: value must be a number'); if (hlines.length >= L.hlines) throw new RangeError('Too many hlines (max ' + L.hlines + ')');
    hlines.push({ value: v, title: String((opts && opts.title) || '').slice(0, 40) }); }
  function fmt(x) { try { return typeof x === 'string' ? x : JSON.stringify(x, function (k, v) { return Array.isArray(v) && v.length > 8 ? v.slice(0, 8).concat(['…' + (v.length - 8) + ' more']) : v; }); } catch (e) { return String(x); } }
  function log() { if (logs.length >= L.logs) return; logs.push(Array.prototype.map.call(arguments, fmt).join(' ').slice(0, 300)); }

  var api = { open: open, high: high, low: low, close: close, volume: volume, time: time, hl2: hl2, hlc3: hlc3, ohlc4: ohlc4, n: N,
    ta: ta, each: each, zip: zip, nz: nz, input: input, plot: plot, hline: hline, log: log, na: null };
  Object.keys(api).forEach(function (k) { Object.defineProperty(globalThis, k, { value: api[k], writable: false, configurable: false, enumerable: true }); });
  Object.defineProperty(globalThis, 'console', { value: Object.freeze({ log: log, warn: log, error: log, info: log }), writable: false, configurable: false });
  // Nothing in the VM can reach the host anyway; remove eval-style entry points for hygiene.
  delete globalThis.eval;
  Object.defineProperty(globalThis, '__AZ_RESULT', { value: function () { return JSON.stringify({ plots: plots, hlines: hlines, inputs: inputs, logs: logs }); }, writable: false, configurable: false });
})();
`;
