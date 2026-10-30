// The hanging control console's face, laid out in its own panel units:
// x right, y toward its far (top) edge, from its center. The top row holds
// the eight knob slots, each with a label strip and a bake bubble beneath
// it; below them one row of square backlit buttons, lamps, toggles and keys.
// A bay left of the knobs holds the knob edit display, one right of them the
// BAKE key and the bake all button (docs/control-board.md). Pure, so it can
// be tested and shared by the console, the camera and the companion.

import * as THREE from 'three';
import type { LayoutConfig } from '../cockpit/layout';
import { consolePose, monitorFrame } from '../cockpit/rig';
import { KNOB_SLOTS } from '../project/schema';

/** Distance between knob centers, and the size of each knob's face (dish and ring). */
export const KNOB_PITCH = 0.8;
export const KNOB_FACE = 0.76;
/** Height of the label strip under each knob. */
export const KNOB_STRIP = 0.44;
/** Knob centers, from the console's center. */
export const KNOB_Y = 0.74;
/** How far a knob's cap sits off the face, in panel units. */
export const KNOB_LIFT = 0.012;

/**
 * The middle of the knob row, right of the console's center: the left bay is
 * wider than the right one. Everything on the face below is laid out around
 * the row and shifted by this.
 */
export const ROW_X = 0.45;

/** Center of knob slot `i`, left to right. */
export function knobLocal(i: number): [number, number] {
  return [ROW_X + (i - (KNOB_SLOTS - 1) / 2) * KNOB_PITCH, KNOB_Y];
}

/** Where each knob's bake bubble sits: under its label strip, above the captions. */
export const BUBBLE_Y = -0.19;
/** Radius of a knob's bake bubble, and of the button under it. */
export const BUBBLE_R = 0.085;

/** The knob edit display's glass, recessed into the left bay: center and size. */
export const EDIT_DISPLAY = { x: ROW_X - 4.47, y: 0.16, w: 1.78, h: 1.92 };

/** The right bay: the BAKE key level with the controls, the bake all button over it. */
export const BAKE_KEY = { x: ROW_X + 3.98, y: -0.68, r: 0.2 };
export const BAKE_ALL = { x: ROW_X + 3.98, y: KNOB_Y - 0.02, r: 0.25 };

/** What a console control does when pressed; decorative ones only animate. */
export type ControlAction = 'play' | 'restart' | 'quality:low' | 'quality:medium' | 'quality:high' | null;

export interface Control {
  id: string;
  kind: 'button' | 'key' | 'toggle' | 'lamp';
  /** Center and size, in panel units. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Engraved beneath it on the face; empty for none. */
  legend: string;
  action: ControlAction;
}

/** Row centers of the lower section: the controls, and the legends under them. */
export const BUTTON_Y = -0.68;
export const LEGEND_Y = -1.08;
/** Where the section captions sit, between the bake bubbles and the controls. */
export const CAPTION_Y = -0.38;

/** Section captions over groups of controls: text, left edge and right end of its rule. */
export const SECTIONS: { text: string; x: number; end: number }[] = [
  { text: 'TRANSPORT', x: -3.3, end: -2.2 },
  { text: 'QUALITY', x: -1.98, end: -0.42 },
  { text: 'SYS', x: -0.25, end: 1.1 },
  { text: 'AUX', x: 1.22, end: 3.3 },
].map((s) => ({ ...s, x: s.x + ROW_X, end: s.end + ROW_X }));

export function consoleControls(): Control[] {
  const b = (id: string, x: number, legend: string, action: ControlAction): Control => ({ id, kind: 'button', x, y: BUTTON_Y, w: 0.46, h: 0.46, legend, action });
  // Laid out around the knob row's middle, then shifted with it.
  const controls: Control[] = [
    b('play', -3.05, 'PLAY', 'play'),
    b('restart', -2.48, 'RESTART', 'restart'),
    b('q-low', -1.75, 'LOW', 'quality:low'),
    b('q-medium', -1.21, 'MED', 'quality:medium'),
    b('q-high', -0.67, 'HIGH', 'quality:high'),
    { id: 'lamp-compile', kind: 'lamp', x: -0.06, y: BUTTON_Y, w: 0.2, h: 0.2, legend: 'CMP', action: null },
    { id: 'lamp-run', kind: 'lamp', x: 0.3, y: BUTTON_Y, w: 0.2, h: 0.2, legend: 'RUN', action: null },
    { id: 'toggle-1', kind: 'toggle', x: 0.66, y: BUTTON_Y, w: 0.18, h: 0.4, legend: 'T1', action: null },
    { id: 'toggle-2', kind: 'toggle', x: 0.95, y: BUTTON_Y, w: 0.18, h: 0.4, legend: 'T2', action: null },
  ];
  // A short bank of narrow keys at the right end, one set apart.
  for (let i = 0; i < 7; i++) {
    controls.push({ id: `key-${i}`, kind: 'key', x: 1.4 + i * 0.29 + (i > 4 ? 0.06 : 0), y: BUTTON_Y, w: 0.25, h: 0.44, legend: '', action: null });
  }
  for (const c of controls) c.x += ROW_X;
  return controls;
}

/** World position of a point on the console's face: panel units, `lift` off the face. */
export function consolePoint(cfg: LayoutConfig, x: number, y: number, lift = 0, out = new THREE.Vector3(), rise = 0): THREE.Vector3 {
  const f = monitorFrame(cfg, consolePose(cfg, rise));
  return out.set(x, y, lift).multiplyScalar(f.scale).applyQuaternion(f.quaternion).add(f.position);
}

/** World position of knob slot `i`'s cap. */
export function knobWorld(cfg: LayoutConfig, i: number, out = new THREE.Vector3(), rise = 0): THREE.Vector3 {
  const [x, y] = knobLocal(i);
  return consolePoint(cfg, x, y, KNOB_LIFT, out, rise);
}

/** World radius of a knob's face. */
export const knobWorldRadius = (cfg: LayoutConfig) => (KNOB_FACE / 2) * cfg.console.scale;
