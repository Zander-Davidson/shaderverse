// Finds what in the source can be interacted with: standard library function
// calls (hover to plot) and numbers that can become knobs.

import { stdFunction, type StdFunction } from '../shader/stdlib';
import { checkLiteral } from './literals';
import { tokenize, type Token } from './tokenizer';

export interface FunctionHit {
  fn: StdFunction;
  from: number;
  to: number;
}

/** The plottable function whose name covers `pos` and is followed by `(`. */
export function functionAt(source: string, pos: number): FunctionHit | null {
  const tokens = tokenize(source);
  const i = tokens.findIndex((t) => t.start <= pos && pos < t.end);
  const t = tokens[i];
  if (!t || (t.type !== 'identifier' && t.type !== 'builtin')) return null;
  const fn = stdFunction(t.text);
  if (!fn) return null;
  return isCall(tokens, i) ? { fn, from: t.start, to: t.end } : null;
}

function isCall(tokens: Token[], i: number): boolean {
  const next = tokens.slice(i + 1).find((n) => n.type !== 'whitespace' && n.type !== 'comment');
  return next?.text === '(';
}

export type Interactive = 'knob' | 'plot';

/** Interactive tokens by start offset: numbers that can become knobs, and plottable calls. */
export function interactiveTokens(source: string): Map<number, Interactive> {
  const out = new Map<number, Interactive>();
  const tokens = tokenize(source);
  tokens.forEach((t, i) => {
    if (t.type === 'number' && checkLiteral(source, t.start, t.end).ok) out.set(t.start, 'knob');
    else if ((t.type === 'identifier' || t.type === 'builtin') && stdFunction(t.text) && isCall(tokens, i)) out.set(t.start, 'plot');
  });
  return out;
}
