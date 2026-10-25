// Cockpit geometry and layout, in "wall units": arc length along the sphere
// wall, measured from the point straight ahead of the camera. Tuned by eye
// with the dev panel (src/dev/tuning.ts) and then written here.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutConfig {
  /** Sphere radius. Larger is flatter. */
  radius: number;
  /** Camera distance from the wall. */
  eyeDistance: number;
  /** Half extents (wall units) the camera keeps in view. */
  fitHalfWidth: number;
  fitHalfHeight: number;
  portal: { x: number; y: number; size: number };
  knobRing: { radius: number; size: number; startDeg: number };
  code: Rect;
  status: Rect;
  library: Rect;
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  radius: 22,
  eyeDistance: 6,
  fitHalfWidth: 7.45,
  fitHalfHeight: 4.15,
  portal: { x: 1.45, y: 0.15, size: 4.1 },
  knobRing: { radius: 2.78, size: 0.98, startDeg: 90 },
  code: { x: -4.55, y: 0, w: 5.5, h: 8.1 },
  status: { x: 6.0, y: 2.05, w: 2.5, h: 3.9 },
  library: { x: 6.0, y: -2.05, w: 2.5, h: 3.9 },
};

export const layout: LayoutConfig = structuredClone(DEFAULT_LAYOUT);

/** Wall coordinates of knob slot `i` of `count`, clockwise from the top. */
export function knobSlotPosition(cfg: LayoutConfig, i: number, count: number): { x: number; y: number } {
  const a = ((cfg.knobRing.startDeg - (360 / count) * i) * Math.PI) / 180;
  return {
    x: cfg.portal.x + Math.cos(a) * cfg.knobRing.radius,
    y: cfg.portal.y + Math.sin(a) * cfg.knobRing.radius,
  };
}
