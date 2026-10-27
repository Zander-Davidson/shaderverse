// Cockpit geometry and layout. The portal and knobs are placed in "wall
// units": arc length along the sphere wall, measured from the point straight
// ahead of the camera. The monitors hang in rig space instead (src/cockpit/rig.ts).
// Tuned by eye with the dev panel (src/dev/tuning.ts) and then written here.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A monitor hung on the rig. Its panel size, in panel units, sets the
 * texture's resolution and aspect; `scale` turns panel units into world units.
 */
export interface MonitorLayout {
  w: number;
  h: number;
  /** Center of the screen in rig space: eye-relative, x right, y up, z forward. */
  at: [number, number, number];
  scale: number;
  /** Posed turn beyond facing the eye, in degrees (see monitorFrame). */
  yaw: number;
  pitch: number;
  roll: number;
}

export interface LayoutConfig {
  /** Sphere radius. Larger is flatter. */
  radius: number;
  /** Camera distance from the wall. */
  eyeDistance: number;
  /** Half extents (wall units) the camera keeps in view, as well as every monitor. */
  fitHalfWidth: number;
  fitHalfHeight: number;
  portal: { x: number; y: number; size: number };
  /** Corner radius of panel silhouettes, in panel units. */
  cornerRadius: number;
  /** Knobs sit in a row below the portal, left to right: `y` below its center, `spacing` apart. */
  knobRow: { y: number; size: number; spacing: number };
  /** Function plot, above the code. */
  plot: MonitorLayout;
  code: MonitorLayout;
  status: MonitorLayout;
  library: MonitorLayout;
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
  radius: 36,
  eyeDistance: 10,
  fitHalfWidth: 5.5,
  fitHalfHeight: 5.6,
  portal: { x: 0, y: 0.3, size: 6.8 },
  cornerRadius: 0.38,
  knobRow: { y: -5.0, size: 1.05, spacing: 1.1 },
  // Source and plot on the left, readouts on the right, close to the camera
  // and framing the portal. Each is posed a little differently, as if the
  // pilot swung it into place.
  plot: { w: 4.9, h: 2.6, at: [-3.35, 1.45, 4.0], scale: 0.55, yaw: -4, pitch: 3, roll: 1.5 },
  code: { w: 4.9, h: 5.4, at: [-3.3, -0.95, 3.8], scale: 0.55, yaw: 3, pitch: 0, roll: -0.8 },
  status: { w: 3.3, h: 3.88, at: [3.0, 1.15, 3.9], scale: 0.55, yaw: -2, pitch: 2, roll: -1.2 },
  library: { w: 3.3, h: 3.88, at: [3.05, -1.2, 3.7], scale: 0.55, yaw: -5, pitch: -2, roll: 0.7 },
  companion: {
    size: 1.1,
    standoff: 0.3,
    margin: 0.12,
    perches: {
      // Overhead, beside the top of the portal; else under the knob row.
      neutral: [{ x: 3.5, y: 5.0 }, { x: -2.5, y: 5.0 }, { x: 2.0, y: -6.5 }],
      // Turned to a side: over the portal, else low on the far side.
      left: [{ x: -2.0, y: 6.0 }, { x: 2.0, y: 6.0 }, { x: 4.5, y: -2.5 }],
      right: [{ x: 2.0, y: 6.0 }, { x: -2.0, y: 6.0 }, { x: -4.0, y: -2.5 }],
      // Leaned in: beside the bezel, left or right of the portal.
      lean: [{ x: 6.0, y: 1.0 }, { x: -6.0, y: 1.0 }, { x: 6.0, y: -3.0 }],
    },
  },
};

export const layout: LayoutConfig = structuredClone(DEFAULT_LAYOUT);

/** Outer radius of the portal's chrome bezel, in wall units. */
export const bezelRadius = (cfg: LayoutConfig) => (cfg.portal.size / 2) * 1.15 + 0.04;

/** Wall coordinates of knob slot `i` of `count`, left to right in the row below the portal. */
export function knobSlotPosition(cfg: LayoutConfig, i: number, count: number): { x: number; y: number } {
  return {
    x: cfg.portal.x + (i - (count - 1) / 2) * cfg.knobRow.spacing,
    y: cfg.portal.y + cfg.knobRow.y,
  };
}
