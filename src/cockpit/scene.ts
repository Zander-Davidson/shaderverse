// The sphere interior (liquid chrome), the fixed camera, and lighting.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { GoopShell } from '../style/goop';
import { LOW_GFX } from '../style/quality';
import { wallToWorld } from '../panels/patch';
import { bezelRadius, knobSlotPosition, type LayoutConfig } from './layout';
import { KNOB_SLOTS } from '../project/schema';

/** Seconds for the lean in and out. */
export const LEAN_IN_S = 0.85;
export const LEAN_OUT_S = 0.7;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** A camera pose: where the eye is and what it looks at. */
interface Pose {
  eye: THREE.Vector3;
  target: THREE.Vector3;
}

export class Cockpit {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 500);
  /** Dark backdrop beyond the chrome, in case any edge of the dome shows. */
  private shell: THREE.Mesh;
  private readonly goop: GoopShell | null;
  private readonly key: THREE.PointLight;
  private readonly rim: THREE.PointLight;
  /** Long strip lights whose reflections sweep across the curved dome. */
  private readonly stripTop: THREE.RectAreaLight;
  private readonly stripLow: THREE.RectAreaLight;
  private readonly base: Pose = { eye: new THREE.Vector3(), target: new THREE.Vector3() };
  private readonly leaned: Pose = { eye: new THREE.Vector3(), target: new THREE.Vector3() };
  /** Lean progress: 0 sitting back, 1 leaned in. */
  private lean = 0;
  private leanGoal = 0;

  constructor(private cfg: LayoutConfig) {
    // No scene.background: a color background forces a clear on every render
    // call, which would wipe the compositor's layered passes. The renderer's
    // clear color does the job instead.
    this.shell = new THREE.Mesh(
      new THREE.SphereGeometry(cfg.radius + 0.5, 48, 32),
      new THREE.MeshBasicMaterial({ color: '#0b1213', side: THREE.BackSide }),
    );
    // The goop and the backdrop are the farthest opaque objects, so they draw
    // last and the depth test skips the pixels panels already cover.
    this.goop = LOW_GFX ? null : new GoopShell(cfg);
    this.scene.add(this.shell);
    if (this.goop) this.scene.add(this.goop.mesh);

    RectAreaLightUniformsLib.init();
    this.stripTop = new THREE.RectAreaLight('#eaf8ff', 5, 14, 0.45);
    this.stripLow = new THREE.RectAreaLight('#3ff2c4', 2.5, 11, 0.3);
    if (!LOW_GFX) this.scene.add(this.stripTop, this.stripLow);

    // Reflections come mostly from the environment map; these lights add a
    // cool key from above and a teal rim from below for the chrome.
    this.scene.add(new THREE.HemisphereLight('#a8d4dc', '#081012', 0.35));
    this.key = new THREE.PointLight('#e6f6ff', 40, 0, 1.6);
    this.scene.add(this.key);
    this.rim = new THREE.PointLight('#3ff2c4', 18, 0, 1.6);
    this.scene.add(this.rim);
    this.relayout(cfg);
  }

  relayout(cfg: LayoutConfig) {
    this.cfg = cfg;
    this.shell.geometry.dispose();
    this.shell.geometry = new THREE.SphereGeometry(cfg.radius + 0.5, 48, 32);
    this.goop?.relayout(cfg);
    this.base.eye.set(0, 0, cfg.radius - cfg.eyeDistance);
    this.base.target.set(0, 0, cfg.radius);
    this.camera.up.set(0, 1, 0);
    this.applyPose();
    this.key.position.set(-2.5, 3.5, cfg.radius - cfg.eyeDistance + 0.5);
    this.rim.position.set(3, -3.5, cfg.radius - cfg.eyeDistance + 2);
    // Strips just above and below the eye, angled at the dome.
    const eyeZ = cfg.radius - cfg.eyeDistance;
    this.stripTop.position.set(0, 3.2, eyeZ + 0.8);
    this.stripTop.lookAt(0, 0.6, cfg.radius);
    this.stripLow.position.set(0, -3.4, eyeZ + 1.2);
    this.stripLow.lookAt(0, -0.8, cfg.radius);
    this.fit(this.camera.aspect);
  }

  /** Image-based lighting so chrome has something to reflect. */
  setEnvironment(renderer: THREE.WebGLRenderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;
    pmrem.dispose();
  }

  /** Chooses the field of view so the layout's fit rectangle stays in view. */
  fit(aspect: number) {
    const cfg = this.cfg;
    this.camera.aspect = aspect;
    // Fit from the sitting-back pose, whatever the current lean.
    this.camera.position.copy(this.base.eye);
    this.camera.lookAt(this.base.target);
    this.camera.updateMatrixWorld();
    const inv = this.camera.matrixWorldInverse;
    let tanV = 0;
    const p = new THREE.Vector3();
    for (const sx of [-1, -0.5, 0, 0.5, 1]) {
      for (const sy of [-1, -0.5, 0, 0.5, 1]) {
        wallToWorld(sx * cfg.fitHalfWidth, sy * cfg.fitHalfHeight, cfg.radius, 0, p).applyMatrix4(inv);
        const depth = -p.z;
        tanV = Math.max(tanV, Math.abs(p.y) / depth, Math.abs(p.x) / depth / aspect);
      }
    }
    this.camera.fov = (2 * Math.atan(tanV * 1.03) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    this.computeLeanPose(tanV * 1.03, aspect);
    this.applyPose();
  }

  /** Leaned in: straight on to the portal, close enough that it and the knob ring fill the view. */
  private computeLeanPose(tanHalfV: number, aspect: number) {
    const cfg = this.cfg;
    // Frame the portal's bezel and every knob slot.
    const b = bezelRadius(cfg);
    let x0 = cfg.portal.x - b;
    let x1 = cfg.portal.x + b;
    let y0 = cfg.portal.y - b;
    let y1 = cfg.portal.y + b;
    const h = cfg.knobRing.size / 2;
    for (let i = 0; i < KNOB_SLOTS; i++) {
      const p = knobSlotPosition(cfg, i, KNOB_SLOTS);
      x0 = Math.min(x0, p.x - h);
      x1 = Math.max(x1, p.x + h);
      y0 = Math.min(y0, p.y - h);
      y1 = Math.max(y1, p.y + h);
    }
    wallToWorld((x0 + x1) / 2, (y0 + y1) / 2, cfg.radius, 0, this.leaned.target);
    const ex = ((x1 - x0) / 2) * 1.08;
    const ey = ((y1 - y0) / 2) * 1.08;
    const dist = Math.max(ey / tanHalfV, ex / (tanHalfV * aspect));
    const outward = this.leaned.target.clone().normalize();
    this.leaned.eye.copy(this.leaned.target).addScaledVector(outward, -dist);
  }

  setLean(on: boolean) {
    this.leanGoal = on ? 1 : 0;
  }

  get leaning(): boolean {
    return this.lean !== this.leanGoal;
  }

  /** Advances the lean animation; returns true while the camera is moving. */
  update(dt: number): boolean {
    if (this.lean === this.leanGoal) return false;
    const dur = this.leanGoal > this.lean ? LEAN_IN_S : LEAN_OUT_S;
    const step = dt / dur;
    this.lean = this.leanGoal > this.lean ? Math.min(1, this.lean + step) : Math.max(0, this.lean - step);
    this.applyPose();
    return true;
  }

  private applyPose() {
    const p = easeInOutCubic(this.lean);
    const eye = this.camera.position.lerpVectors(this.base.eye, this.leaned.eye, p);
    const target = new THREE.Vector3().lerpVectors(this.base.target, this.leaned.target, p);
    // A body leaning in dips slightly mid-motion and settles; the gaze leads
    // the head a little, tipping down then back up.
    const arc = Math.sin(Math.PI * p);
    eye.y -= 0.22 * arc;
    target.y -= 0.35 * arc * (1 - p);
    this.camera.up.set(Math.sin(Math.PI * p) * 0.012, 1, 0).normalize();
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }
}
