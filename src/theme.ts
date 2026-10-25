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
  // Syntax
  keyword: '#c792ea',
  type: '#7fb4ff',
  builtin: '#56d4c4',
  number: '#f78c6c',
  comment: '#4b5d6b',
  preprocessor: '#e0a96d',
  punct: '#8ea2b2',
  ident: '#d3dde5',
};

/** One tint per knob slot, shared by the knob and its parameter in the code. */
export const KNOB_TINTS = ['#ff7a45', '#4fd1ff', '#b8f35a', '#ff5ec4', '#ffd84f', '#9d8cff', '#3ee6b5', '#ff9a8c'];

export const MONO = '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
export const SANS = '"Inter", "SF Pro Text", system-ui, -apple-system, "Segoe UI", sans-serif';
