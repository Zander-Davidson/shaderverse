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
  /** Leaned in, it rises to meet the viewer: its hang point and pitch then. */
  lean: { at: [number, number, number]; pitch: number };
}

export interface LayoutConfig {
  /** Sphere radius. Larger is flatter. */
  radius: number;
  /** Camera distance from the wall. */
  eyeDistance: number;
  /** Half extents (wall units) the camera keeps in view, as well as every monitor. */
  fitHalfWidth: number;
  fitHalfHeight: number;
  /**
   * The focal circle of the view out the window: where the shader's center
   * shows, what leaning in frames and what the companion keeps clear of.
   */
  portal: { x: number; y: number; size: number };
  /**
   * The cockpit window, in wall units: a windscreen wider at its sill than at
   * its head, divided by struts that lean toward an apex above the view.
   */
  window: {
    sill: number;
    head: number;
    /** Left and right edges at the sill, and at the head. */
    sillX: [number, number];
    headX: [number, number];
    /** Where the struts lean to. */
    apex: [number, number];
    /** Where the struts meet the sill, left to right. */
    struts: number[];
    /** Height of the cross strut over the outer panes. */
    transom: number;
  };
  /**
   * Leaning in: `reach` is how far of the way the head comes toward the
   * closest pose that still fits the bezel and knob row (1 = all the way);
   * `lift` tips the gaze up by that many degrees, so the console sinks
   * toward the bottom edge and more of the view shows above; `drop` is the
   * steepest descent tried per unit forward (0 glides straight ahead).
   */
  lean: { reach: number; lift: number; drop: number };
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
  portal: { x: 0, y: 0.8, size: 6.8 },
  window: {
    sill: -3.6,
    head: 6.1,
    sillX: [-12.6, 13.0],
    headX: [-9.6, 10.2],
    apex: [-1.4, 25],
    struts: [-9.6, -5.8, 5.6, 9.9],
    transom: 3.1,
  },
  // Leaning in glides straight ahead, most of the way, while the console
  // rises to follow.
  lean: { reach: 0.85, lift: 0, drop: 0 },
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
    w: 10.7, h: 2.7, at: [-0.09, -1.86, 3.42], scale: 0.33, yaw: 1.5, pitch: -38, roll: 0.6,
    arms: [
      { mount: -3.2, elbow: [-2.8, -1.1, 5.3], attach: [-2.15, 0.7] },
      { mount: 3.35, elbow: [2.9, -1.35, 5.25], attach: [3.15, 0.6] },
    ],
    lean: { at: [-0.09, -1.2, 4.0], pitch: -32 },
  },
  companion: {
    size: 1.1,
    standoff: 0.3,
    margin: 0.12,
    perches: {
      // Overhead, beside the top of the portal; else under the knob row.
      neutral: [{ x: 3.5, y: 5.0 }, { x: -2.5, y: 5.0 }, { x: 2.0, y: -6.5 }],
      // Low in the window between the turned-to monitors and the portal,
      // above the console; else up high on that side.
      left: [{ x: -2.4, y: -3.0 }, { x: -5.5, y: 6.0 }, { x: -6.5, y: 6.0 }],
      right: [{ x: 3.35, y: -2.8 }, { x: 3.5, y: 5.5 }, { x: -4.5, y: 3.5 }],
      // Leaned in: in the gap between the portal and the monitors either
      // side, which stay in view now that the whole console must.
      lean: [{ x: 4.5, y: 1.0 }, { x: -4.5, y: 1.0 }, { x: 4.5, y: -1.5 }],
    },
  },
};

export const layout: LayoutConfig = structuredClone(DEFAULT_LAYOUT);

/** Outer radius of the portal's chrome bezel, in wall units. */
export const bezelRadius = (cfg: LayoutConfig) => (cfg.portal.size / 2) * 1.15 + 0.04;
