import { describe, expect, it } from 'vitest';
import { checkLiteral, literalValue } from '../../src/source/literals';

const SRC = `const float K = 2.0;
float helper(float x) { return x * 3.0; }
#define SCALE 4.0
void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord / iResolution.xy;
    float speed = 1.5;
    float d = length(uv) - 0.3;
    vec3 col = vec3(0.1, 0.2, 0.3);
    col += -0.25;
    float m = d -0.5;
    const float C = 7.0;
    float arr[4];
    int n = 3;
    uint u = 9u;
    switch (n) { case 2: d = 8.5; break; }
    for (int i = 0; i < 5; i++) { d += sin(uv.x * 10.0); }
    // 6.0 in a comment
    fragColor = vec4(col, 1.0);
}`;

/** Selects the nth occurrence of `needle` (or a caret at its start). */
function at(needle: string, nth = 0, caret = false) {
  let i = -1;
  for (let n = 0; n <= nth; n++) i = SRC.indexOf(needle, i + 1);
  if (i < 0) throw new Error(`missing ${needle}`);
  return checkLiteral(SRC, i, caret ? i : i + needle.length);
}

describe('literal eligibility', () => {
  it('accepts a float literal and proposes the assigned variable', () => {
    const r = at('1.5');
    expect(r.ok && [r.value, r.type, r.proposedName]).toEqual([1.5, 'float', 'speedAmt']);
  });

  it('accepts a caret inside a literal', () => {
    const r = checkLiteral(SRC, SRC.indexOf('0.3') + 1, SRC.indexOf('0.3') + 1);
    expect(r.ok && r.value).toBe(0.3);
  });

  it('names vector components', () => {
    const r = at('0.2');
    expect(r.ok && r.proposedName).toBe('colY');
  });

  it('names function arguments', () => {
    const r = at('10.0');
    expect(r.ok && r.proposedName).toBe('sinArg');
  });

  it('includes a selected unary minus', () => {
    const r = at('-0.25');
    expect(r.ok && [r.value, SRC.slice(r.from, r.to)]).toEqual([-0.25, '-0.25']);
  });

  it('leaves a binary minus in place', () => {
    const r = at('-0.5');
    expect(r.ok && [r.value, SRC.slice(r.from, r.to)]).toEqual([0.5, '0.5']);
  });

  it('accepts int literals, including loop bounds', () => {
    const r = at('5;');
    expect(r.ok).toBe(false); // selection includes ';'
    const r2 = checkLiteral(SRC, SRC.indexOf('< 5') + 2, SRC.indexOf('< 5') + 3);
    expect(r2.ok && [r2.value, r2.type]).toEqual([5, 'int']);
  });

  it.each([
    ['2.0', 0, 'mainImage'],
    ['3.0', 0, 'helper functions'],
    ['4.0', 0, 'Preprocessor'],
    ['7.0', 0, 'const'],
    ['4]', 0, 'Select'],
    ['9u', 0, 'Unsigned'],
    ['6.0', 0, 'comment'],
    ['col', 0, 'Select a number'],
  ])('declines %s', (needle, nth, reason) => {
    const r = at(needle, nth);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(reason);
  });

  it('declines array sizes', () => {
    const i = SRC.indexOf('arr[4]') + 4;
    const r = checkLiteral(SRC, i, i + 1);
    expect(!r.ok && r.reason).toContain('Array sizes');
  });

  it('declines case labels but not statements after them', () => {
    const i = SRC.indexOf('case 2') + 5;
    const r = checkLiteral(SRC, i, i + 1);
    expect(!r.ok && r.reason).toContain('case');
    const r2 = at('8.5');
    expect(r2.ok).toBe(true);
  });

  it('declines a selection of two numbers', () => {
    const i = SRC.indexOf('0.1, 0.2');
    const r = checkLiteral(SRC, i, i + 8);
    expect(!r.ok && r.reason).toContain('single');
  });

  it('parses literal values', () => {
    expect(literalValue('0x1F')).toBe(31);
    expect(literalValue('2.5f')).toBe(2.5);
    expect(literalValue('.5')).toBe(0.5);
    expect(literalValue('1e-3')).toBe(0.001);
  });

  it('proposes knobN when no context helps', () => {
    const src = 'void mainImage(out vec4 o, in vec2 c) { o = vec4(c, 0, 1) * 2.0; }';
    const i = src.indexOf('2.0');
    const r = checkLiteral(src, i, i + 3);
    expect(r.ok && r.proposedName).toBe('oAmt');
    const src2 = 'void mainImage(out vec4 o, in vec2 c) { if (c.x > 2.0) discard; }';
    const j = src2.indexOf('2.0');
    const r2 = checkLiteral(src2, j, j + 3);
    expect(r2.ok && r2.proposedName).toBe('knob1');
  });

  it('avoids collisions with existing names', () => {
    const src = 'void mainImage(out vec4 o, in vec2 c) { float sinArg = 1.0; o = vec4(sin(3.0)); }';
    const i = src.indexOf('3.0');
    const r = checkLiteral(src, i, i + 3);
    expect(r.ok && r.proposedName).toBe('sinArg2');
  });
});
