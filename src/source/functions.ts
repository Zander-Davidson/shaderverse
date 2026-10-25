// Finds the standard-library function called at a source position, for the
// function plot.

import { stdFunction, type StdFunction } from '../shader/stdlib';
import { tokenize } from './tokenizer';

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
  const next = tokens.slice(i + 1).find((n) => n.type !== 'whitespace' && n.type !== 'comment');
  return next?.text === '(' ? { fn, from: t.start, to: t.end } : null;
}
