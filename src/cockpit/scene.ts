// The sphere interior (liquid chrome), the fixed camera, and lighting.

import * as THREE from 'three';
import { ChromeConsole } from '../style/console';
import { cockpitEnvironment } from './environment';
import { LOW_GFX } from '../style/quality';
import { wallToWorld } from '../panels/patch';
import { bezelRadius, knobSlotPosition, type LayoutConfig } from './layout';
import { KNOB_SLOTS } from '../project/schema';

/** Seconds for the lean in and out. */
export const LEAN_IN_S = 0.85;
export const LEAN_OUT_S = 0.7;
/** Seconds to turn toward a side's panels, or back. */
export const FOCUS_S = 0.4;
/** Field of view narrows by this fraction when turned to a side. */
const FOCUS_ZOOM = 0.08;

/** Which side's panels the head turns toward: the source side or the readouts. */
export type FocusSide = 'left' | 'right' | null;

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
  /** The molded chrome console everything is set into. */
  readonly console: ChromeConsole;
  private readonly key: THREE.PointLight;
  private readonly rim: THREE.PointLight;
  private readonly base: Pose = { eye: new THREE.Vector3(), target: new THREE.Vector3() };
  private readonly leaned: Pose = { eye: new THREE.Vector3(), target: new THREE.Vector3() };
  /** Lean progress: 0 sitting back, 1 leaned in. */
  private lean = 0;
  private leanGoal = 0;
  /** Turned toward each side's panels: progress and goal, 0 to 1. */
  private readonly sides = {
    left: { pose: { eye: new THREE.Vector3(), target: new THREE.Vector3() } as Pose, dir: -1, at: 0, goal: 0 },
    right: { pose: { eye: new THREE.Vector3(), target: new THREE.Vector3() } as Pose, dir: 1, at: 0, goal: 0 },
  };
  /** Screen x (-1 to 1, sitting back) past which the pointer is over a side. */
  private leftEdge = -0.5;
  private rightEdge = 0.5;
  /** Field of view sitting back, from fit(). */
  private baseFov = 60;

  constructor(private cfg: LayoutConfig) {
    // No scene.background: a color background forces a clear on every render
    // call, which would wipe the compositor's layered passes. The renderer's
    // clear color does the job instead.
    this.shell = new THREE.Mesh(
      new THREE.SphereGeometry(cfg.radius + 0.5, 48, 32),
      new THREE.MeshBasicMaterial({ color: '#0b1213', side: THREE.BackSide }),
    );
    // The console and the backdrop are the farthest opaque objects, so they
    // draw last and the depth test skips the pixels panels already cover.
    // Low quality bakes a coarser field onto a coarser mesh.
    this.console = LOW_GFX ? new ChromeConsole(0.02, 0.06) : new ChromeConsole(0.008, 0.025);
    this.scene.add(this.shell, this.console.group);

    // Reflections come almost entirely from the environment map; these add
    // a soft warm key from above and a teal rim from below for the chrome.
    this.scene.add(new THREE.HemisphereLight('#d8b48c', '#0a0806', 0.2));
    this.key = new THREE.PointLight('#ffcf9e', 18, 0, 1.6);
    this.scene.add(this.key);
    this.rim = new THREE.PointLight('#3ff2c4', 10, 0, 1.6);
    this.scene.add(this.rim);
    this.relayout(cfg);
  }

  relayout(cfg: LayoutConfig) {
    this.cfg = cfg;
    this.shell.geometry.dispose();
    this.shell.geometry = new THREE.SphereGeometry(cfg.radius + 0.5, 48, 32);
    this.base.eye.set(0, 0, cfg.radius - cfg.eyeDistance);
    this.base.target.set(0, 0, cfg.radius);
    this.camera.up.set(0, 1, 0);
    this.applyPose();
    this.key.position.set(-2.5, 3.5, cfg.radius - cfg.eyeDistance + 0.5);
    this.rim.position.set(3, -3.5, cfg.radius - cfg.eyeDistance + 2);
    this.fit(this.camera.aspect);
  }

  /** Image-based lighting: the rest of the cockpit, for the chrome to reflect. */
  setEnvironment(renderer: THREE.WebGLRenderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = cockpitEnvironment();
    // Unblurred and much finer than the default: the dome is a concave
    // mirror that magnifies what it reflects about twofold, so polished chrome
    // needs the detail to stay crisp. Rendered to a cube map first rather than
    // with pmrem.fromScene(): that draws each face edge to edge with no border,
    // and the magnified reflection shows a seam where the faces meet.
    const size = LOW_GFX ? 128 : 1024;
    const cube = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    new THREE.CubeCamera(0.1, 100, cube).update(renderer, env);
    this.scene.environment = pmrem.fromCubemap(cube.texture).texture;
    this.scene.environmentIntensity = 1;
    cube.dispose();
    pmrem.dispose();
    env.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
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
    this.camera.fov = this.baseFov = (2 * Math.atan(tanV * 1.03) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    // Side edges are measured sitting back, so turning doesn't move them.
    const code = cfg.code;
    this.leftEdge = wallToWorld(code.x + code.w / 2, 0, cfg.radius, 0, p).project(this.camera).x;
    this.rightEdge = wallToWorld(cfg.status.x - cfg.status.w / 2, 0, cfg.radius, 0, p).project(this.camera).x;
    this.computeSidePoses();
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

  /**
   * Turned toward a side: the gaze swings partway to the side's panels, the
   * head moves a little closer and the view narrows. Facing a panel undoes
   * the wide lens's stretch at the screen edge, so the zoom has to outweigh it.
   */
  private computeSidePoses() {
    const cfg = this.cfg;
    // How far the head moves in, per side, tuned so both read as the same
    // slight zoom: the readouts sit farther off-axis and need more.
    const groups = {
      left: { rects: [cfg.plot, cfg.code], closer: 0.12 },
      right: { rects: [cfg.status, cfg.library], closer: 0.16 },
    };
    for (const [name, { rects, closer }] of Object.entries(groups)) {
      const side = this.sides[name as 'left' | 'right'];
      const x0 = Math.min(...rects.map((r) => r.x - r.w / 2));
      const x1 = Math.max(...rects.map((r) => r.x + r.w / 2));
      const y0 = Math.min(...rects.map((r) => r.y - r.h / 2));
      const y1 = Math.max(...rects.map((r) => r.y + r.h / 2));
      const center = wallToWorld((x0 + x1) / 2, (y0 + y1) / 2, cfg.radius, 0);
      side.pose.target.lerpVectors(this.base.target, center, 0.3);
      side.pose.eye.lerpVectors(this.base.eye, center, closer);
    }
  }

  /** Which side the pointer is over, from its screen x (-1 to 1). */
  sideAt(ndcX: number): FocusSide {
    if (ndcX < this.leftEdge) return 'left';
    if (ndcX > this.rightEdge) return 'right';
    return null;
  }

  /** Turns toward a side's panels, or back to center. Ignored while leaned in. */
  setFocus(side: FocusSide) {
    this.sides.left.goal = side === 'left' ? 1 : 0;
    this.sides.right.goal = side === 'right' ? 1 : 0;
  }

  setLean(on: boolean) {
    this.leanGoal = on ? 1 : 0;
  }

  get leaning(): boolean {
    return this.lean !== this.leanGoal;
  }

  /** Advances the lean animation; returns true while the camera is moving. */
  update(dt: number): boolean {
    let moved = false;
    if (this.lean !== this.leanGoal) {
      const step = dt / (this.leanGoal > this.lean ? LEAN_IN_S : LEAN_OUT_S);
      this.lean = this.leanGoal > this.lean ? Math.min(1, this.lean + step) : Math.max(0, this.lean - step);
      moved = true;
    }
    for (const side of Object.values(this.sides)) {
      // Leaning in to the portal overrides turning to a side.
      const goal = this.leanGoal ? 0 : side.goal;
      if (side.at === goal) continue;
      const step = dt / FOCUS_S;
      side.at = goal > side.at ? Math.min(1, side.at + step) : Math.max(0, side.at - step);
      moved = true;
    }
    if (moved) this.applyPose();
    return moved;
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
    let roll = Math.sin(Math.PI * p) * 0.012;
    let zoom = 0;
    // Turning to a side: the same small dip mid-motion, and the head tips
    // toward that side, most mid-turn and a little once there.
    for (const side of Object.values(this.sides)) {
      const q = easeInOutCubic(side.at) * (1 - p);
      if (q === 0) continue;
      eye.addScaledVector(this.base.eye, -q).addScaledVector(side.pose.eye, q);
      target.addScaledVector(this.base.target, -q).addScaledVector(side.pose.target, q);
      const turn = Math.sin(Math.PI * easeInOutCubic(side.at));
      eye.y -= 0.08 * turn;
      roll += side.dir * (0.012 * turn + 0.006 * q);
      zoom += FOCUS_ZOOM * q;
    }
    this.camera.up.set(roll, 1, 0).normalize();
    if (this.camera.fov !== this.baseFov * (1 - zoom)) {
      this.camera.fov = this.baseFov * (1 - zoom);
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }
}
