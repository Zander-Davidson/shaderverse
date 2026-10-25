// Decides whether a selection in the editor can become a knob, and proposes
// a name for it.

import { analyze, type KnobType, type MainImageInfo } from './mainImage';
import { BUILTINS, KEYWORDS, RESERVED, TYPES, isWord, type Token } from './tokenizer';
import { KNOB_UNIFORM_PREFIX } from '../shader/wrapper';

export interface EligibleLiteral {
  ok: true;
  /** Offset range to replace: the literal, plus a selected unary minus. */
  from: number;
  to: number;
  value: number;
  type: KnobType;
  proposedName: string;
  info: MainImageInfo;
}

export type Eligibility = EligibleLiteral | { ok: false; reason: string };

const decline = (reason: string): Eligibility => ({ ok: false, reason });

/** Parses a GLSL numeric literal's text to a JS number. */
export function literalValue(text: string): number {
  if (/^0[xX]/.test(text)) return parseInt(text.slice(2).replace(/[uU]$/, ''), 16);
  const t = text.replace(/[fFuU]$/, '');
  if (/^0[0-7]+$/.test(t)) return parseInt(t, 8);
  return Number(t);
}

function isOperandEnd(t: Token | undefined): boolean {
  if (!t) return false;
  if (t.type === 'number' || t.type === 'identifier' || t.type === 'builtin') return true;
  return t.text === ')' || t.text === ']' || t.text === '++' || t.text === '--';
}

/**
 * Resolves `[from, to)` to one numeric literal inside mainImage and checks
 * that GLSL allows a non-constant expression there.
 */
export function checkLiteral(src: string, from: number, to: number): Eligibility {
  const analysis = analyze(src);
  if (!analysis.ok) return decline(`Knobs are unavailable: ${analysis.reason}.`);
  const { info, tokens } = analysis;

  let picked: Token[];
  if (from === to) {
    // Caret: the number it sits in or touches.
    const at = tokens.find((t) => t.type === 'number' && t.start <= from && from <= t.end);
    if (!at) {
      const inPre = tokens.find((t) => t.type === 'preprocessor' && t.start <= from && from <= t.end);
      if (inPre) return decline('Preprocessor lines need constant values.');
      return decline('Select a number to turn it into a knob.');
    }
    picked = [at];
  } else {
    picked = tokens.filter((t) => t.end > from && t.start < to && t.type !== 'whitespace');
  }

  if (picked.some((t) => t.type === 'preprocessor')) {
    return decline('Preprocessor lines need constant values.');
  }
  if (picked.some((t) => t.type === 'comment')) return decline('That number is inside a comment.');

  let minus: Token | null = null;
  if (picked.length === 2 && picked[0]!.text === '-' && picked[1]!.type === 'number') {
    minus = picked[0]!;
    picked = [picked[1]!];
  }
  const numbers = picked.filter((t) => t.type === 'number');
  if (picked.length !== 1 || numbers.length !== 1) {
    return decline(
      numbers.length > 1 ? 'Select a single number.' : 'Select a number to turn it into a knob.',
    );
  }
  const lit = numbers[0]!;

  if (lit.numberKind === 'uint') return decline('Unsigned literals cannot become knobs in v1.0.');
  if (lit.start < info.bodyOpen || lit.end > info.bodyClose) {
    return decline(
      'Only numbers inside mainImage can become knobs; helper functions cannot see its parameters.',
    );
  }

  const sig = tokens.filter(
    (t) => t.type !== 'whitespace' && t.type !== 'comment' && t.type !== 'preprocessor',
  );
  const idx = sig.indexOf(lit);

  // A minus is unary only if nothing that ends an operand precedes it.
  if (minus && isOperandEnd(sig[idx - 2])) minus = null;

  const bodyIdx = sig.findIndex((t) => t.start === info.bodyOpen);
  const stmt = statementStart(sig, bodyIdx, idx);
  const ctx = constantContext(sig, stmt, idx);
  if (ctx) return decline(ctx);

  const value = (minus ? -1 : 1) * literalValue(lit.text);
  const type: KnobType = lit.numberKind === 'float' ? 'float' : 'int';
  return {
    ok: true,
    from: minus ? minus.start : lit.start,
    to: lit.end,
    value,
    type,
    proposedName: proposeName(sig, stmt, idx, tokens),
    info,
  };
}

/** Index of the first token of the statement containing `idx`. */
function statementStart(sig: Token[], bodyIdx: number, idx: number): number {
  let start = bodyIdx + 1;
  let parens = 0;
  let inCase = false;
  for (let i = bodyIdx + 1; i < idx; i++) {
    const t = sig[i]!.text;
    if (t === '(') parens++;
    else if (t === ')') parens--;
    else if (parens > 0) continue;
    else if (t === ';' || t === '{' || t === '}') start = i + 1;
    else if (t === 'case' || t === 'default') inCase = true;
    else if (t === ':' && inCase) {
      inCase = false;
      start = i + 1;
    }
  }
  return start;
}

/** Returns a reason if the literal at `idx` sits where GLSL needs a constant. */
function constantContext(sig: Token[], stmt: number, idx: number): string | null {
  for (let i = stmt; i < idx; i++) {
    if (sig[i]!.text === 'const') return 'const initializers must be constant.';
    if (sig[i]!.text === 'case') return 'case labels must be constant.';
  }
  // Innermost unclosed '[' within the statement: is it an array size?
  let depth = 0;
  for (let i = idx - 1; i >= stmt; i--) {
    const t = sig[i]!.text;
    if (t === ']') depth++;
    else if (t === '[') {
      if (depth > 0) {
        depth--;
        continue;
      }
      const before = sig[i - 1];
      if (before?.type === 'type') return 'Array sizes must be constant.';
      if (before?.type === 'identifier' && sig[i - 2]?.type === 'type') {
        return 'Array sizes must be constant.';
      }
    }
  }
  return null;
}

/** Every identifier in use, plus words GLSL won't accept as names. */
function takenNames(tokens: Token[]): Set<string> {
  const taken = new Set<string>([...KEYWORDS, ...TYPES, ...BUILTINS, ...RESERVED]);
  for (const t of tokens) if (t.type === 'identifier') taken.add(t.text);
  return taken;
}

export function isValidName(name: string, tokens: Token[], ignore?: string): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return 'Names use letters, digits and _, and cannot start with a digit.';
  if (name.startsWith('gl_') || name.includes('__')) return 'Names cannot start with gl_ or contain __.';
  if (name.startsWith(KNOB_UNIFORM_PREFIX)) return `Names cannot start with ${KNOB_UNIFORM_PREFIX}.`;
  if (name.length > 64) return 'That name is too long.';
  const taken = takenNames(tokens);
  if (ignore) taken.delete(ignore);
  if (taken.has(name)) return `"${name}" is already in use.`;
  return null;
}

export function uniqueName(base: string, tokens: Token[]): string {
  const clean = base.replace(/[^A-Za-z0-9_]/g, '').replace(/__+/g, '_').replace(/^gl_/, '') || 'knob';
  const start = /^[0-9]/.test(clean) ? `k${clean}` : clean;
  if (!isValidName(start, tokens)) return start;
  for (let n = 2; ; n++) {
    const c = `${start}${n}`;
    if (!isValidName(c, tokens)) return c;
  }
}

const COMPONENTS = ['X', 'Y', 'Z', 'W'];

const NOT_CALLS = new Set(['if', 'for', 'while', 'switch', 'return']);

function proposeName(sig: Token[], stmt: number, idx: number, tokens: Token[]): string {
  // Innermost enclosing call and which argument the literal is in.
  let depth = 0;
  let arg = 0;
  let callee: Token | null = null;
  for (let i = idx - 1; i >= stmt && !callee; i--) {
    const t = sig[i]!.text;
    if (t === ')' || t === ']') depth++;
    else if (t === '(' || t === '[') {
      if (depth > 0) depth--;
      else if (t === '(' && isWord(sig[i - 1]) && !NOT_CALLS.has(sig[i - 1]!.text)) callee = sig[i - 1]!;
      else arg = 0;
    } else if (t === ',' && depth === 0) arg++;
  }

  // The variable being assigned in this statement, if any.
  let assigned: string | null = null;
  for (let i = stmt; i < idx; i++) {
    if (!/^[*/+-]?=$/.test(sig[i]!.text)) continue;
    for (let j = i - 1; j >= stmt; j--) {
      const t = sig[j]!;
      if (t.type === 'identifier' && sig[j - 1]?.text !== '.') {
        assigned = t.text;
        break;
      }
    }
    break;
  }

  let base: string;
  if (callee?.type === 'type' && /vec[234]$/.test(callee.text)) {
    base = `${assigned ?? 'v'}${COMPONENTS[arg] ?? arg}`;
  } else if (callee && callee.type !== 'type') {
    base = `${callee.text}${arg > 0 ? arg + 1 : ''}Arg`;
  } else if (assigned) {
    base = `${assigned}Amt`;
  } else {
    let n = 1;
    while (isValidName(`knob${n}`, tokens)) n++;
    return `knob${n}`;
  }
  return uniqueName(base, tokens);
}
