import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../../examples';
import { exportBakedGlsl } from '../../src/project/persistence';
import { LIBRARY, preludeFor, stdFunction } from '../../src/shader/stdlib';
import { wrapShader } from '../../src/shader/wrapper';
import { functionAt, interactiveTokens } from '../../src/source/functions';
import { tokenize } from '../../src/source/tokenizer';

describe('shader standard library', () => {
  it('includes only the library functions a shader calls', () => {
    const p = preludeFor('void mainImage(out vec4 c, in vec2 p) { c = vec4(reciprocal(p.x)); }');
    expect(p).toContain('float reciprocal(float x)');
    expect(p).toContain('vec3 reciprocal(vec3 x)');
    expect(p).not.toContain('square');
  });

  it('leaves out names the shader defines itself', () => {
    const src = 'float square(float x) { return x * x * 2.0; }\nvoid mainImage(out vec4 c, in vec2 p) { c = vec4(square(p.x)); }';
    expect(preludeFor(src)).toBe('');
    expect(preludeFor('#define wave(x) x\nfloat a = wave(1.0);')).toBe('');
  });

  it('puts the library ahead of #line 1, so error lines stay on user code', () => {
    const out = wrapShader('void mainImage(out vec4 c, in vec2 p) { c = vec4(tonemap(1.0)); }', []);
    expect(out.indexOf('float tonemap(float x)')).toBeLessThan(out.indexOf('#line 1'));
  });

  it('highlights library names as built-ins', () => {
    expect(tokenize('reciprocal(x)')[0]!.type).toBe('builtin');
  });

  it('plots each library function in its basic form', () => {
    for (const fn of LIBRARY) {
      expect(fn.glsl).toBeTruthy();
      expect(fn.form.startsWith('f(x) = ')).toBe(true);
    }
    expect(stdFunction('reciprocal')!.f(4)).toBe(0.25);
    expect(stdFunction('sin')!.f(Math.PI / 2)).toBe(1);
  });

  it('every example uses the library, and exports it with the shader', () => {
    for (const ex of EXAMPLES) {
      const p = ex.create();
      expect(preludeFor(p.source), ex.name).not.toBe('');
      expect(exportBakedGlsl(p)).toContain('// SHADERVERSE standard library');
    }
  });
});

describe('functionAt', () => {
  const src = 'float y = reciprocal (x) + sin(x) + reciprocal;';
  it('finds a function name followed by a call', () => {
    const at = src.indexOf('reciprocal') + 3;
    expect(functionAt(src, at)).toMatchObject({ fn: { name: 'reciprocal' }, from: 10, to: 20 });
    expect(functionAt(src, src.indexOf('sin'))?.fn.name).toBe('sin');
  });

  it('ignores names that are not calls, and other tokens', () => {
    expect(functionAt(src, src.lastIndexOf('reciprocal'))).toBeNull();
    expect(functionAt(src, src.indexOf('('))).toBeNull();
    expect(functionAt(src, 0)).toBeNull();
  });
});

describe('interactiveTokens', () => {
  it('marks knob-able numbers and plottable calls, nothing else', () => {
    const src = 'const float K = 2.0;\nvoid mainImage(out vec4 c, in vec2 p) {\n  float r = sin(p.x * 3.0) + length(p);\n  c = vec4(r);\n}';
    const marks = interactiveTokens(src);
    expect(marks.get(src.indexOf('sin'))).toBe('plot');
    expect(marks.get(src.indexOf('length'))).toBe('plot');
    expect(marks.get(src.indexOf('3.0'))).toBe('knob');
    // Outside mainImage: a constant, not a knob.
    expect(marks.has(src.indexOf('2.0'))).toBe(false);
    expect(marks.has(src.indexOf('vec4(r)'))).toBe(false);
  });
});
