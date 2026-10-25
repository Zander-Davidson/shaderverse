// Locates the single `mainImage` definition and parses its signature. Knob
// creation depends on this, so anything ambiguous is reported rather than
// guessed at; the shader itself still runs either way.

import { significant, tokenize, type Token } from './tokenizer';

export type KnobType = 'float' | 'int';

export interface Param {
  name: string;
  type: string;
  qualifiers: string[];
  /** Offset range of the whole parameter declaration text. */
  start: number;
  end: number;
  /** Offset range of the parameter name. */
  nameStart: number;
  nameEnd: number;
}

export interface MainImageInfo {
  /** Offset of '(' and ')' of the parameter list. */
  parenOpen: number;
  parenClose: number;
  /** Offset of '{' and '}' of the body. */
  bodyOpen: number;
  bodyClose: number;
  params: Param[];
  /** Parameters after fragCoord: the knobs (float or int only). */
  knobParams: { name: string; type: KnobType }[];
}

export type Analysis =
  | { ok: true; info: MainImageInfo; tokens: Token[]; warnings: string[] }
  | { ok: false; reason: string; tokens: Token[] };

const PARAM_QUALIFIERS = new Set(['in', 'out', 'inout', 'const', 'lowp', 'mediump', 'highp']);

function parseParam(toks: Token[]): Omit<Param, 'start' | 'end'> | string {
  const qualifiers: string[] = [];
  let i = 0;
  while (i < toks.length && PARAM_QUALIFIERS.has(toks[i]!.text)) qualifiers.push(toks[i++]!.text);
  const type = toks[i];
  const name = toks[i + 1];
  if (!type || !name || name.type !== 'identifier' || i + 2 !== toks.length) {
    return 'a mainImage parameter could not be parsed';
  }
  return {
    name: name.text,
    type: type.text,
    qualifiers,
    nameStart: name.start,
    nameEnd: name.end,
  };
}

/** Index of the token closing the bracket opened at `open`, or -1. */
export function matchBracket(sig: Token[], open: number): number {
  const o = sig[open]!.text;
  const c = o === '(' ? ')' : o === '[' ? ']' : '}';
  let depth = 0;
  for (let i = open; i < sig.length; i++) {
    const t = sig[i]!.text;
    if (t === o) depth++;
    else if (t === c && --depth === 0) return i;
  }
  return -1;
}

export function analyze(src: string): Analysis {
  const tokens = tokenize(src);

  for (const t of tokens) {
    if (t.type === 'preprocessor' && /\bmainImage\b/.test(t.text)) {
      return { ok: false, reason: 'mainImage is referenced by a macro', tokens };
    }
  }

  const sig = significant(tokens);
  const defs: number[] = [];
  let otherMentions = 0;
  let depth = 0;
  for (let i = 0; i < sig.length; i++) {
    const t = sig[i]!;
    if (t.text === '{') depth++;
    else if (t.text === '}') depth--;
    else if (t.text === 'mainImage') {
      if (depth === 0 && sig[i - 1]?.text === 'void' && sig[i + 1]?.text === '(') defs.push(i);
      else otherMentions++;
    }
  }

  if (defs.length === 0) return { ok: false, reason: 'no mainImage function was found', tokens };

  // A prototype is also "void mainImage(" at depth 0; tell it apart by what
  // follows the parameter list.
  const definitions: { name: number; close: number; body: number }[] = [];
  for (const d of defs) {
    const close = matchBracket(sig, d + 1);
    if (close === -1) return { ok: false, reason: 'the mainImage signature is not closed', tokens };
    const after = sig[close + 1];
    if (after?.text === '{') definitions.push({ name: d, close, body: close + 1 });
    else otherMentions++;
  }

  if (definitions.length !== 1) {
    return {
      ok: false,
      reason: definitions.length === 0 ? 'mainImage has no body' : 'mainImage is defined more than once',
      tokens,
    };
  }
  if (otherMentions > 0) {
    return { ok: false, reason: 'mainImage is declared or referenced elsewhere', tokens };
  }

  const def = definitions[0]!;
  const bodyCloseIdx = matchBracket(sig, def.body);
  if (bodyCloseIdx === -1) return { ok: false, reason: 'the mainImage body is not closed', tokens };

  const params: Param[] = [];
  let current: Token[] = [];
  const flush = () => {
    if (current.length === 0) return 'an empty mainImage parameter';
    const p = parseParam(current);
    if (typeof p === 'string') return p;
    params.push({ ...p, start: current[0]!.start, end: current[current.length - 1]!.end });
    current = [];
    return null;
  };
  for (let i = def.name + 2; i < def.close; i++) {
    const t = sig[i]!;
    if (t.text === ',') {
      const err = flush();
      if (err) return { ok: false, reason: err, tokens };
    } else {
      current.push(t);
    }
  }
  if (current.length > 0 || params.length > 0) {
    const err = flush();
    if (err) return { ok: false, reason: err, tokens };
  }

  const [color, coord] = params;
  if (!color || color.type !== 'vec4' || !color.qualifiers.includes('out')) {
    return { ok: false, reason: 'the first mainImage parameter must be "out vec4"', tokens };
  }
  if (!coord || coord.type !== 'vec2' || coord.qualifiers.some((q) => q === 'out' || q === 'inout')) {
    return { ok: false, reason: 'the second mainImage parameter must be "in vec2"', tokens };
  }

  const warnings: string[] = [];
  const knobParams: MainImageInfo['knobParams'] = [];
  for (const p of params.slice(2)) {
    if (p.type !== 'float' && p.type !== 'int') {
      warnings.push(`parameter "${p.name}" has type ${p.type}; knobs support float and int`);
      continue;
    }
    if (p.qualifiers.some((q) => q === 'out' || q === 'inout')) {
      warnings.push(`parameter "${p.name}" must be an input to be a knob`);
      continue;
    }
    knobParams.push({ name: p.name, type: p.type });
  }

  return {
    ok: true,
    tokens,
    warnings,
    info: {
      parenOpen: sig[def.name + 1]!.start,
      parenClose: sig[def.close]!.start,
      bodyOpen: sig[def.body]!.start,
      bodyClose: sig[bodyCloseIdx]!.start,
      params,
      knobParams,
    },
  };
}
