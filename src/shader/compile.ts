// Compile validator: compiles and links a wrapped shader against a WebGL2
// context and reports structured errors. No interface involved, so the v1.1
// agent can use it for its repair loop.

import { analyze } from '../source/mainImage';
import { parseInfoLog, type ShaderError } from './errors';
import { VERTEX_SHADER, wrapShader, type WrapperParam } from './wrapper';

export interface CompileOk {
  ok: true;
  fragmentShader: string;
  params: WrapperParam[];
  warnings: ShaderError[];
}

export interface CompileFail {
  ok: false;
  errors: ShaderError[];
}

export type CompileResult = CompileOk | CompileFail;

/** The extra mainImage parameters the wrapper must pass, or a reason it can't. */
export function wrapperParams(source: string): WrapperParam[] | ShaderError {
  const a = analyze(source);
  if (a.ok) return a.info.params.slice(2).map((p) => ({ name: p.name, type: p.type }));
  // Without a reliable analysis, assume the standard two-parameter form and
  // let the driver report any mismatch.
  if (a.reason === 'no mainImage function was found') {
    return { line: null, message: 'No mainImage(out vec4 fragColor, in vec2 fragCoord) function found.', severity: 'error' };
  }
  return [];
}

export function compileShader(gl: WebGL2RenderingContext, source: string): CompileResult {
  const params = wrapperParams(source);
  if (!Array.isArray(params)) return { ok: false, errors: [params] };

  const fragmentShader = wrapShader(source, params);
  const userLines = source.split('\n').length;

  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vs || !fs || !program) {
    return { ok: false, errors: [{ line: null, message: 'WebGL could not create a shader.', severity: 'error' }] };
  }
  try {
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);
    gl.shaderSource(fs, fragmentShader);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const errors = parseInfoLog(gl.getShaderInfoLog(fs) ?? '', userLines).filter(
        (e) => e.severity === 'error',
      );
      return {
        ok: false,
        errors: errors.length ? errors : [{ line: null, message: 'Compile failed.', severity: 'error' }],
      };
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const errors = parseInfoLog(gl.getProgramInfoLog(program) ?? '', userLines);
      return {
        ok: false,
        errors: errors.length ? errors : [{ line: null, message: 'Link failed.', severity: 'error' }],
      };
    }
    const warnings = parseInfoLog(gl.getShaderInfoLog(fs) ?? '', userLines).filter(
      (e) => e.severity === 'warning',
    );
    return { ok: true, fragmentShader, params, warnings };
  } finally {
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }
}
