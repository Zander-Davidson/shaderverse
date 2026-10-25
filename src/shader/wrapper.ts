// Builds the complete GLSL ES 3.00 fragment shader around the user's source.
// The user never sees this; `#line 1` keeps error line numbers on their code.

export const KNOB_UNIFORM_PREFIX = 'svKnob_';

/** Line number given to the generated main(), so its errors are recognizable. */
export const WRAPPER_MAIN_LINE = 100000;

export interface WrapperParam {
  name: string;
  type: string;
}

export const knobUniformName = (param: string) => `${KNOB_UNIFORM_PREFIX}${param}`;

export const VERTEX_SHADER = `#version 300 es
in vec3 position;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const STANDARD_UNIFORMS = `uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;
`;

/**
 * @param params the `mainImage` parameters after `fragCoord`, in signature order.
 */
export function wrapShader(userSource: string, params: WrapperParam[]): string {
  const knobUniforms = params.map((p) => `uniform ${p.type} ${knobUniformName(p.name)};\n`).join('');
  const args = ['svColor', 'gl_FragCoord.xy', ...params.map((p) => knobUniformName(p.name))].join(', ');
  return (
    '#version 300 es\n' +
    'precision highp float;\n' +
    'precision highp int;\n' +
    STANDARD_UNIFORMS +
    knobUniforms +
    'out vec4 svFragColor;\n' +
    '#line 1\n' +
    userSource +
    `\n#line ${WRAPPER_MAIN_LINE}\n` +
    'void main() {\n' +
    '  vec4 svColor = vec4(0.0, 0.0, 0.0, 1.0);\n' +
    `  mainImage(${args});\n` +
    '  svFragColor = vec4(svColor.rgb, 1.0);\n' +
    '}\n'
  );
}
