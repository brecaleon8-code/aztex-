import type { Candle } from '@/types';
import { compile, evaluate, parse, tokenize } from './formula';
import { ema, sma } from './series';

const candles: Candle[] = Array.from({ length: 60 }, (_, i) => ({ time: i, open: 10 + i, high: 12 + i, low: 9 + i, close: 11 + i + (i % 3), volume: 100 + i }));
const close = candles.map((c) => c.close);

describe('tokenizer', () => {
  it('tokenizes numbers, identifiers, operators and punctuation', () => {
    expect(tokenize('sma(close, 20) * -1.5').map((t) => t.type)).toEqual(['ident', 'lparen', 'ident', 'comma', 'num', 'rparen', 'op', 'op', 'num', 'eof']);
  });
  it('rejects unknown characters with a position', () => {
    expect(() => tokenize('close ^ 2')).toThrow(/Unexpected character "\^"/);
  });
});

describe('parser precedence', () => {
  it('binds * tighter than + and handles unary minus / parens', () => {
    const r = evaluate(parse('2 + 3 * 4'), candles.slice(0, 1));
    expect(r[0]).toBe(14);
    expect(evaluate(parse('(2 + 3) * 4'), candles.slice(0, 1))[0]).toBe(20);
    expect(evaluate(parse('-close + 1'), candles.slice(0, 1))[0]).toBe(-10);
    expect(evaluate(parse('--2'), candles.slice(0, 1))[0]).toBe(2);
    expect(evaluate(parse('8 / 2 / 2'), candles.slice(0, 1))[0]).toBe(2); // left-assoc
  });
});

describe('evaluate', () => {
  it('computes nested functions over the full series', () => {
    const out = evaluate(parse('sma(close,20) - sma(close,50)'), candles);
    const a = sma(close, 20);
    const b = sma(close, 50);
    expect(out[48]).toBeNull();
    expect(out[55]).toBeCloseTo((a[55] as number) - (b[55] as number));
  });
  it('supports functions of expressions and ema', () => {
    const typical = candles.map((c) => (c.high + c.low + c.close) / 3);
    const out = evaluate(parse('ema((high + low + close) / 3, 9)'), candles);
    expect(out[30]).toBeCloseTo(ema(typical, 9)[30] as number);
  });
  it('yields null instead of Infinity on division by zero', () => {
    expect(evaluate(parse('close / (open - open)'), candles.slice(0, 2))).toEqual([null, null]);
  });
  it('is case-insensitive for identifiers', () => {
    expect(evaluate(parse('CLOSE'), candles.slice(0, 1))[0]).toBe(11);
  });
});

describe('errors are clear, never silent', () => {
  const err = (src: string) => {
    const r = compile(src);
    if (r.ok) throw new Error('expected error');
    return r.error;
  };
  it('reports unknown series and functions', () => {
    expect(err('clsoe')).toMatch(/Unknown series "clsoe"/);
    expect(err('wma(close, 3)')).toMatch(/Unknown function "wma"/);
  });
  it('reports structural problems', () => {
    expect(err('sma(close 20)')).toMatch(/Expected "," /);
    expect(err('(close + 1')).toMatch(/Expected "\)"/);
    expect(err('close +')).toMatch(/Unexpected end of formula/);
    expect(err('close close')).toMatch(/Unexpected "close"/);
    expect(err('')).toMatch(/empty/);
  });
  it('validates periods', () => {
    expect(err('sma(close, close)')).toMatch(/period must be a constant/);
    expect(err('sma(close, 2.5)')).toMatch(/whole number/);
    expect(err('ema(close, 0)')).toMatch(/whole number/);
    expect(compile('sma(close, 10 * 2)').ok).toBe(true);
  });
  it('never uses eval', async () => {
    const src = await import('./formula?raw');
    const code = src.default.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/\beval\s*\(|new Function/);
  });
});
