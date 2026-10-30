// Shared palette for the cockpit, the code display and the overlays.

export const COLORS = {
  bg: '#05070a',
  panel: '#0a0f14',
  panelEdge: '#1c2a36',
  text: '#c9d6df',
  dim: '#5d7080',
  faint: '#2a3742',
  accent: '#4fd1ff',
  ok: '#5ee6a0',
  warn: '#ffc24f',
  error: '#ff5a5f',
  // Syntax: muted, so what can be interacted with stands out. None of these
  // hues are teal or amber, which belong to the glows below.
  keyword: '#a08cbb',
  type: '#7d8fae',
  builtin: '#8e9ba7',
  number: '#b3907f',
  comment: '#46535d',
  preprocessor: '#a3927f',
  punct: '#6e7f8c',
  ident: '#b8c2ca',
  // Interactive source: numbers that can become knobs (and knob parameters)
  // glow in the knob teal; functions that can be plotted glow amber.
  knobGlow: '#3ff2c4',
  plotGlow: '#ffcc4d',
};

/** The knobs' tint, shared by every knob, its tube and its parameter in the code. */
export const KNOB_TINT = COLORS.knobGlow;

/**
 * What a knob, its parameter and the console's bake hardware turn while it
 * is being edited or baked: warn yellow, which already means caution.
 */
export const KNOB_EDIT_TINT = COLORS.warn;

export const MONO = '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
export const SANS = '"Inter", "SF Pro Text", system-ui, -apple-system, "Segoe UI", sans-serif';
