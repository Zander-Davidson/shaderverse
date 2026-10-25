import { describe, expect, it } from 'vitest';
import { tokenize } from '../../src/source/tokenizer';

const nums = (src: string) =>
  tokenize(src)
    .filter((t) => t.type === 'number')
    .map((t) => [t.text, t.numberKind]);

describe('tokenizer', () => {
  it('covers the source contiguously', () => {
    const src = 'void f() { // hi\n  float x = .5; /* c */ }\n#define A 1\n';
    const toks = tokenize(src);
    expect(toks.map((t) => t.text).join('')).toBe(src);
    for (let i = 1; i < toks.length; i++) expect(toks[i]!.start).toBe(toks[i - 1]!.end);
  });

  it('reads numeric literal forms', () => {
    expect(nums('.5 5. 1e-3 1.5E+2 2.0f 42 7u 0x1F 0xFFu 3e2')).toEqual([
      ['.5', 'float'],
      ['5.', 'float'],
      ['1e-3', 'float'],
      ['1.5E+2', 'float'],
      ['2.0f', 'float'],
      ['42', 'int'],
      ['7u', 'uint'],
      ['0x1F', 'int'],
      ['0xFFu', 'uint'],
      ['3e2', 'float'],
    ]);
  });

  it('does not treat swizzles or identifiers with digits as numbers', () => {
    expect(nums('v.x vec2 a1 p.xy')).toEqual([]);
  });

  it('reads comments and preprocessor lines', () => {
    const toks = tokenize('#define X 1.0 \\\n  + 2.0\nfloat y = 3.0; // 4.0\n/* 5.0 */');
    expect(toks[0]!.type).toBe('preprocessor');
    expect(toks[0]!.text).toContain('+ 2.0');
    expect(nums('#define X 1.0\nfloat y = 3.0; // 4.0\n/* 5.0 */')).toEqual([['3.0', 'float']]);
  });

  it('only treats # at line start as preprocessor', () => {
    const toks = tokenize('a # b');
    expect(toks.some((t) => t.type === 'preprocessor')).toBe(false);
  });

  it('classifies words and tracks lines', () => {
    const toks = tokenize('float\nx = sin(iTime);');
    const x = toks.find((t) => t.text === 'x')!;
    expect(x.type).toBe('identifier');
    expect(x.line).toBe(2);
    expect(toks.find((t) => t.text === 'float')!.type).toBe('type');
    expect(toks.find((t) => t.text === 'sin')!.type).toBe('builtin');
  });

  it('reads multi-character operators', () => {
    const ops = tokenize('a <<= b; c += d; e == f').filter((t) => t.type === 'punct').map((t) => t.text);
    expect(ops).toEqual(['<<=', ';', '+=', ';', '==']);
  });
});
