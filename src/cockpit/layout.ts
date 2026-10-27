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
 * A piece hung on the rig. Its panel size, in panel units, sets the texture's
 * resolution and aspect; `scale` turns panel units into world units.
 */
export interface HungLayout {
  w: number;
  h: number;
  /** Center of its face in rig space: eye-relative, x right, y up, z forward. */
  at: [number, number, number];
  scale: number;
  /** Posed turn beyond facing the eye, in degrees (see monitorFrame). */
  yaw: number;
  pitch: number;
  roll: number;
}

/** An arm: where its carriage sits along the rail (rig x), and its elbow in rig space. */
export interface ArmLayout {
  mount: number;
  elbow: [number, number, number];
}

export interface MonitorLayout extends HungLayout {
  arm: ArmLayout;
}

/**
 * The hanging control console: a tray of knobs, buttons and keys below the
 * portal. Its arms meet its back at `attach` (panel units, from its center).
 */
export interface ConsoleLayout extends HungLayout {
  arms: (ArmLayout & { attach: [number, number] })[];
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
  /**
   * How square the monitors hang to the view: 0 faces each one at the eye
   * (the wide lens then stretches them like walls running toward the portal),
   * 1 hangs them flat, parallel to the screen.
   */
  monitorFacing: number;
  /** The overhead rail the arms hang from: height, depth at its middle, half length, and how far its ends curve toward the viewer. */
  rail: { y: number; z: number; halfWidth: number; bow: number };
  /** Corner radius of panel silhouettes, in panel units. */
  cornerRadius: number;

  /** Function plot, above the code. */
  plot: MonitorLayout;
  code: MonitorLayout;
  status: MonitorLayout;
  library: MonitorLayout;
  console: ConsoleLayout;
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
  monitorFacing: 0.55,
  rail: { y: 3.9, z: 5.6, halfWidth: 5.6, bow: 1.0 },
  cornerRadius: 0.38,
  // Source and plot on the left, readouts on the right, close to the camera
  // and framing the portal. Each is posed a little differently, as if the
  // pilot swung it into place. The lower monitors' arms reach up behind the
  // upper ones; no two elbows bend the same way.
  plot: {
    w: 4.9, h: 2.6, at: [-3.35, 1.45, 4.0], scale: 0.55, yaw: -4, pitch: 3, roll: 1.5,
    arm: { mount: -0.9, elbow: [-1.8, 2.65, 5.35] },
  },
  code: {
    w: 4.9, h: 5.4, at: [-3.3, -0.95, 3.8], scale: 0.55, yaw: 3, pitch: 0, roll: -0.8,
    arm: { mount: -4.4, elbow: [-4.95, 0.55, 5.6] },
  },
  status: {
    w: 4.0, h: 3.88, at: [3.15, 1.15, 3.9], scale: 0.55, yaw: -2, pitch: 2, roll: -1.2,
    arm: { mount: 2.4, elbow: [4.25, 2.85, 5.15] },
  },
  library: {
    w: 4.0, h: 3.88, at: [3.2, -1.2, 3.7], scale: 0.55, yaw: -5, pitch: -2, roll: 0.7,
    arm: { mount: 4.7, elbow: [5.0, -0.25, 5.7] },
  },
  // Below the portal, between the monitor columns, tipped back like a
  // keyboard tray. Its arms drop behind the monitor columns, clear of the
  // portal, and reach in to its back edge.
  console: {
    w: 7.2, h: 2.7, at: [0.07, -1.76, 3.42], scale: 0.43, yaw: 1.5, pitch: -38, roll: 0.6,
    arms: [
      { mount: -3.2, elbow: [-2.8, -1.1, 5.3], attach: [-2.6, 0.7] },
      { mount: 3.35, elbow: [2.9, -1.35, 5.25], attach: [2.7, 0.6] },
    ],
  },
  companion: {
    size: 1.1,
    standoff: 0.3,
    margin: 0.12,
    perches: {
      // Overhead, beside the top of the portal; else under the knob row.
      neutral: [{ x: 3.5, y: 5.0 }, { x: -2.5, y: 5.0 }, { x: 2.0, y: -6.5 }],
      // On the turned-to side, up high: the turn leaves no room lower down
      // between the near monitors and the portal, and the plot's arm fills
      // the gap above it on the left.
      left: [{ x: -5.5, y: 6.0 }, { x: -6.5, y: 6.0 }],
      right: [{ x: 3.0, y: 5.5 }, { x: 3.5, y: 5.0 }],
      // Leaned in: beside the bezel, left or right of the portal.
      lean: [{ x: 6.0, y: 1.0 }, { x: -6.0, y: 1.0 }, { x: 6.0, y: -3.0 }],
    },
  },
};

export const layout: LayoutConfig = structuredClone(DEFAULT_LAYOUT);

/** Outer radius of the portal's chrome bezel, in wall units. */
export const bezelRadius = (cfg: LayoutConfig) => (cfg.portal.size / 2) * 1.15 + 0.04;
