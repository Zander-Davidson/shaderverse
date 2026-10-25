// The shader standard library: small named functions that shaders (the
// examples included) use instead of writing the same arithmetic inline, so
// every shape in a shader has a name you can look up. Hovering a name in the
// source plots its basic form.
//
// Library functions are GLSL that the wrapper adds ahead of the user's code;
// GLSL built-ins that shaders lean on are listed here too, for plotting only.

export interface StdFunction {
  name: string;
  /** The basic form as shown beside the plot, e.g. "f(x) = 1/x". */
  form: string;
  /** f(x) of the basic form; NaN or ±Infinity leave gaps. */
  f: (x: number) => number;
  /** Plot window: half the x range, and the point at the window's center. */
  span: number;
  cx?: number;
  cy?: number;
  /** For library functions: the expression in `x` each overload returns. */
  glsl?: string;
}

const GEN_TYPES = ['float', 'vec2', 'vec3', 'vec4'];

const fract = (x: number) => x - Math.floor(x);
const PI = Math.PI;

/** Defined by the app; available in every shader. */
export const LIBRARY: StdFunction[] = [
  { name: 'reciprocal', form: 'f(x) = 1/x', f: (x) => 1 / x, span: 4, glsl: '1.0 / x' },
  { name: 'square', form: 'f(x) = x²', f: (x) => x * x, span: 3, cy: 1.5, glsl: 'x * x' },
  { name: 'gaussian', form: 'f(x) = e^(−x²)', f: (x) => Math.exp(-x * x), span: 3, cy: 0.5, glsl: 'exp(-x * x)' },
  { name: 'sigmoid', form: 'f(x) = 1 / (1 + e^(−x))', f: (x) => 1 / (1 + Math.exp(-x)), span: 6, cy: 0.5, glsl: '1.0 / (1.0 + exp(-x))' },
  { name: 'wave', form: 'f(x) = ½ + ½·cos(x)', f: (x) => 0.5 + 0.5 * Math.cos(x), span: 2 * PI, cy: 0.5, glsl: '0.5 + 0.5 * cos(x)' },
  { name: 'triangle', form: 'f(x) = |2·fract(x) − 1|', f: (x) => Math.abs(2 * fract(x) - 1), span: 3, cy: 0.5, glsl: 'abs(2.0 * fract(x) - 1.0)' },
  { name: 'tonemap', form: 'f(x) = 1 − e^(−x)', f: (x) => 1 - Math.exp(-x), span: 4, cy: 0.5, cx: 2, glsl: '1.0 - exp(-x)' },
];

/** GLSL built-ins, plotted in their basic one-variable form. */
export const BUILTIN_PLOTS: StdFunction[] = [
  { name: 'sin', form: 'f(x) = sin(x)', f: Math.sin, span: 2 * PI },
  { name: 'cos', form: 'f(x) = cos(x)', f: Math.cos, span: 2 * PI },
  { name: 'tan', form: 'f(x) = tan(x)', f: Math.tan, span: 2 * PI },
  { name: 'atan', form: 'f(x) = arctan(x)', f: Math.atan, span: 6 },
  { name: 'tanh', form: 'f(x) = tanh(x)', f: Math.tanh, span: 4 },
  { name: 'abs', form: 'f(x) = |x|', f: Math.abs, span: 3, cy: 1 },
  { name: 'sign', form: 'f(x) = sign(x)', f: (x) => (x === 0 ? 0 : Math.sign(x)), span: 3 },
  { name: 'floor', form: 'f(x) = ⌊x⌋', f: Math.floor, span: 4 },
  { name: 'ceil', form: 'f(x) = ⌈x⌉', f: Math.ceil, span: 4 },
  { name: 'fract', form: 'f(x) = x − ⌊x⌋', f: fract, span: 3, cy: 0.5 },
  { name: 'exp', form: 'f(x) = eˣ', f: Math.exp, span: 3, cy: 2 },
  { name: 'log', form: 'f(x) = ln(x)', f: Math.log, span: 4, cx: 2 },
  { name: 'sqrt', form: 'f(x) = √x', f: Math.sqrt, span: 4, cx: 2, cy: 1 },
  { name: 'inversesqrt', form: 'f(x) = 1/√x', f: (x) => 1 / Math.sqrt(x), span: 4, cx: 2, cy: 1 },
  { name: 'pow', form: 'f(x) = xⁿ  (n = 3 shown)', f: (x) => x ** 3, span: 3 },
  { name: 'length', form: 'f(x) = |x|', f: Math.abs, span: 3, cy: 1 },
  { name: 'step', form: 'f(x) = 0 if x < 0, else 1', f: (x) => (x < 0 ? 0 : 1), span: 3, cy: 0.5 },
  { name: 'smoothstep', form: 'f(x) = 3x² − 2x³ on [0, 1]', f: (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); }, span: 2, cx: 0.5, cy: 0.5 },
  { name: 'clamp', form: 'f(x) = clamp(x, 0, 1)', f: (x) => Math.min(1, Math.max(0, x)), span: 3, cy: 0.5 },
  { name: 'mod', form: 'f(x) = x mod 1', f: fract, span: 3, cy: 0.5 },
];

export const LIBRARY_NAMES = LIBRARY.map((fn) => fn.name);

const BY_NAME = new Map([...BUILTIN_PLOTS, ...LIBRARY].map((fn) => [fn.name, fn]));

/** The plottable function called `name`, if there is one. */
export function stdFunction(name: string): StdFunction | undefined {
  return BY_NAME.get(name);
}

/** GLSL for one library function: an overload for each float and vector type. */
export function libraryGlsl(fn: StdFunction): string {
  return GEN_TYPES.map((t) => `${t} ${fn.name}(${t} x) { return ${fn.glsl}; }\n`).join('');
}

/**
 * The library functions `source` calls, as GLSL to place ahead of it. A name
 * the source declares itself (a function, variable or macro) is left out, so
 * pasted shaders that bring their own `square` still compile.
 */
export function preludeFor(source: string): string {
  return LIBRARY.filter((fn) => {
    if (!new RegExp(`\\b${fn.name}\\s*\\(`).test(source)) return false;
    const declared = new RegExp(`(\\b(?:float|int|uint|bool|[iub]?vec[234]|mat[234])\\s+|#define\\s+)${fn.name}\\b`);
    return !declared.test(source);
  })
    .map(libraryGlsl)
    .join('');
}
