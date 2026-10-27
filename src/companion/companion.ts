// The companion (docs/companion.md): a floating glob of gel with one eye. It
// follows the camera between views, sits only where it covers nothing, and
// watches the user, the cursor, the portal or the knob that just moved.

import * as THREE from 'three';
import { bezelRadius, type LayoutConfig } from '../cockpit/layout';
import { knobWorld } from '../console/plan';
import type { CameraView, Cockpit } from '../cockpit/scene';
import type { KnobBank } from '../knobs/knobs';
import type { PanelPointerEvent, PointerTarget } from '../panels/panel';
import { wallToWorld } from '../panels/patch';
import { monitorCorners } from '../cockpit/rig';
import { allArmPoints } from '../cockpit/arms';
import type { ProjectStore } from '../project/store';
import type { ShaderRuntime } from '../shader/runtime';
import { toast } from '../overlays/help';
import {
  Attention,
  Blinker,
  BODY_EXTENT,
  Gaze,
  gazeToward,
  Glimmer,
  Pupil,
  bodyLobes,
  springStep,
  type Focus,
} from './behavior';
import { CompanionBody } from './body';
import { choosePerch, type Box, type Circle, type KeepOut, type PerchChoice } from './perch';

const HIDDEN_KEY = 'shaderverse.companion.hidden';
/** Seconds between checks that the perch is still clear. */
const RECHECK_S = 0.25;
/** Scales it tries, largest first, when no perch fits at full size. */
const SQUEEZE = [1, 0.85, 0.7];
/** Overlays the companion keeps clear of while they show. */
const OVERLAYS = '.sv-popover, .sv-editor, .sv-knob-button, .sv-help-box';

export interface CompanionDeps {
  cockpit: Cockpit;
  cfg: LayoutConfig;
  canvas: HTMLCanvasElement;
  store: ProjectStore;
  runtime: ShaderRuntime;
  knobs: KnobBank;
}

export class Companion implements PointerTarget {
  readonly body = new CompanionBody();
  readonly pixelWidth = 100;
  readonly pixelHeight = 100;
  /** Reduced motion: no drift, throb or squash, and it fades between perches. */
  reduced: boolean;
  private hiddenGoal: boolean;
  /** Hide progress: 0 shown, 1 sunk out of view. */
  private hide: number;
  private readonly blinker: Blinker;
  private readonly gaze: Gaze;
  private readonly pupil = new Pupil();
  private readonly glimmer: Glimmer;
  private readonly attention: Attention;
  /** Where it is, where it's going, and how fast. */
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private placed = false;
  private view: CameraView | null = null;
  private recheck = 0;
  /** The last perch choice, for tests and the dev panel. */
  perch: PerchChoice | null = null;
  private squish = 0;
  private squishV = 0;
  /** Reduced motion's fade between perches: fading out, then in at the goal. */
  private fade = 1;
  private fading = false;
  private hovered = false;
  private pointer: { x: number; y: number } | null = null;
  private readonly settled = new THREE.PerspectiveCamera();
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly call: HTMLButtonElement;

  constructor(private readonly deps: CompanionDeps) {
    const rng = Math.random;
    const now = performance.now() / 1000;
    this.blinker = new Blinker(rng, now);
    this.gaze = new Gaze(rng, now);
    this.glimmer = new Glimmer(rng, now);
    this.attention = new Attention(rng, now);

    const motion = new URLSearchParams(location.search).get('motion');
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reduced = motion === 'reduce' || (motion !== 'full' && !!mq?.matches);
    if (!motion) mq?.addEventListener('change', (e) => (this.reduced = e.matches));

    this.hiddenGoal = readHidden();
    this.hide = this.hiddenGoal ? 1 : 0;
    // The fallback control while it's hidden.
    this.call = document.createElement('button');
    this.call.type = 'button';
    this.call.className = 'sv-companion-call';
    this.call.title = 'Bring the companion back (C)';
    this.call.setAttribute('aria-label', 'Bring the companion back');
    this.call.hidden = !this.hiddenGoal;
    this.call.addEventListener('click', () => this.setHidden(false));
    document.body.appendChild(this.call);

    window.addEventListener('pointermove', (e) => {
      const r = deps.canvas.getBoundingClientRect();
      this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    document.documentElement.addEventListener('pointerleave', () => (this.pointer = null));

    deps.store.subscribe((s, prev) => {
      const t = performance.now() / 1000;
      if (s.project.knobs !== prev.project.knobs) {
        for (const k of s.project.knobs) {
          const before = prev.project.knobs.find((x) => x.id === k.id);
          if (before && before.value !== k.value) {
            this.attention.knobTurned(t, k.slot);
            this.pupil.interest(0.5);
          }
        }
      }
      if (
        s.compile !== prev.compile &&
        s.compile.status === 'ok' &&
        s.compile.source !== prev.compile.source
      ) {
        this.attention.compiled(t);
        this.pupil.interest(0.6);
      }
    });
  }

  get meshes(): THREE.Object3D[] {
    return [this.body.mesh];
  }

  get hidden(): boolean {
    return this.hiddenGoal;
  }

  /** Sinks it out of view, leaving a small control to call it back. */
  setHidden(hidden: boolean): void {
    if (hidden === this.hiddenGoal) return;
    this.hiddenGoal = hidden;
    this.call.hidden = !hidden;
    try {
      if (hidden) localStorage.setItem(HIDDEN_KEY, '1');
      else localStorage.removeItem(HIDDEN_KEY);
    } catch {
      // Storage blocked: it just won't be remembered.
    }
    if (hidden) toast('Companion hidden. Press C to bring it back.');
    else this.blinker.blink(performance.now() / 1000);
  }

  onPointer(e: PanelPointerEvent): boolean {
    if (e.kind === 'hover') this.hovered = true;
    else if (e.kind === 'leave') this.hovered = false;
    else if (e.kind === 'down') {
      // A squish and a blink; addressing the AI arrives with v1.1.
      if (!this.reduced) this.squishV += 7;
      this.blinker.blink(performance.now() / 1000);
      this.pupil.interest(0.7);
    }
    return false;
  }

  cursorAt(): string {
    return 'pointer';
  }

  hitTest(x: number, y: number): boolean {
    return this.hide < 0.5 && this.body.covers(x / this.pixelWidth, 1 - y / this.pixelHeight);
  }

  /** World radius it keeps at its perch, and the radius it has now on the way there. */
  private goalRadius = 0;
  private radius = 0;

  update(nowMs: number, dt: number): void {
    const now = nowMs / 1000;
    const { cockpit } = this.deps;
    const camera = cockpit.camera;

    // Pick the perch for the view the camera is heading to.
    const view = cockpit.view;
    this.recheck -= dt;
    if (view !== this.view || this.recheck <= 0) {
      const changed = view !== this.view;
      this.view = view;
      this.recheck = RECHECK_S;
      const before = this.goal.clone();
      this.choose(view);
      if (!this.placed) {
        this.pos.copy(this.goal);
        this.radius = this.goalRadius;
        this.placed = true;
      } else if (
        this.reduced &&
        (changed || before.distanceTo(this.goal) > this.goalRadius * 0.5)
      ) {
        this.fading = true;
      }
    }

    // Travel: a spring that lags the camera and wobbles as it settles.
    if (this.reduced) {
      this.vel.set(0, 0, 0);
      if (this.fading) {
        this.fade = Math.max(0, this.fade - dt / 0.25);
        if (this.fade === 0) {
          this.pos.copy(this.goal);
          this.fading = false;
        }
      } else {
        this.pos.copy(this.goal);
        this.fade = Math.min(1, this.fade + dt / 0.25);
      }
    } else {
      this.fade = 1;
      this.fading = false;
      for (const axis of ['x', 'y', 'z'] as const) {
        [this.pos[axis], this.vel[axis]] = springStep(
          this.pos[axis],
          this.vel[axis],
          this.goal[axis],
          4.2,
          0.55,
          dt,
        );
      }
    }
    [this.squish, this.squishV] = springStep(this.squish, this.squishV, 0, 16, 0.25, dt);
    this.hide = this.hiddenGoal
      ? Math.min(1, this.hide + dt / 0.6)
      : Math.max(0, this.hide - dt / 0.6);

    // Nearer the camera when leaned in, so smaller, to look the same size.
    this.radius +=
      (this.goalRadius - this.radius) * (this.reduced && !this.fading ? 1 : 1 - Math.exp(-dt * 4));
    // Keep the whole body inside the perch circle.
    const R = this.radius / BODY_EXTENT;
    const center = this.v.copy(this.pos);
    // Camera right and up, for idle drift and sinking out of view.
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    if (!this.reduced) {
      // A slow Lissajous bob around the perch.
      center
        .addScaledVector(right, Math.sin(now * 0.37) * 0.035)
        .addScaledVector(up, Math.sin(now * 0.53 + 1) * 0.03);
    }
    const sink = this.hide * this.hide;
    center.addScaledVector(up, -sink * R * 4);

    // Where to look: a screen point, or the user.
    const here = this.screen(center, camera);
    const rPx = this.screenRadius(center, R, camera);
    const focus = this.attention.focus(now, {
      view,
      hovered: this.hovered,
      pointerOn: !!this.pointer,
      dragging: view === 'lean' && this.deps.runtime.mouseHeld,
    });
    const target = this.focusPoint(focus, now, camera);
    const [tx, ty] = target ? gazeToward(target.x - here.x, here.y - target.y, rPx) : [0, 0];
    this.gaze.restlessness = view === 'lean' ? 1.8 : 1;
    this.gaze.update(now, dt, tx, ty);
    this.pupil.hold = this.hovered ? 0.3 : 0;

    const velView = this.w
      .copy(this.vel)
      .applyQuaternion(camera.quaternion.clone().invert())
      .divideScalar(R);
    this.body.update(camera, {
      center,
      radius: R,
      lobes: bodyLobes(now, {
        vx: velView.x,
        vy: velView.y,
        vz: velView.z,
        squish: this.squish,
        animate: !this.reduced,
      }),
      gazeX: this.gaze.x,
      gazeY: this.gaze.y,
      pupil: this.pupil.update(dt),
      lid: this.blinker.lid(now),
      glimmer: this.glimmer.at(now),
      alpha: this.fade * (1 - sink),
      time: now,
    });
  }

  /** The screen point a focus refers to, or null for the user (the camera). */
  private focusPoint(
    focus: Focus,
    now: number,
    camera: THREE.Camera,
  ): { x: number; y: number } | null {
    const cfg = this.deps.cfg;
    switch (focus.kind) {
      case 'user':
        return null;
      case 'pointer':
        return this.pointer;
      case 'portal': {
        // Watching the pattern: wandering slowly about the center.
        const s = cfg.portal.size / 4;
        const x = cfg.portal.x + Math.sin(now * 0.31) * s + Math.sin(now * 0.83) * s * 0.3;
        const y = cfg.portal.y + Math.sin(now * 0.23 + 2) * s * 0.7;
        return this.screen(wallToWorld(x, y, cfg.radius, 0, this.w), camera);
      }
      case 'knob': {
        return this.screen(knobWorld(cfg, focus.slot, this.w), camera);
      }
    }
  }

  /** Chooses the perch for `view` and sets the travel goal. */
  private choose(view: CameraView): void {
    const { cockpit, cfg, canvas } = this.deps;
    const c = cfg.companion;
    const cam = cockpit.settledCamera(view, this.settled);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const perches = c.perches[view];
    const wall = new THREE.Vector3();
    // `size` is its width on the wall straight ahead sitting back; elsewhere
    // it scales with distance so it looks the same size in every view.
    const full = perches.map(
      (p) =>
        (c.size * wallToWorld(p.x, p.y, cfg.radius, 0, wall).distanceTo(cam.position)) /
        cfg.eyeDistance,
    );
    const zones = this.keepOut(cam);
    let margin = 0;
    let sizes = full;
    // Where nothing fits (leaned in, a narrow window) it squeezes smaller
    // before falling back to peeking in from an edge.
    for (const squeeze of SQUEEZE) {
      const scaled = full.map((s) => s * squeeze);
      const candidates: Circle[] = perches.map((p, i) => {
        const s = this.screen(wallToWorld(p.x, p.y, cfg.radius, 0, wall), cam);
        const e = this.screen(wallToWorld(p.x + scaled[i]! / 2, p.y, cfg.radius, 0, wall), cam);
        return { x: s.x, y: s.y, r: Math.hypot(e.x - s.x, e.y - s.y) * 1.05 };
      });
      if (!margin) margin = (c.margin / (c.size / 2)) * (candidates[0]?.r ?? 40);
      const choice = choosePerch(candidates, zones, W, H, margin);
      if (choice.index >= 0 || squeeze === SQUEEZE[0]) {
        this.perch = choice;
        sizes = scaled;
      }
      if (choice.index >= 0) break;
    }
    const perch = this.perch!;
    const i = Math.max(0, perch.index);
    const p = perches[i] ?? { x: 0, y: 0 };
    this.goalRadius = ((sizes[i] ?? c.size) / 2) * (1 - c.standoff);
    this.goal.lerpVectors(wallToWorld(p.x, p.y, cfg.radius, 0, wall), cam.position, c.standoff);
    if (perch.index < 0) {
      // Off the list: the screen point at the same distance from the eye.
      const d = this.goal.distanceTo(cam.position);
      const ndc = new THREE.Vector3((perch.x / W) * 2 - 1, 1 - (perch.y / H) * 2, 0.5).unproject(
        cam,
      );
      this.goal.copy(cam.position).addScaledVector(ndc.sub(cam.position).normalize(), d);
    }
  }

  /** Monitors, their arms, the bezel, knobs and open overlays, as seen from `cam`. */
  keepOut(cam: THREE.Camera): KeepOut {
    const { cfg, canvas } = this.deps;
    const R = cfg.radius;
    const p = new THREE.Vector3();
    const at = (x: number, y: number) => this.screen(wallToWorld(x, y, R, 0, p), cam);
    const circle = (x: number, y: number, r: number): Circle => {
      const c = at(x, y);
      let pr = 0;
      for (let i = 0; i < 4; i++) {
        const e = at(x + r * Math.cos((i * Math.PI) / 2), y + r * Math.sin((i * Math.PI) / 2));
        pr = Math.max(pr, Math.hypot(e.x - c.x, e.y - c.y));
      }
      return { x: c.x, y: c.y, r: pr };
    };
    const view = new THREE.Vector3();
    const boxes: Box[] = [];
    // The monitors and the console.
    for (const m of [cfg.plot, cfg.code, cfg.status, cfg.library, cfg.console]) {
      // Leaned in, the monitors pass behind the camera, where they project
      // inside out; those keep nothing out.
      const corners = monitorCorners(cfg, m);
      if (corners.some((c) => view.copy(c).applyMatrix4(cam.matrixWorldInverse).z > -0.05)) continue;
      const b: Box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
      for (const c of corners) {
        const s = this.screen(c, cam);
        b.left = Math.min(b.left, s.x);
        b.right = Math.max(b.right, s.x);
        b.top = Math.min(b.top, s.y);
        b.bottom = Math.max(b.bottom, s.y);
      }
      boxes.push(b);
    }
    const circles: Circle[] = [circle(cfg.portal.x, cfg.portal.y, bezelRadius(cfg))];
    // The arms, as a chain of circles down each one, where they're in front of the camera.
    for (const a of allArmPoints(cfg)) {
      const shoulder = a.mount.clone().add(new THREE.Vector3(0, -0.3, 0));
      for (const [from, to] of [[shoulder, a.elbow], [a.elbow, a.wrist]] as const) {
        const n = Math.max(1, Math.ceil(from.distanceTo(to) / 0.2));
        for (let j = 0; j <= n; j++) {
          const q = from.clone().lerp(to, j / n);
          if (view.copy(q).applyMatrix4(cam.matrixWorldInverse).z > -0.1) continue;
          const c = this.screen(q, cam);
          circles.push({ x: c.x, y: c.y, r: this.screenRadius(q, 0.12, cam) });
        }
      }
    }
    // Flat overlays, in canvas pixels.
    const cr = canvas.getBoundingClientRect();
    for (const el of document.querySelectorAll<HTMLElement>(OVERLAYS)) {
      if (el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      boxes.push({
        left: r.left - cr.left,
        top: r.top - cr.top,
        right: r.right - cr.left,
        bottom: r.bottom - cr.top,
      });
    }
    return { circles, boxes };
  }

  private screen(p: THREE.Vector3, cam: THREE.Camera): { x: number; y: number } {
    const v = new THREE.Vector3().copy(p).project(cam);
    const W = this.deps.canvas.clientWidth;
    const H = this.deps.canvas.clientHeight;
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
  }

  /** Screen radius of a sphere of radius `r` at `p`, roughly. */
  private screenRadius(p: THREE.Vector3, r: number, cam: THREE.Camera): number {
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const a = this.screen(p, cam);
    const b = this.screen(new THREE.Vector3().copy(p).addScaledVector(right, r), cam);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
}

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}
