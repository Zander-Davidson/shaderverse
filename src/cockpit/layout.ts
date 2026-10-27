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
  /** Function plot, above the code. */
  plot: Rect;
  code: Rect;
  status: Rect;
  library: Rect;
  companion: CompanionLayout;
}

/** A spot on the wall the companion floats in front of, in wall units. */
export interface Perch {
  x: number;
  y: number;
}

/** The companion (docs/companion.md): its size, float and perches. */
export interface CompanionLayout {
  /** Apparent width, as wall units straight ahead sitting back; the same on screen in every view. */
  size: number;
  /** How far it floats off the wall: the fraction of the way to the eye. */
  standoff: number;
  /** Clearance kept from panels, knobs and overlays, in wall units. */
  margin: number;
  /** Candidate perches for each camera view, best first. */
  perches: { neutral: Perch[]; left: Perch[]; right: Perch[]; lean: Perch[] };
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
  plot: { x: -4.85, y: 2.75, w: 4.9, h: 2.6 },
  code: { x: -4.85, y: -1.35, w: 4.9, h: 5.4 },
  status: { x: 5.6, y: 2.06, w: 3.3, h: 3.88 },
  library: { x: 5.6, y: -2.06, w: 3.3, h: 3.88 },
  companion: {
    size: 1.1,
    standoff: 0.3,
    margin: 0.12,
    perches: {
      // Overhead, between the knob arc and the readouts; else the low crook
      // between the code and the bottom of the arc.
      neutral: [{ x: 2.5, y: 3.8 }, { x: -0.5, y: -3.7 }, { x: -1.0, y: 3.9 }],
      // On the turned-to side of the portal: between the source and the
      // knob arc, or between the portal and the library, low where the
      // tubing and bezel leave room; else up beside the plot or the status.
      left: [{ x: -1.6, y: -3.1 }, { x: -1.75, y: 3.05 }],
      right: [{ x: 3.1, y: -2.9 }, { x: 3.1, y: 3.05 }],
      // Leaned in there is little room (it squeezes smaller to fit): the
      // nooks beside the bezel's top and bottom right, and beyond the top of
      // the knob arc.
      lean: [{ x: 3.3, y: 2.8 }, { x: -1.8, y: 2.3 }, { x: 3.4, y: -2.4 }],
    },
  },
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
