// The hanging rig (docs/hanging-rig.md): pieces hung in cockpit space between
// the camera and the portal. Rig coordinates are relative to the sitting-back
// eye: x right, y up, z forward. Pure math, so it can be unit tested.

import * as THREE from 'three';
import type { LayoutConfig, MonitorLayout } from './layout';

/** World position of rig point (x, y, z). The camera looks down world +z with its right on world -x. */
export function rigToWorld(cfg: LayoutConfig, x: number, y: number, z: number, out = new THREE.Vector3()) {
  return out.set(-x, y, cfg.radius - cfg.eyeDistance + z);
}

/** The sitting-back eye, in world space. */
export function eyeWorld(cfg: LayoutConfig, out = new THREE.Vector3()) {
  return rigToWorld(cfg, 0, 0, 0, out);
}

export interface Frame {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** World units per panel unit. */
  scale: number;
}

const DEG = Math.PI / 180;
const m4 = new THREE.Matrix4();
const up = new THREE.Vector3(0, 1, 0);
const tilt = new THREE.Quaternion();
const flat = new THREE.Quaternion();
const back = new THREE.Vector3();
const euler = new THREE.Euler();

/**
 * A monitor's frame: centered at its hang point and facing the viewer (local
 * +z toward them), partway between square to the eye and square to the view
 * (cfg.monitorFacing), then turned by its posed yaw, pitch and roll, so no
 * two hang quite square to the seat.
 */
export function monitorFrame(cfg: LayoutConfig, m: MonitorLayout): Frame {
  const position = rigToWorld(cfg, m.at[0], m.at[1], m.at[2]);
  const eye = eyeWorld(cfg);
  // Matrix4.lookAt points local +z from the target to the eye.
  m4.lookAt(eye, position, up);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(m4);
  // Square to the view: local +z straight back toward the seat.
  back.copy(position).z -= 1;
  m4.lookAt(back, position, up);
  quaternion.slerp(flat.setFromRotationMatrix(m4), cfg.monitorFacing);
  // Positive yaw turns the screen's right edge away from the viewer, positive
  // pitch tips its top toward them, positive roll turns it counterclockwise.
  euler.set(m.pitch * DEG, m.yaw * DEG, m.roll * DEG, 'YXZ');
  quaternion.multiply(tilt.setFromEuler(euler));
  return { position, quaternion, scale: m.scale };
}

/** World corners of a monitor's outline (screen plus bezel), clockwise from top left. */
export function monitorCorners(cfg: LayoutConfig, m: MonitorLayout): THREE.Vector3[] {
  const f = monitorFrame(cfg, m);
  const hw = (m.w / 2) * f.scale;
  const hh = (m.h / 2) * f.scale;
  return [
    [-hw, hh],
    [hw, hh],
    [hw, -hh],
    [-hw, -hh],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0).applyQuaternion(f.quaternion).add(f.position));
}

/** World center of a monitor. */
export function monitorCenter(cfg: LayoutConfig, m: MonitorLayout, out = new THREE.Vector3()) {
  return rigToWorld(cfg, m.at[0], m.at[1], m.at[2], out);
}
