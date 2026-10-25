// GLSL ES 3.00 tokenizer. Tokens cover the source contiguously (whitespace
// included), so highlighting can draw every character and analysis can map
// tokens back to exact offsets.

import { LIBRARY_NAMES } from '../shader/stdlib';

export type TokenType =
  | 'whitespace'
  | 'comment'
  | 'preprocessor'
  | 'number'
  | 'identifier'
  | 'keyword'
  | 'type'
  | 'builtin'
  | 'punct';

export type NumberKind = 'float' | 'int' | 'uint';

export interface Token {
  type: TokenType;
  text: string;
  start: number;
  end: number;
  /** 1-based line of the token's first character. */
  line: number;
  numberKind?: NumberKind;
}

export const KEYWORDS = new Set([
  'attribute', 'const', 'uniform', 'varying', 'layout', 'centroid', 'flat', 'smooth',
  'break', 'continue', 'do', 'for', 'while', 'switch', 'case', 'default', 'if', 'else',
  'in', 'out', 'inout', 'true', 'false', 'invariant', 'discard', 'return', 'struct',
  'lowp', 'mediump', 'highp', 'precision',
]);

export const TYPES = new Set([
  'void', 'bool', 'int', 'uint', 'float',
  'vec2', 'vec3', 'vec4', 'bvec2', 'bvec3', 'bvec4', 'ivec2', 'ivec3', 'ivec4',
  'uvec2', 'uvec3', 'uvec4', 'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4',
  'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
  'sampler2D', 'sampler3D', 'samplerCube', 'sampler2DShadow', 'samplerCubeShadow',
  'sampler2DArray', 'sampler2DArrayShadow', 'isampler2D', 'isampler3D', 'isamplerCube',
  'isampler2DArray', 'usampler2D', 'usampler3D', 'usamplerCube', 'usampler2DArray',
]);

export const BUILTINS = new Set([
  'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'asinh', 'acosh', 'atanh', 'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
  'abs', 'sign', 'floor', 'trunc', 'round', 'roundEven', 'ceil', 'fract', 'mod', 'modf',
  'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'isnan', 'isinf', 'floatBitsToInt',
  'floatBitsToUint', 'intBitsToFloat', 'uintBitsToFloat', 'packSnorm2x16', 'unpackSnorm2x16',
  'packUnorm2x16', 'unpackUnorm2x16', 'packHalf2x16', 'unpackHalf2x16', 'length', 'distance',
  'dot', 'cross', 'normalize', 'faceforward', 'reflect', 'refract', 'matrixCompMult',
  'outerProduct', 'transpose', 'determinant', 'inverse', 'lessThan', 'lessThanEqual',
  'greaterThan', 'greaterThanEqual', 'equal', 'notEqual', 'any', 'all', 'not',
  'textureSize', 'texture', 'textureProj', 'textureLod', 'textureOffset', 'texelFetch',
  'texelFetchOffset', 'textureProjOffset', 'textureLodOffset', 'textureProjLod',
  'textureProjLodOffset', 'textureGrad', 'textureGradOffset', 'textureProjGrad',
  'textureProjGradOffset', 'dFdx', 'dFdy', 'fwidth',
  'gl_FragCoord', 'gl_FrontFacing', 'gl_PointCoord', 'gl_FragDepth',
  'iTime', 'iTimeDelta', 'iFrame', 'iResolution', 'iMouse', 'iDate',
  // The shader standard library (src/shader/stdlib.ts).
  ...LIBRARY_NAMES,
]);

/** Words GLSL ES 3.00 reserves for future use; they can't be identifiers. */
export const RESERVED = new Set([
  'attribute', 'varying', 'coherent', 'volatile', 'restrict', 'readonly', 'writeonly',
  'resource', 'atomic_uint', 'noperspective', 'patch', 'sample', 'subroutine', 'common',
  'partition', 'active', 'asm', 'class', 'union', 'enum', 'typedef', 'template', 'this',
  'goto', 'inline', 'noinline', 'public', 'static', 'extern', 'external', 'interface',
  'long', 'short', 'double', 'half', 'fixed', 'unsigned', 'superp', 'input', 'output',
  'hvec2', 'hvec3', 'hvec4', 'dvec2', 'dvec3', 'dvec4', 'fvec2', 'fvec3', 'fvec4',
  'sampler3DRect', 'filter', 'image1D', 'image2D', 'image3D', 'imageCube', 'sizeof', 'cast',
  'namespace', 'using', 'main',
]);

const PUNCT3 = ['<<=', '>>='];
const PUNCT2 = [
  '++', '--', '<=', '>=', '==', '!=', '&&', '||', '^^', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '<<', '>>',
];

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c);

const HEX_RE = /0[xX][0-9a-fA-F]+[uU]?/y;
const FLOAT_RE = /(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?[fF]?|\d+[eE][+-]?\d+[fF]?/y;
const INT_RE = /\d+[uU]?/y;

function matchAt(re: RegExp, src: string, pos: number): string | null {
  re.lastIndex = pos;
  const m = re.exec(src);
  return m ? m[0] : null;
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  // True when only whitespace has been seen since the last newline, so a
  // '#' starts a preprocessor line.
  let lineStart = true;

  const push = (type: TokenType, end: number, numberKind?: NumberKind) => {
    const text = src.slice(pos, end);
    const tok: Token = { type, text, start: pos, end, line };
    if (numberKind) tok.numberKind = numberKind;
    tokens.push(tok);
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
    if (type !== 'whitespace' || text.includes('\n')) {
      lineStart = type === 'whitespace' ? /\n[ \t\r\f\v]*$/.test(text) : false;
    }
    if (type === 'preprocessor') lineStart = false;
    pos = end;
  };

  while (pos < src.length) {
    const c = src[pos]!;
    const next = src[pos + 1] ?? '';

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') {
      let end = pos + 1;
      while (end < src.length && /[ \t\n\r\f\v]/.test(src[end]!)) end++;
      push('whitespace', end);
      continue;
    }

    if (c === '/' && next === '/') {
      let end = pos + 2;
      while (end < src.length && src[end] !== '\n') end++;
      push('comment', end);
      continue;
    }

    if (c === '/' && next === '*') {
      const close = src.indexOf('*/', pos + 2);
      push('comment', close === -1 ? src.length : close + 2);
      continue;
    }

    if (c === '#' && (lineStart || pos === 0)) {
      // Runs to the end of the line, honoring backslash continuations.
      let end = pos + 1;
      while (end < src.length) {
        if (src[end] === '\n') {
          if (src[end - 1] === '\\' || (src[end - 1] === '\r' && src[end - 2] === '\\')) {
            end++;
            continue;
          }
          break;
        }
        end++;
      }
      push('preprocessor', end);
      continue;
    }

    if (isDigit(c) || (c === '.' && isDigit(next))) {
      const hex = matchAt(HEX_RE, src, pos);
      if (hex) {
        push('number', pos + hex.length, /[uU]$/.test(hex) ? 'uint' : 'int');
        continue;
      }
      const flt = matchAt(FLOAT_RE, src, pos);
      if (flt) {
        push('number', pos + flt.length, 'float');
        continue;
      }
      const int = matchAt(INT_RE, src, pos)!;
      push('number', pos + int.length, /[uU]$/.test(int) ? 'uint' : 'int');
      continue;
    }

    if (isIdentStart(c)) {
      let end = pos + 1;
      while (end < src.length && isIdentPart(src[end]!)) end++;
      const word = src.slice(pos, end);
      const type: TokenType = TYPES.has(word)
        ? 'type'
        : KEYWORDS.has(word)
          ? 'keyword'
          : BUILTINS.has(word)
            ? 'builtin'
            : 'identifier';
      push(type, end);
      continue;
    }

    const three = src.slice(pos, pos + 3);
    if (PUNCT3.includes(three)) {
      push('punct', pos + 3);
      continue;
    }
    const two = src.slice(pos, pos + 2);
    if (PUNCT2.includes(two)) {
      push('punct', pos + 2);
      continue;
    }
    push('punct', pos + 1);
  }

  return tokens;
}

/** Tokens that matter to the grammar: no whitespace, comments or preprocessor lines. */
export function significant(tokens: Token[]): Token[] {
  return tokens.filter(
    (t) => t.type !== 'whitespace' && t.type !== 'comment' && t.type !== 'preprocessor',
  );
}

/** Words that can name a type or are otherwise "identifier-like" in the grammar. */
export function isWord(t: Token | undefined): boolean {
  return !!t && (t.type === 'identifier' || t.type === 'builtin' || t.type === 'type' || t.type === 'keyword');
}
