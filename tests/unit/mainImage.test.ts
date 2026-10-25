import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/source/mainImage';

const ok = (src: string) => {
  const a = analyze(src);
  if (!a.ok) throw new Error(a.reason);
  return a.info;
};

describe('mainImage locator', () => {
  it('finds the standard signature', () => {
    const src = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(1); }';
    const info = ok(src);
    expect(info.params.map((p) => p.name)).toEqual(['fragColor', 'fragCoord']);
    expect(info.knobParams).toEqual([]);
    expect(src[info.bodyOpen]).toBe('{');
    expect(src[info.bodyClose]).toBe('}');
    expect(src[info.parenClose]).toBe(')');
  });

  it('tolerates comments, line breaks, and qualifiers', () => {
    const info = ok(`void   mainImage ( out highp vec4 c /* color */,
      vec2 p, // coord
      in float speed,
      const in mediump int count )
    {
      c = vec4(speed);
    }`);
    expect(info.knobParams).toEqual([
      { name: 'speed', type: 'float' },
      { name: 'count', type: 'int' },
    ]);
  });

  it('ignores helper functions and nested braces', () => {
    const info = ok(`float f(float x) { if (x > 0.0) { return x; } return 0.0; }
void mainImage(out vec4 o, in vec2 u) { { o = vec4(f(u.x)); } }`);
    expect(info.params).toHaveLength(2);
  });

  it.each([
    ['missing', 'void main() {}', 'no mainImage'],
    ['defined twice', 'void mainImage(out vec4 a, in vec2 b) {}\nvoid mainImage(out vec4 a, in vec2 b) {}', 'more than once'],
    ['macro', '#define MI mainImage\nvoid mainImage(out vec4 a, in vec2 b) {}', 'macro'],
    ['prototype', 'void mainImage(out vec4 a, in vec2 b);\nvoid mainImage(out vec4 a, in vec2 b) {}', 'elsewhere'],
    ['wrong first param', 'void mainImage(vec4 a, in vec2 b) {}', 'out vec4'],
    ['unclosed body', 'void mainImage(out vec4 a, in vec2 b) {', 'not closed'],
  ])('declines when %s', (_n, src, reason) => {
    const a = analyze(src);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toContain(reason);
  });

  it('warns about non-knob parameter types', () => {
    const a = analyze('void mainImage(out vec4 a, in vec2 b, vec3 tint) {}');
    expect(a.ok && a.warnings[0]).toContain('vec3');
  });
});
