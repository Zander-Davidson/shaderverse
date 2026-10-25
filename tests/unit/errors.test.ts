import { describe, expect, it } from 'vitest';
import { parseInfoLog } from '../../src/shader/errors';
import { wrapShader, WRAPPER_MAIN_LINE } from '../../src/shader/wrapper';

describe('error parser', () => {
  it('parses ANGLE logs (Chrome, Safari, Firefox on Windows)', () => {
    const log = "ERROR: 0:12: 'foo' : undeclared identifier\nERROR: 0:14: '' : syntax error\nERROR: 2 compilation errors.  No code generated.\n\0";
    expect(parseInfoLog(log)).toEqual([
      { line: 12, message: "'foo' : undeclared identifier", severity: 'error' },
      { line: 14, message: "'' : syntax error", severity: 'error' },
    ]);
  });

  it('parses Mesa logs (Firefox on Linux)', () => {
    expect(parseInfoLog('0:7(12): error: `x\' undeclared')).toEqual([
      { line: 7, message: "`x' undeclared", severity: 'error' },
    ]);
  });

  it('parses NVIDIA logs', () => {
    expect(parseInfoLog('0(3) : error C1008: undefined variable "q"')).toEqual([
      { line: 3, message: 'undefined variable "q"', severity: 'error' },
    ]);
  });

  it('keeps unknown lines as general errors', () => {
    expect(parseInfoLog('Something odd happened')).toEqual([
      { line: null, message: 'Something odd happened', severity: 'error' },
    ]);
  });

  it('maps wrapper lines to general errors', () => {
    const r = parseInfoLog(`ERROR: 0:${WRAPPER_MAIN_LINE + 2}: 'mainImage' : no matching overloaded function found`, 20);
    expect(r[0]!.line).toBeNull();
  });

  it('parses warnings', () => {
    expect(parseInfoLog('WARNING: 0:3: unused')[0]!.severity).toBe('warning');
  });
});

describe('wrapper', () => {
  it('declares knob uniforms and resets line numbers before the user source', () => {
    const src = 'void mainImage(out vec4 o, in vec2 c, in float a) { o = vec4(a); }';
    const w = wrapShader(src, [{ name: 'a', type: 'float' }]);
    const lines = w.split('\n');
    expect(lines[0]).toBe('#version 300 es');
    expect(w).toContain('uniform float svKnob_a;');
    const lineIdx = lines.indexOf('#line 1');
    expect(lines[lineIdx + 1]).toBe(src);
    expect(w).toContain('mainImage(svColor, gl_FragCoord.xy, svKnob_a);');
    for (const u of ['iResolution', 'iTime', 'iTimeDelta', 'iFrame', 'iMouse', 'iDate']) {
      expect(w).toMatch(new RegExp(`uniform \\w+ ${u};`));
    }
  });
});
