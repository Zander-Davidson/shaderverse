import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/source/mainImage';
import { checkLiteral } from '../../src/source/literals';
import { bakeAll, bakeRewrite, createKnobRewrite, formatLiteral, renameRewrite } from '../../src/source/rewrite';

const SRC = `void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    float speed = 1.5;
    fragColor = vec4(vec3(sin(iTime * speed)), 1.0);
}`;

function create(src: string, needle: string, name?: string) {
  const i = src.indexOf(needle);
  const r = checkLiteral(src, i, i + needle.length);
  if (!r.ok) throw new Error(r.reason);
  const a = analyze(src);
  if (!a.ok) throw new Error(a.reason);
  return createKnobRewrite(src, r.info, a.tokens, r.from, r.to, name ?? r.proposedName, r.type);
}

describe('rewrites', () => {
  it('creates a knob: replaces the literal and appends the parameter', () => {
    const r = create(SRC, '1.5', 'rate');
    expect(r.source).toContain('in vec2 fragCoord, in float rate)');
    expect(r.source).toContain('float speed = rate;');
    expect(r.changes).toHaveLength(2);
    const a = analyze(r.source);
    expect(a.ok && a.info.knobParams).toEqual([{ name: 'rate', type: 'float' }]);
  });

  it('appends after the last parameter even with trailing whitespace', () => {
    const src = 'void mainImage(out vec4 o,\n  in vec2 c\n) { o = vec4(2.0); }';
    const r = create(src, '2.0', 'k');
    expect(r.source).toBe('void mainImage(out vec4 o,\n  in vec2 c, in float k\n) { o = vec4(k); }');
  });

  it('renames the signature and body uses, not fields', () => {
    const src = 'void mainImage(out vec4 o, in vec2 c, in float s) { vec3 v; v.s = s; o = vec4(s * s); }';
    const r = renameRewrite(src, 's', 'scale')!;
    expect(r.source).toBe(
      'void mainImage(out vec4 o, in vec2 c, in float scale) { vec3 v; v.s = scale; o = vec4(scale * scale); }',
    );
  });

  it('bakes a knob: replaces uses and removes the parameter', () => {
    const src = 'void mainImage(out vec4 o, in vec2 c, in float a, in int n) { o = vec4(a * float(n)); }';
    expect(bakeRewrite(src, 'a', -0.5, 'float')!.source).toBe(
      'void mainImage(out vec4 o, in vec2 c, in int n) { o = vec4((-0.5) * float(n)); }',
    );
    expect(bakeRewrite(src, 'n', 3, 'int')!.source).toBe(
      'void mainImage(out vec4 o, in vec2 c, in float a) { o = vec4(a * float(3)); }',
    );
  });

  it('bakes all knobs back to the standard signature', () => {
    const src = 'void mainImage(out vec4 o, in vec2 c,\n    in float a, in float b) { o = vec4(a, b, 0, 1); }';
    expect(bakeAll(src, [{ param: 'a', value: 1, type: 'float' }, { param: 'b', value: 0.25, type: 'float' }])).toBe(
      'void mainImage(out vec4 o, in vec2 c) { o = vec4(1.0, 0.25, 0, 1); }',
    );
  });

  it('round-trips create then bake to the original', () => {
    const r = create(SRC, '1.5', 'rate');
    expect(bakeRewrite(r.source, 'rate', 1.5, 'float')!.source).toBe(SRC);
  });

  it('formats literals', () => {
    expect(formatLiteral(2, 'float')).toBe('2.0');
    expect(formatLiteral(0.1 + 0.2, 'float')).toBe('0.3');
    expect(formatLiteral(1e-9, 'float')).toBe('1.0e-9');
    expect(formatLiteral(2.6, 'int')).toBe('3');
  });
});
