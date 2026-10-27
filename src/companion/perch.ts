// Where the companion may sit: keep-out zones on screen and the choice of
// perch. Pure screen-space geometry (pixels, y down), testable without WebGL.

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Everything the companion must not cover, in screen pixels. */
export interface KeepOut {
  circles: Circle[];
  boxes: Box[];
}

export type Edge = 'left' | 'right' | 'top' | 'bottom';

export interface PerchChoice {
  x: number;
  y: number;
  /** Index of the chosen candidate, or -1 when it fell back to an edge. */
  index: number;
  /** The edge it peeks in from, when no candidate was clear. */
  edge?: Edge;
}

/** True if circle `c`, grown by `margin`, misses every zone and stays on screen. */
export function isClear(
  c: Circle,
  zones: KeepOut,
  width: number,
  height: number,
  margin: number,
): boolean {
  const r = c.r + margin;
  if (c.x - r < 0 || c.y - r < 0 || c.x + r > width || c.y + r > height) return false;
  for (const z of zones.circles) if (Math.hypot(c.x - z.x, c.y - z.y) < r + z.r) return false;
  for (const b of zones.boxes) {
    const dx = Math.max(b.left - c.x, 0, c.x - b.right);
    const dy = Math.max(b.top - c.y, 0, c.y - b.bottom);
    if (Math.hypot(dx, dy) < r) return false;
  }
  return true;
}

/**
 * The first candidate that is clear. If none is, the nearest screen edge to
 * the first candidate, with the body mostly behind it and the eye (its
 * center) just inside.
 */
export function choosePerch(
  candidates: Circle[],
  zones: KeepOut,
  width: number,
  height: number,
  margin: number,
): PerchChoice {
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    if (isClear(c, zones, width, height, margin)) return { x: c.x, y: c.y, index: i };
  }
  const c = candidates[0] ?? { x: width / 2, y: 0, r: 0 };
  const dist: [Edge, number][] = [
    ['left', c.x],
    ['right', width - c.x],
    ['top', c.y],
    ['bottom', height - c.y],
  ];
  const edge = dist.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  const inset = c.r * 0.3;
  const x = Math.min(width - inset, Math.max(inset, c.x));
  const y = Math.min(height - inset, Math.max(inset, c.y));
  switch (edge) {
    case 'left':
      return { x: inset, y, index: -1, edge };
    case 'right':
      return { x: width - inset, y, index: -1, edge };
    case 'top':
      return { x, y: inset, index: -1, edge };
    case 'bottom':
      return { x, y: height - inset, index: -1, edge };
  }
}
