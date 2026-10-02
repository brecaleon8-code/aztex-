/**
 * Custom-indicator formula language (spec §5). Hand-rolled, no eval():
 *   tokenize() -> parse() (recursive descent) -> evaluate()
 *
 * Grammar:
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary)*
 *   unary   := '-' unary | primary
 *   primary := NUMBER | IDENT | IDENT '(' expr ',' expr ')' | '(' expr ')'
 */
import type { Candle } from '@/types';
import { ema, sma, type Series } from './series';

export type Token =
  | { type: 'num'; value: number; pos: number }
  | { type: 'ident'; value: string; pos: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/'; pos: number }
  | { type: 'lparen' | 'rparen' | 'comma'; pos: number }
  | { type: 'eof'; pos: number };

export type Node =
  | { kind: 'num'; value: number }
  | { kind: 'series'; name: SeriesName }
  | { kind: 'neg'; arg: Node }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { kind: 'call'; fn: FnName; args: Node[] };

export const SERIES_NAMES = ['close', 'open', 'high', 'low', 'volume'] as const;
export type SeriesName = (typeof SERIES_NAMES)[number];
export const FUNCTIONS = ['sma', 'ema'] as const;
export type FnName = (typeof FUNCTIONS)[number];

export class FormulaError extends Error {
  constructor(
    message: string,
    public pos: number,
  ) {
    super(message);
    this.name = 'FormulaError';
  }
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      const text = src.slice(start, i);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) throw new FormulaError(`Invalid number "${text}"`, start);
      tokens.push({ type: 'num', value: parseFloat(text), pos: start });
    } else if (/[a-zA-Z_]/.test(c)) {
      const start = i;
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) i++;
      tokens.push({ type: 'ident', value: src.slice(start, i).toLowerCase(), pos: start });
    } else if (c === '+' || c === '-' || c === '*' || c === '/') {
      tokens.push({ type: 'op', value: c, pos: i++ });
    } else if (c === '(') tokens.push({ type: 'lparen', pos: i++ });
    else if (c === ')') tokens.push({ type: 'rparen', pos: i++ });
    else if (c === ',') tokens.push({ type: 'comma', pos: i++ });
    else throw new FormulaError(`Unexpected character "${c}"`, i);
  }
  tokens.push({ type: 'eof', pos: src.length });
  return tokens;
}

export function parse(src: string): Node {
  if (!src.trim()) throw new FormulaError('Formula is empty', 0);
  const tokens = tokenize(src);
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const describe = (t: Token) =>
    t.type === 'eof' ? 'end of formula' : t.type === 'num' || t.type === 'ident' || t.type === 'op' ? `"${t.value}"` : `"${{ lparen: '(', rparen: ')', comma: ',' }[t.type]}"`;
  const expect = (type: Token['type'], what: string) => {
    const t = next();
    if (t.type !== type) throw new FormulaError(`Expected ${what} but found ${describe(t)}`, t.pos);
    return t;
  };

  function expr(): Node {
    let left = term();
    for (let t = peek(); t.type === 'op' && (t.value === '+' || t.value === '-'); t = peek()) {
      next();
      left = { kind: 'bin', op: t.value, left, right: term() };
    }
    return left;
  }
  function term(): Node {
    let left = unary();
    for (let t = peek(); t.type === 'op' && (t.value === '*' || t.value === '/'); t = peek()) {
      next();
      left = { kind: 'bin', op: t.value, left, right: unary() };
    }
    return left;
  }
  function unary(): Node {
    const t = peek();
    if (t.type === 'op' && t.value === '-') {
      next();
      return { kind: 'neg', arg: unary() };
    }
    return primary();
  }
  function primary(): Node {
    const t = next();
    if (t.type === 'num') return { kind: 'num', value: t.value };
    if (t.type === 'lparen') {
      const e = expr();
      expect('rparen', '")"');
      return e;
    }
    if (t.type === 'ident') {
      if (peek().type === 'lparen') {
        if (!(FUNCTIONS as readonly string[]).includes(t.value))
          throw new FormulaError(`Unknown function "${t.value}" — available: ${FUNCTIONS.join(', ')}`, t.pos);
        next();
        const series = expr();
        expect('comma', '"," between series and period');
        const periodTok = peek();
        const period = expr();
        expect('rparen', '")"');
        const pv = constValue(period);
        if (pv == null) throw new FormulaError(`${t.value}() period must be a constant number`, periodTok.pos);
        if (!Number.isInteger(pv) || pv < 1 || pv > 1000)
          throw new FormulaError(`${t.value}() period must be a whole number between 1 and 1000`, periodTok.pos);
        return { kind: 'call', fn: t.value as FnName, args: [series, { kind: 'num', value: pv }] };
      }
      if (!(SERIES_NAMES as readonly string[]).includes(t.value))
        throw new FormulaError(`Unknown series "${t.value}" — use ${SERIES_NAMES.join(', ')}`, t.pos);
      return { kind: 'series', name: t.value as SeriesName };
    }
    throw new FormulaError(`Unexpected ${describe(t)}`, t.pos);
  }

  const root = expr();
  const end = peek();
  if (end.type !== 'eof') throw new FormulaError(`Unexpected ${describe(end)}`, end.pos);
  return root;
}

/** Folds a constant sub-expression to a number, or null if it references a series. */
export function constValue(n: Node): number | null {
  switch (n.kind) {
    case 'num':
      return n.value;
    case 'neg': {
      const v = constValue(n.arg);
      return v == null ? null : -v;
    }
    case 'bin': {
      const l = constValue(n.left);
      const r = constValue(n.right);
      if (l == null || r == null) return null;
      return applyOp(n.op, l, r);
    }
    default:
      return null;
  }
}

function applyOp(op: '+' | '-' | '*' | '/', a: number, b: number): number | null {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 ? null : a / b;
  }
}

/** Evaluates an AST over the full candle history, returning a series aligned to candles. */
export function evaluate(node: Node, candles: Candle[]): Series {
  const n = candles.length;
  const rec = (node: Node): Series => {
    switch (node.kind) {
      case 'num':
        return new Array(n).fill(node.value);
      case 'series':
        return candles.map((c) => c[node.name]);
      case 'neg':
        return rec(node.arg).map((v) => (v == null ? null : -v));
      case 'bin': {
        const l = rec(node.left);
        const r = rec(node.right);
        return l.map((a, i) => {
          const b = r[i];
          if (a == null || b == null) return null;
          const v = applyOp(node.op, a, b);
          return v == null || !Number.isFinite(v) ? null : v;
        });
      }
      case 'call': {
        const src = rec(node.args[0]);
        const period = (node.args[1] as { value: number }).value;
        return node.fn === 'sma' ? sma(src, period) : ema(src, period);
      }
    }
  };
  return rec(node);
}

export type CompileResult = { ok: true; ast: Node } | { ok: false; error: string; pos: number };

/** Parse without throwing — for live inline validation in the UI. */
export function compile(src: string): CompileResult {
  try {
    return { ok: true, ast: parse(src) };
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, error: e.message, pos: e.pos };
    return { ok: false, error: String(e), pos: 0 };
  }
}
