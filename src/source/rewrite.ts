// Source rewrites for knobs. Each returns a list of text changes so the editor
// can apply them as one undoable transaction, plus the resulting source.

import { analyze, type KnobType, type MainImageInfo } from './mainImage';
import { significant, type Token } from './tokenizer';

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

export interface Rewrite {
  source: string;
  changes: TextChange[];
}

export function applyChanges(src: string, changes: TextChange[]): string {
  const sorted = [...changes].sort((a, b) => b.from - a.from);
  let out = src;
  for (const c of sorted) out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  return out;
}

/** Formats a knob value as a GLSL literal of the given type. */
export function formatLiteral(value: number, type: KnobType): string {
  if (type === 'int') return String(Math.round(value));
  if (!Number.isFinite(value)) return '0.0';
  let s = String(Number(value.toPrecision(7)));
  if (/e/i.test(s)) {
    const [m, e] = s.split(/e/i);
    s = `${m!.includes('.') ? m : `${m}.0`}e${e}`;
  } else if (!s.includes('.')) {
    s = `${s}.0`;
  }
  return s;
}

/** End offset of the last significant token before `pos`. */
function endBefore(tokens: Token[], pos: number): number {
  let end = pos;
  for (const t of tokens) {
    if (t.start >= pos) break;
    if (t.type !== 'whitespace' && t.type !== 'comment') end = t.end;
  }
  return end;
}

/** Replaces `[from, to)` with `name` and appends `in <type> <name>` to the signature. */
export function createKnobRewrite(
  src: string,
  info: MainImageInfo,
  tokens: Token[],
  from: number,
  to: number,
  name: string,
  type: KnobType,
): Rewrite {
  const insertAt = endBefore(tokens, info.parenClose);
  const changes: TextChange[] = [
    { from: insertAt, to: insertAt, insert: `, in ${type} ${name}` },
    { from, to, insert: name },
  ];
  return { source: applyChanges(src, changes), changes };
}

/** Identifier uses of `name` inside the body (not field or swizzle accesses). */
function bodyUses(tokens: Token[], info: MainImageInfo, name: string): Token[] {
  const sig = significant(tokens);
  return sig.filter(
    (t, i) =>
      t.type === 'identifier' &&
      t.text === name &&
      t.start > info.bodyOpen &&
      t.end <= info.bodyClose &&
      sig[i - 1]?.text !== '.',
  );
}

export function renameRewrite(src: string, oldName: string, newName: string): Rewrite | null {
  const a = analyze(src);
  if (!a.ok) return null;
  const param = a.info.params.slice(2).find((p) => p.name === oldName);
  if (!param) return null;
  const changes: TextChange[] = [
    { from: param.nameStart, to: param.nameEnd, insert: newName },
    ...bodyUses(a.tokens, a.info, oldName).map((t) => ({ from: t.start, to: t.end, insert: newName })),
  ];
  return { source: applyChanges(src, changes), changes };
}

/** Replaces each use with the value and removes the parameter. */
export function bakeRewrite(src: string, name: string, value: number, type: KnobType): Rewrite | null {
  const a = analyze(src);
  if (!a.ok) return null;
  const params = a.info.params;
  const index = params.findIndex((p, i) => i >= 2 && p.name === name);
  if (index === -1) return null;
  const param = params[index]!;
  const lit = formatLiteral(value, type);
  const replacement = value < 0 ? `(${lit})` : lit;
  // Remove from the end of the previous parameter through this one, which
  // takes the separating comma (and any line break) with it.
  const removeFrom = params[index - 1]!.end;
  const changes: TextChange[] = [
    { from: removeFrom, to: param.end, insert: '' },
    ...bodyUses(a.tokens, a.info, name).map((t) => ({ from: t.start, to: t.end, insert: replacement })),
  ];
  return { source: applyChanges(src, changes), changes };
}

/** Bakes every knob, returning a standard Shadertoy `mainImage` shader. */
export function bakeAll(
  src: string,
  knobs: { param: string; value: number; type: KnobType }[],
): string {
  let out = src;
  for (const k of knobs) {
    const r = bakeRewrite(out, k.param, k.value, k.type);
    if (r) out = r.source;
  }
  return out;
}
