// Builds the complete GLSL ES 3.00 fragment shader around the user's source.
// The user never sees this; `#line 1` keeps error line numbers on their code.

import { preludeFor } from './stdlib';

export const KNOB_UNIFORM_PREFIX = 'svKnob_';

/**
 * How much more of the shader's plane the portal shows than its resolution
 * covers, about the center: above 1, the image draws smaller and the edges
 * show what lies beyond them. The lean-in raises it so the scene beyond the
 * portal keeps its size, like the view out a window as you come up to it.
 */
export const VIEW_ZOOM_UNIFORM = 'svViewZoom';

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
  const args = ['svColor', 'svCoord', ...params.map((p) => knobUniformName(p.name))].join(', ');
  return (
    '#version 300 es\n' +
    'precision highp float;\n' +
    'precision highp int;\n' +
    STANDARD_UNIFORMS +
    knobUniforms +
    `uniform float ${VIEW_ZOOM_UNIFORM};\n` +
    'out vec4 svFragColor;\n' +
    preludeFor(userSource) +
    '#line 1\n' +
    userSource +
    `\n#line ${WRAPPER_MAIN_LINE}\n` +
    'void main() {\n' +
    '  vec4 svColor = vec4(0.0, 0.0, 0.0, 1.0);\n' +
    `  vec2 svCoord = (gl_FragCoord.xy - iResolution.xy * 0.5) * ${VIEW_ZOOM_UNIFORM} + iResolution.xy * 0.5;\n` +
    `  mainImage(${args});\n` +
    '  svFragColor = vec4(svColor.rgb, 1.0);\n' +
    '}\n'
  );
}
