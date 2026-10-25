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
  /** Gap between the portal's bezel and the right-hand panels that wrap it. */
  clearance: number;
  /** Corner radius of panel silhouettes, in wall units. */
  cornerRadius: number;
  /** Knobs sit on an arc around the portal's left side, top to bottom. */
  knobRing: { radius: number; size: number; startDeg: number; stepDeg: number };
  code: Rect;
  status: Rect;
  library: Rect;
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  radius: 22,
  eyeDistance: 6,
  fitHalfWidth: 7.45,
  fitHalfHeight: 4.15,
  portal: { x: 2.2, y: 0.15, size: 4.1 },
  clearance: 0.14,
  cornerRadius: 0.38,
  // Nearly touching: neighbors are ~0.93 apart for 0.9-wide knobs.
  knobRing: { radius: 2.9, size: 0.9, startDeg: 115, stepDeg: 18.5 },
  // Room between the source and the knobs for the knob tubing.
  code: { x: -4.85, y: 0, w: 4.9, h: 8.1 },
  status: { x: 5.6, y: 2.06, w: 3.3, h: 3.88 },
  library: { x: 5.6, y: -2.06, w: 3.3, h: 3.88 },
};

export const layout: LayoutConfig = structuredClone(DEFAULT_LAYOUT);

/** Outer radius of the portal's chrome bezel, in wall units. */
export const bezelRadius = (cfg: LayoutConfig) => (cfg.portal.size / 2) * 1.15 + 0.04;

/** Wall coordinates of knob slot `i`, down the arc on the portal's left. */
export function knobSlotPosition(cfg: LayoutConfig, i: number, _count: number): { x: number; y: number } {
  const a = ((cfg.knobRing.startDeg + cfg.knobRing.stepDeg * i) * Math.PI) / 180;
  return {
    x: cfg.portal.x + Math.cos(a) * cfg.knobRing.radius,
    y: cfg.portal.y + Math.sin(a) * cfg.knobRing.radius,
  };
}
