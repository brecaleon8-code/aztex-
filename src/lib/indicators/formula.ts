/**
 * Formula language for custom indicators and strategy rules. Hand-rolled, no eval():
 *   tokenize() -> parse() (recursive descent) -> evaluate()
 *
 * Grammar (lowest → highest precedence):
 *   expr    := or
 *   or      := and (('or' | '||') and)*
 *   and     := not (('and' | '&&') not)*
 *   not     := ('not' | '!') not | cmp
 *   cmp     := add (('>' | '<' | '>=' | '<=' | '==' | '!=') add)?
 *   add     := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary)*
 *   unary   := '-' unary | primary
 *   primary := NUMBER | SERIES | FN '(' args ')' | '(' expr ')'
 *
 * Comparisons and logic yield 1 (true) / 0 (false), so a strategy rule is just a formula whose
 * value is non-zero on bars where the condition holds. Missing data (warm-up) propagates as null.
 */
import type { Candle } from '@/types';
import { ema, rsi as rsiCore, sma, type Series } from './series';

type ArithOp = '+' | '-' | '*' | '/';
type CmpOp = '>' | '<' | '>=' | '<=' | '==' | '!=';
type LogicOp = 'and' | 'or';
type Op = ArithOp | CmpOp | '&&' | '||' | '!';

export type Token =
  | { type: 'num'; value: number; pos: number }
  | { type: 'ident'; value: string; pos: number }
  | { type: 'op'; value: Op; pos: number }
  | { type: 'lparen' | 'rparen' | 'comma'; pos: number }
  | { type: 'eof'; pos: number };

export type Node =
  | { kind: 'num'; value: number }
  | { kind: 'series'; name: SeriesName }
  | { kind: 'neg'; arg: Node }
  | { kind: 'not'; arg: Node }
  | { kind: 'bin'; op: ArithOp | CmpOp | LogicOp; left: Node; right: Node }
  | { kind: 'call'; fn: FnName; args: Node[] };

export const SERIES_NAMES = ['close', 'open', 'high', 'low', 'volume'] as const;
export type SeriesName = (typeof SERIES_NAMES)[number];

/** Function table: arity, and which argument (if any) must be a constant whole-number period. */
const FN_SPEC = {
  sma: { args: 2, period: 1, help: 'sma(series, n)' },
  ema: { args: 2, period: 1, help: 'ema(series, n)' },
  rsi: { args: 2, period: 1, help: 'rsi(series, n)' },
  highest: { args: 2, period: 1, help: 'highest(series, n)' },
  lowest: { args: 2, period: 1, help: 'lowest(series, n)' },
  prev: { args: 2, period: 1, help: 'prev(series, n)' },
  cross_over: { args: 2, period: -1, help: 'cross_over(a, b)' },
  cross_under: { args: 2, period: -1, help: 'cross_under(a, b)' },
  min: { args: 2, period: -1, help: 'min(a, b)' },
  max: { args: 2, period: -1, help: 'max(a, b)' },
  abs: { args: 1, period: -1, help: 'abs(x)' },
} as const;
export type FnName = keyof typeof FN_SPEC;
export const FUNCTIONS = Object.keys(FN_SPEC) as FnName[];
export const FUNCTION_HELP = FUNCTIONS.map((f) => FN_SPEC[f].help);
const KEYWORDS = ['and', 'or', 'not'];

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
    const two = src.slice(i, i + 2);
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
    } else if (['>=', '<=', '==', '!=', '&&', '||'].includes(two)) {
      tokens.push({ type: 'op', value: two as Op, pos: i });
      i += 2;
    } else if ('+-*/<>!'.includes(c)) {
      tokens.push({ type: 'op', value: c as Op, pos: i++ });
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
  const isOp = (t: Token, ...ops: string[]) => t.type === 'op' && ops.includes(t.value);
  const isKw = (t: Token, kw: string) => t.type === 'ident' && t.value === kw;

  function expr(): Node {
    return or();
  }
  function or(): Node {
    let left = and();
    while (isKw(peek(), 'or') || isOp(peek(), '||')) {
      next();
      left = { kind: 'bin', op: 'or', left, right: and() };
    }
    return left;
  }
  function and(): Node {
    let left = not();
    while (isKw(peek(), 'and') || isOp(peek(), '&&')) {
      next();
      left = { kind: 'bin', op: 'and', left, right: not() };
    }
    return left;
  }
  function not(): Node {
    if (isKw(peek(), 'not') || isOp(peek(), '!')) {
      next();
      return { kind: 'not', arg: not() };
    }
    return cmp();
  }
  function cmp(): Node {
    const left = add();
    const t = peek();
    if (isOp(t, '>', '<', '>=', '<=', '==', '!=')) {
      next();
      return { kind: 'bin', op: (t as { value: CmpOp }).value, left, right: add() };
    }
    return left;
  }
  function add(): Node {
    let left = term();
    for (let t = peek(); isOp(t, '+', '-'); t = peek()) {
      next();
      left = { kind: 'bin', op: (t as { value: ArithOp }).value, left, right: term() };
    }
    return left;
  }
  function term(): Node {
    let left = unary();
    for (let t = peek(); isOp(t, '*', '/'); t = peek()) {
      next();
      left = { kind: 'bin', op: (t as { value: ArithOp }).value, left, right: unary() };
    }
    return left;
  }
  function unary(): Node {
    if (isOp(peek(), '-')) {
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
    if (t.type === 'ident' && !KEYWORDS.includes(t.value)) {
      if (peek().type === 'lparen') {
        if (!(t.value in FN_SPEC)) throw new FormulaError(`Unknown function "${t.value}" — available: ${FUNCTIONS.join(', ')}`, t.pos);
        const fn = t.value as FnName;
        const spec = FN_SPEC[fn];
        next();
        const args: Node[] = [];
        const argPos: number[] = [];
        for (let a = 0; a < spec.args; a++) {
          if (a > 0) expect('comma', `"," between arguments of ${spec.help}`);
          argPos.push(peek().pos);
          args.push(expr());
        }
        if (peek().type === 'comma') throw new FormulaError(`${fn}() takes ${spec.args} argument${spec.args > 1 ? 's' : ''}: ${spec.help}`, peek().pos);
        expect('rparen', '")"');
        if (spec.period >= 0) {
          const pv = constValue(args[spec.period]);
          if (pv == null) throw new FormulaError(`${fn}() period must be a constant number`, argPos[spec.period]);
          const min = fn === 'prev' ? 0 : 1;
          if (!Number.isInteger(pv) || pv < min || pv > 1000) throw new FormulaError(`${fn}() period must be a whole number between ${min} and 1000`, argPos[spec.period]);
          args[spec.period] = { kind: 'num', value: pv };
        }
        return { kind: 'call', fn, args };
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

/** Folds a constant arithmetic sub-expression to a number, or null if it references a series. */
export function constValue(n: Node): number | null {
  switch (n.kind) {
    case 'num':
      return n.value;
    case 'neg': {
      const v = constValue(n.arg);
      return v == null ? null : -v;
    }
    case 'bin': {
      if (n.op !== '+' && n.op !== '-' && n.op !== '*' && n.op !== '/') return null;
      const l = constValue(n.left);
      const r = constValue(n.right);
      if (l == null || r == null) return null;
      return applyArith(n.op, l, r);
    }
    default:
      return null;
  }
}

function applyArith(op: ArithOp, a: number, b: number): number | null {
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

function applyBin(op: ArithOp | CmpOp | LogicOp, a: number, b: number): number | null {
  switch (op) {
    case '>':
      return a > b ? 1 : 0;
    case '<':
      return a < b ? 1 : 0;
    case '>=':
      return a >= b ? 1 : 0;
    case '<=':
      return a <= b ? 1 : 0;
    case '==':
      return a === b ? 1 : 0;
    case '!=':
      return a !== b ? 1 : 0;
    case 'and':
      return a !== 0 && b !== 0 ? 1 : 0;
    case 'or':
      return a !== 0 || b !== 0 ? 1 : 0;
    default:
      return applyArith(op, a, b);
  }
}

/** RSI over a series that may start with nulls (warm-up) — gaps are carried forward. */
function rsiSeries(values: Series, period: number): Series {
  const first = values.findIndex((v) => v != null);
  if (first < 0) return values.map(() => null);
  const filled: number[] = [];
  let last = values[first] as number;
  for (let i = first; i < values.length; i++) {
    if (values[i] != null) last = values[i] as number;
    filled.push(last);
  }
  return [...new Array(first).fill(null), ...rsiCore(filled, period)];
}

function rolling(values: Series, n: number, pick: (a: number, b: number) => number): Series {
  return values.map((_, i) => {
    if (i < n - 1) return null;
    let acc: number | null = null;
    for (let j = i - n + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) return null;
      acc = acc == null ? v : pick(acc, v);
    }
    return acc;
  });
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
      case 'not':
        return rec(node.arg).map((v) => (v == null ? null : v === 0 ? 1 : 0));
      case 'bin': {
        const l = rec(node.left);
        const r = rec(node.right);
        return l.map((a, i) => {
          const b = r[i];
          if (a == null || b == null) return null;
          const v = applyBin(node.op, a, b);
          return v == null || !Number.isFinite(v) ? null : v;
        });
      }
      case 'call': {
        const a = rec(node.args[0]);
        const k = node.args[1]?.kind === 'num' ? node.args[1].value : 0;
        switch (node.fn) {
          case 'sma':
            return sma(a, k);
          case 'ema':
            return ema(a, k);
          case 'rsi':
            return rsiSeries(a, k);
          case 'highest':
            return rolling(a, k, Math.max);
          case 'lowest':
            return rolling(a, k, Math.min);
          case 'prev':
            return a.map((_, i) => (i - k >= 0 ? a[i - k] : null));
          case 'abs':
            return a.map((v) => (v == null ? null : Math.abs(v)));
          case 'min':
          case 'max': {
            const b = rec(node.args[1]);
            const f = node.fn === 'min' ? Math.min : Math.max;
            return a.map((v, i) => (v == null || b[i] == null ? null : f(v, b[i] as number)));
          }
          case 'cross_over':
          case 'cross_under': {
            const b = rec(node.args[1]);
            const up = node.fn === 'cross_over';
            return a.map((v, i) => {
              const pa = a[i - 1];
              const pb = b[i - 1];
              const vb = b[i];
              if (i === 0 || v == null || vb == null || pa == null || pb == null) return null;
              return up ? (v > vb && pa <= pb ? 1 : 0) : v < vb && pa >= pb ? 1 : 0;
            });
          }
        }
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

/** True when the formula's top level is a condition (comparison / logic / crossing). */
export function isCondition(ast: Node): boolean {
  if (ast.kind === 'not') return true;
  if (ast.kind === 'bin') return !['+', '-', '*', '/'].includes(ast.op);
  if (ast.kind === 'call') return ast.fn === 'cross_over' || ast.fn === 'cross_under';
  return false;
}
