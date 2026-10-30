// The control board's bake hardware and knob edit display
// (docs/control-board.md), in the console's panel units, facing +z. The
// console's printed face has holes cut where these sink below it: the edit
// display's glass, each bubble's well, and the bake all button's well.

import * as THREE from 'three';
import { redrawListenerRef, type PanelPointerEvent, type PointerTarget } from '../panels/panel';
import { chromeMaterial } from '../style/console';
import { LOW_GFX, physicalMaterial } from '../style/quality';
import type { EditDisplay } from './editDisplay';
import { BAKE_ALL, BAKE_KEY, BUBBLE_R, BUBBLE_Y, EDIT_DISPLAY, knobLocal } from './plan';

const redraw = (o: THREE.Object3D) => redrawListenerRef()?.(o);

/** How far the edit display's glass sits below the console's face. */
export const DISPLAY_DEPTH = 0.07;
/** Depth of a bubble's well, and of the bake all button's. */
const WELL_DEPTH = 0.07;

/** Rounded rectangle path, centered, in panel units. */
function roundedRect(path: THREE.Path, w: number, h: number, r: number): THREE.Path {
  const x = -w / 2;
  const y = -h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x + w, y + h - r);
  path.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  path.lineTo(x + r, y + h);
  path.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(x, y + r);
  path.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}

/** The holes the console's face leaves open, for it to cut from its texture. */
export const FACE_HOLES = {
  display: { ...EDIT_DISPLAY, r: 0.16, rim: 0.07 },
  bubble: BUBBLE_R * 1.22,
  bakeAll: BAKE_ALL.r * 1.3,
};

const materials = () => ({
  well: physicalMaterial({ color: '#0b0e10', metalness: 0.6, roughness: 0.55, side: THREE.BackSide }),
  chrome: chromeMaterial({ roughness: 0.12 }),
  red: physicalMaterial({ color: '#b3121a', metalness: 0.1, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }),
  // Clear, slightly frosted resin. Not transmission: one charm of glass is
  // not worth an extra render pass.
  resin: physicalMaterial({
    color: '#dce8ea',
    metalness: 0,
    roughness: LOW_GFX ? 0.3 : 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    // Flipped open, a dome shows its hollow side.
    side: THREE.DoubleSide,
  }),
  seam: new THREE.MeshBasicMaterial({ color: '#05080a' }),
});
type Mats = ReturnType<typeof materials>;

/** A round well sunk in the face, open at the top: its wall and floor. */
function well(r: number, depth: number, mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 32, 1, true).rotateX(Math.PI / 2), mats.well);
  wall.position.z = -depth / 2;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(r, 32), mats.well.clone());
  (floor.material as THREE.MeshPhysicalMaterial).side = THREE.FrontSide;
  floor.position.z = -depth;
  g.add(wall, floor);
  return g;
}

/** A clear resin dome. */
function bubble(r: number, height: number, mats: Mats): THREE.Mesh {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), mats.resin);
  dome.scale.z = height / r;
  dome.renderOrder = 2;
  return dome;
}

/** The thin dark seam where a bubble meets the face. */
function seam(r: number, mats: Mats): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.98, r * 1.08, 40), mats.seam);
  m.position.z = 0.002;
  return m;
}

/** How far a pressed button travels. */
const PRESS = 0.018;

/** A red pushbutton: a short glossy cylinder with a rounded top. */
function redButton(r: number, h: number, mats: Mats): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 4, 24).rotateX(Math.PI / 2), mats.red);
  m.scale.z = 0.5;
  return m;
}

/**
 * One knob's bake bubble: its well, the red button in it, and the dome over
 * it, hinged at its back edge like the bake all button's guard. While its
 * knob is in edit mode the dome flips up and the button it uncovers bakes the
 * knob. Only the exposed button takes the pointer; the bubble never looks
 * clickable.
 */
export class BakeBubble implements PointerTarget {
  readonly group = new THREE.Group();
  readonly button: THREE.Mesh;
  /** Pivots on the dome's back (far) edge. */
  readonly guard = new THREE.Group();
  pixelWidth = 1;
  pixelHeight = 1;
  /** 0 covered, 1 flipped open. */
  private open = 0;
  private goal = 0;
  private pressed = false;
  private readonly rest: number;
  private lift = 0;
  onPress: (() => void) | null = null;

  constructor(
    readonly slot: number,
    mats: Mats,
  ) {
    const [x] = knobLocal(slot);
    this.group.position.set(x, BUBBLE_Y, 0);
    this.group.add(well(FACE_HOLES.bubble, WELL_DEPTH, mats), seam(FACE_HOLES.bubble * 1.02, mats));
    this.button = redButton(BUBBLE_R * 0.8, 0.05, mats);
    // Its own material, so it can light up when uncovered.
    this.button.material = (this.button.material as THREE.MeshPhysicalMaterial).clone();
    this.rest = this.button.position.z = -WELL_DEPTH + 0.025;
    const r = FACE_HOLES.bubble * 1.02;
    const dome = bubble(r, BUBBLE_R * 0.85, mats);
    dome.position.y = -r;
    this.guard.position.y = r;
    this.guard.add(dome);
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, r * 0.9, 12).rotateZ(Math.PI / 2), mats.chrome);
    hinge.position.set(0, r + 0.006, 0.01);
    this.group.add(this.button, this.guard, hinge);
    this.group.traverse((o) => (o.raycast = () => {}));
    this.button.raycast = THREE.Mesh.prototype.raycast;
  }

  get meshes(): THREE.Object3D[] {
    return [this.button];
  }

  /** Whether the button is uncovered, so it can be pressed. */
  get exposed(): boolean {
    // Pressable once the dome is up, while it still springs.
    return this.goal === 1 && this.open > 0.4;
  }

  /** Where a closing dome starts from, so it eases down from wherever the spring had it. */
  private closeFrom = 0;

  /** Uncovers the button (its knob is in edit mode), or covers it again. */
  setOpen(open: boolean) {
    const goal = open ? 1 : 0;
    if (goal === this.goal) return;
    this.goal = goal;
    if (!open) {
      this.setPressed(false);
      this.closeFrom = this.guard.rotation.x;
    }
  }

  /** Advances the flip; true while it moves. */
  tick(dt: number): boolean {
    if (this.open === this.goal) return false;
    if (this.goal) {
      // Spring-loaded: it snaps up past open, then settles back.
      this.open = Math.min(1, this.open + dt / SPRING_S);
      const t = this.open;
      this.guard.rotation.x = -GUARD_OPEN * (t >= 1 ? 1 : 1 - Math.exp(-6 * t) * Math.cos(14 * t));
    } else {
      // Down as the bake all guard closes, eased.
      this.open = Math.max(0, this.open - dt / GUARD_S);
      const t = this.open;
      this.guard.rotation.x = this.closeFrom * t * t * (3 - 2 * t);
    }
    const k = this.goal ? Math.min(1, this.open * 2) : this.open;
    // Uncovered, the button stands up in a shallow well, faintly lit.
    this.lift = k * (WELL_DEPTH - 0.035);
    this.button.position.z = this.rest + this.lift - (this.pressed ? PRESS : 0);
    (this.button.material as THREE.MeshPhysicalMaterial).emissive.setRGB(0.35 * k, 0.02 * k, 0.02 * k);
    redraw(this.group);
    return true;
  }

  private setPressed(p: boolean) {
    if (p === this.pressed) return;
    this.pressed = p;
    this.button.position.z = this.rest + this.lift - (p ? PRESS : 0);
    redraw(this.group);
  }

  hitTest(): boolean {
    return this.exposed;
  }

  onPointer(e: PanelPointerEvent): boolean | void {
    if (!this.exposed) return;
    if (e.kind === 'down' && e.button === 0) {
      this.setPressed(true);
      return true;
    }
    if (e.kind === 'up' && this.pressed) {
      this.setPressed(false);
      this.onPress?.();
    }
  }

  cursorAt(): string {
    return this.exposed ? 'pointer' : 'default';
  }
}

/**
 * The bake all button in its well, under a larger bubble hinged at its back
 * edge like a switch guard. Arming the BAKE key lifts the guard and lights
 * the button; only then does it take the pointer.
 */
export class BakeAllButton implements PointerTarget {
  readonly group = new THREE.Group();
  readonly button: THREE.Mesh;
  /** Pivots on the bubble's back (far) edge. */
  readonly guard = new THREE.Group();
  pixelWidth = 1;
  pixelHeight = 1;
  private open = 0;
  private armed = false;
  /** Lit from within: armed, with something to bake. */
  private lit = false;
  private pressed = false;
  private readonly rest: number;
  onPress: (() => void) | null = null;

  constructor(mats: Mats) {
    this.group.position.set(BAKE_ALL.x, BAKE_ALL.y, 0);
    this.group.add(well(FACE_HOLES.bakeAll, WELL_DEPTH, mats));
    this.button = redButton(BAKE_ALL.r * 0.85, 0.08, mats);
    this.button.material = (this.button.material as THREE.MeshPhysicalMaterial).clone();
    this.rest = this.button.position.z = -WELL_DEPTH + 0.04;
    const r = FACE_HOLES.bakeAll * 1.04;
    const dome = bubble(r, BAKE_ALL.r * 0.95, mats);
    dome.position.y = -r;
    this.guard.position.y = r;
    this.guard.add(dome);
    this.group.add(seam(r, mats));
    // A small chrome hinge barrel along the back edge.
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, r * 0.9, 16).rotateZ(Math.PI / 2), mats.chrome);
    hinge.position.set(0, r + 0.01, 0.02);
    this.group.add(this.button, this.guard, hinge);
    this.group.traverse((o) => (o.raycast = () => {}));
    this.button.raycast = THREE.Mesh.prototype.raycast;
  }

  get meshes(): THREE.Object3D[] {
    return [this.button];
  }

  /** The key's state, and whether any knob is left to bake. */
  set(armed: boolean, bakeable: boolean) {
    this.armed = armed;
    if (!armed) this.setPressed(false);
    // It lights from within once uncovered, while there's anything to bake.
    const lit = armed && bakeable;
    if (lit !== this.lit) {
      this.lit = lit;
      (this.button.material as THREE.MeshPhysicalMaterial).emissive.set(lit ? '#ff1a12' : '#000000');
      (this.button.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.9;
      redraw(this.group);
    }
  }

  get exposed(): boolean {
    return this.armed && this.open > 0.9;
  }

  tick(dt: number): boolean {
    const goal = this.armed ? 1 : 0;
    if (this.open === goal) return false;
    this.open = goal > this.open ? Math.min(1, this.open + dt / GUARD_S) : Math.max(0, this.open - dt / GUARD_S);
    this.guard.rotation.x = guardAngle(this.open);
    redraw(this.group);
    return true;
  }

  private setPressed(p: boolean) {
    if (p === this.pressed) return;
    this.pressed = p;
    this.button.position.z = this.rest - (p ? PRESS * 1.6 : 0);
    redraw(this.group);
  }

  hitTest(): boolean {
    return this.exposed;
  }

  onPointer(e: PanelPointerEvent): boolean | void {
    if (!this.exposed) return;
    if (e.kind === 'down' && e.button === 0) {
      this.setPressed(true);
      return true;
    }
    if (e.kind === 'up' && this.pressed) {
      this.setPressed(false);
      this.onPress?.();
    }
  }

  cursorAt(): string {
    return this.exposed ? 'pointer' : 'default';
  }
}

/** How long the key takes to turn, and the guard to swing. */
const TURN_S = 0.3;
const GUARD_S = 0.35;
/** How long a knob's bubble takes to spring open and settle. */
const SPRING_S = 0.55;
/** How far a guard swings open: a little past upright. */
const GUARD_OPEN = 1.95;

/** A guard's angle on its hinge, `open` of the way: up and back, easing in and out. */
const guardAngle = (open: number) => -GUARD_OPEN * open * open * (3 - 2 * open);

/** Eases out past the end and settles back, like a detent. */
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

/** Charm physics, in the key's bay frame (panel units, seconds). */
const CHAIN = 0.34;
const HANG = 0.12;
const CHARM_R = 0.095;
const GRAVITY = 9;
const DAMPING = 0.985;
const STEP = 1 / 120;

/**
 * The BAKE key: a chrome lock body set in the face with a flat key standing
 * in it, and a charm hanging from its ring on a short chain. Clicking turns
 * it a quarter turn clockwise to ARM, or back to OFF. The charm is a small
 * verlet pendulum (ring, chain end, charm) under gravity in the console's
 * tipped frame, resting against the face.
 */
export class BakeKey implements PointerTarget {
  readonly group = new THREE.Group();
  /** Turns about the face normal: 0 at OFF, a quarter turn clockwise at ARM. */
  readonly key = new THREE.Group();
  /** The key itself, above the plug: what a press pushes in. */
  private readonly head = new THREE.Group();
  readonly charm = new THREE.Group();
  private readonly body: THREE.Mesh;
  pixelWidth = 1;
  pixelHeight = 1;
  onTurn: (() => void) | null = null;
  /** Where the chain hangs from, in the key's frame: through the bow's ring hole. */
  private readonly ring = new THREE.Vector3(0.08, -0.015, 0.38);
  private angle = 0;
  private from = 0;
  private to = 0;
  private turn = 1;
  /** The chain's end and the charm's center, now and a step ago. */
  private readonly end = new THREE.Vector3();
  private readonly ball = new THREE.Vector3();
  private readonly endPrev = new THREE.Vector3();
  private readonly ballPrev = new THREE.Vector3();
  private readonly links: THREE.Mesh[] = [];
  private readonly gravity = new THREE.Vector3();
  private acc = 0;
  private awake = true;
  /** Seconds the charm has hardly moved. */
  private still = 0;
  private pressed = false;

  constructor(mats: Mats) {
    const k = BAKE_KEY;
    this.group.position.set(k.x, k.y, 0);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(k.r * 1.05, 0.035, 14, 40), mats.chrome);
    collar.position.z = 0.02;
    const body = (this.body = new THREE.Mesh(new THREE.CylinderGeometry(k.r, k.r * 1.04, 0.07, 40).rotateX(Math.PI / 2), mats.chrome));
    body.position.z = 0.035;
    // The plug: the lock's turning core, with the keyway cut across it. It
    // turns with the key, so the slot shows where the key points.
    const plug = new THREE.Mesh(new THREE.CylinderGeometry(k.r * 0.74, k.r * 0.74, 0.014, 40).rotateX(Math.PI / 2), chromeMaterial({ roughness: 0.22 }));
    plug.position.z = 0.077;
    const plugSeam = new THREE.Mesh(new THREE.RingGeometry(k.r * 0.74, k.r * 0.79, 40), mats.seam);
    plugSeam.position.z = 0.0712;
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(k.r * 1.15, 0.045), mats.seam);
    slot.position.z = 0.0845;
    // The key: a neck down into the keyway and a flat, chunky bow with a ring
    // hole, all in the one plane the slot runs along.
    const keyMat = physicalMaterial({ color: '#c9a64b', metalness: 1, roughness: 0.25, clearcoat: 0.5 });
    const neck = new THREE.Mesh(new THREE.BoxGeometry(k.r * 0.8, 0.03, 0.07), keyMat);
    neck.position.z = 0.115;
    const bowShape = roundedRect(new THREE.Shape(), 0.3, 0.34, 0.1) as THREE.Shape;
    bowShape.holes.push(new THREE.Path().absarc(0.08, 0.07, 0.035, 0, Math.PI * 2, true));
    const bow = new THREE.Mesh(
      new THREE.ExtrudeGeometry(bowShape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 12 }),
      keyMat,
    );
    // Stands up out of the face, its flat side toward the pilot.
    bow.rotation.x = Math.PI / 2;
    bow.position.set(0, 0.015, 0.31);
    this.head.add(neck, bow);
    this.key.add(plug, slot, this.head);
    this.group.add(collar, body, plugSeam, this.key, this.charm);
    this.buildCharm(mats);
    // Hanging straight down the face to start.
    this.ringPoint(this.end).add(new THREE.Vector3(0, -CHAIN, -0.1));
    this.ball.copy(this.end).add(new THREE.Vector3(0, -HANG, 0));
    this.end.z = Math.max(this.end.z, 0.01);
    this.ball.z = Math.max(this.ball.z, CHARM_R);
    this.endPrev.copy(this.end);
    this.ballPrev.copy(this.ball);
    this.charm.traverse((o) => (o.raycast = () => {}));
    for (const m of [collar, plugSeam, slot]) m.raycast = () => {};
  }

  get meshes(): THREE.Object3D[] {
    return [this.key, this.body];
  }

  get armed(): boolean {
    return this.to !== 0;
  }

  /** Turns to ARM or back to OFF. */
  setArmed(armed: boolean) {
    const to = armed ? -Math.PI / 2 : 0;
    if (to === this.to) return;
    this.from = this.angle;
    this.to = to;
    this.turn = 0;
    this.awake = true;
    this.still = 0;
  }

  private ringPoint(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.ring).applyAxisAngle(Z, this.angle);
  }

  private buildCharm(mats: Mats) {
    // The chain: a few small links, placed each frame.
    const link = new THREE.TorusGeometry(0.016, 0.005, 6, 12);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(link, mats.chrome);
      this.links.push(m);
      this.charm.add(m);
    }
    // A little spiky ball with a face: eyes squeezed shut, teeth gritted.
    const ball = new THREE.Group();
    ball.name = 'charm';
    const skin = physicalMaterial({ color: '#ff7a59', metalness: 0, roughness: 0.45, clearcoat: 0.6 });
    ball.add(new THREE.Mesh(new THREE.IcosahedronGeometry(CHARM_R, 2), skin));
    const spike = new THREE.ConeGeometry(0.022, 0.05, 8).translate(0, CHARM_R + 0.015, 0);
    const ico = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
    const seen = new Set<string>();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < ico.count; i++) {
      const d = new THREE.Vector3().fromBufferAttribute(ico, i).normalize();
      const key = d.toArray().map((v) => v.toFixed(2)).join();
      // Not on the face side.
      if (seen.has(key) || d.z > 0.5) continue;
      seen.add(key);
      const m = new THREE.Mesh(spike, skin);
      m.quaternion.setFromUnitVectors(up, d);
      ball.add(m);
    }
    // The face, printed on a cap of the ball's front (+z).
    const cap = 0.75;
    const face = new THREE.Mesh(
      new THREE.SphereGeometry(CHARM_R * 1.01, 24, 24, Math.PI / 2 - cap, 2 * cap, Math.PI / 2 - cap, 2 * cap),
      new THREE.MeshBasicMaterial({ map: charmFace(), transparent: true, depthWrite: false }),
    );
    face.renderOrder = 3;
    ball.add(face);
    this.charm.add(ball);
  }

  /** Advances the key's turn and the charm; true while anything moves. */
  tick(dt: number): boolean {
    let moving = false;
    if (this.turn < 1) {
      this.turn = Math.min(1, this.turn + dt / TURN_S);
      this.angle = this.from + (this.to - this.from) * easeOutBack(this.turn);
      this.key.rotation.z = this.angle;
      moving = true;
    }
    if (this.awake) {
      this.group.getWorldQuaternion(TMP_Q).invert();
      this.gravity.set(0, -GRAVITY, 0).applyQuaternion(TMP_Q);
      this.acc += dt;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        // It sleeps once it has been still for a while.
        this.still = this.step() < 1e-10 && !moving ? this.still + STEP : 0;
      }
      if (this.still > 0.5) this.awake = false;
      this.place();
      moving = true;
    }
    if (moving) redraw(this.group);
    return moving;
  }

  /** One verlet step; returns the motion squared, to know when it has settled. */
  private step(): number {
    const ring = this.ringPoint(TMP_V);
    let energy = 0;
    for (const [p, q] of [[this.end, this.endPrev], [this.ball, this.ballPrev]] as const) {
      TMP_D.subVectors(p, q).multiplyScalar(DAMPING);
      energy += TMP_D.lengthSq();
      q.copy(p);
      p.add(TMP_D).addScaledVector(this.gravity, STEP * STEP);
    }
    const c = this.ball;
    for (let it = 0; it < 4; it++) {
      // The chain hangs from the ring and can go slack; the charm hangs stiffly from the chain.
      constrain(this.end, ring, CHAIN, true);
      constrain(c, this.end, HANG, false);
      // Resting against the face, and off the lock body standing on it.
      this.end.z = Math.max(this.end.z, 0.01);
      const out = BAKE_KEY.r * 1.1 + CHARM_R * 0.8;
      const top = 0.07 + CHARM_R;
      const rr = Math.hypot(c.x, c.y);
      if (rr < out && c.z < top) {
        // Out the shorter way: up onto the body, or off its side.
        if (top - c.z < out - rr || rr < 1e-6) c.z = top;
        else c.set((c.x / rr) * out, (c.y / rr) * out, c.z);
      }
      if (c.z < CHARM_R) {
        c.z = CHARM_R;
        // Friction against the panel.
        const q = this.ballPrev;
        q.x = c.x - (c.x - q.x) * 0.85;
        q.y = c.y - (c.y - q.y) * 0.85;
      }
    }
    return energy;
  }

  /** Puts the chain links and the charm where the simulation has them. */
  private place() {
    const ring = this.ringPoint(TMP_V);
    const a = this.end;
    const b = this.ball;
    const n = this.links.length;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const m = this.links[i]!;
      // Along ring → chain end, then a short way toward the charm.
      if (t < 0.8) m.position.lerpVectors(ring, a, t / 0.8);
      else m.position.lerpVectors(a, b, ((t - 0.8) / 0.2) * 0.4);
      m.rotation.set(0, i % 2 ? Math.PI / 2 : 0, 0);
    }
    const ball = this.charm.getObjectByName('charm')!;
    ball.position.copy(b);
    // Hangs from its chain, turned as far as it can toward the pilot.
    const y = TMP_D.subVectors(a, b).normalize();
    const z = TMP_F.copy(TOWARD_PILOT).addScaledVector(y, -TOWARD_PILOT.dot(y)).normalize();
    TMP_M.makeBasis(TMP_X.crossVectors(y, z), y, z);
    ball.quaternion.setFromRotationMatrix(TMP_M);
  }

  /** A small push, from the pointer passing over the key. */
  nudge() {
    this.ballPrev.set(this.ball.x - 0.004, this.ball.y, this.ball.z);
    this.awake = true;
    this.still = 0;
  }

  private setPressed(p: boolean) {
    this.pressed = p;
    this.head.position.z = p ? -0.012 : 0;
    redraw(this.group);
  }

  private hovered = false;

  onPointer(e: PanelPointerEvent): boolean | void {
    if (e.kind === 'hover' && !this.hovered) {
      this.hovered = true;
      this.nudge();
    } else if (e.kind === 'leave') {
      this.hovered = false;
    }
    if (e.kind === 'down' && e.button === 0) {
      this.setPressed(true);
      return true;
    }
    if (e.kind === 'up' && this.pressed) {
      this.setPressed(false);
      this.onTurn?.();
    }
  }

  cursorAt(): string {
    return 'pointer';
  }
}

const Z = new THREE.Vector3(0, 0, 1);
/** Out of the console's face and down toward its near edge, where the pilot sits. */
const TOWARD_PILOT = new THREE.Vector3(0, -0.7, 0.7).normalize();
const TMP_V = new THREE.Vector3();
const TMP_D = new THREE.Vector3();
const TMP_F = new THREE.Vector3();
const TMP_X = new THREE.Vector3();
const TMP_Q = new THREE.Quaternion();
const TMP_M = new THREE.Matrix4();

/** Moves `p` to `len` from `anchor`; a slack link only stops it going further. */
function constrain(p: THREE.Vector3, anchor: THREE.Vector3, len: number, slack: boolean) {
  TMP_D.subVectors(p, anchor);
  const d = TMP_D.length() || 1e-6;
  if (slack && d <= len) return;
  p.addScaledVector(TMP_D, (len - d) / d);
}

/** The charm's face: eyes squeezed shut like >_< and gritted, bared teeth. */
function charmFace(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#2a0f0a';
  g.lineWidth = 7;
  // > and <
  g.beginPath();
  g.moveTo(30, 36);
  g.lineTo(50, 48);
  g.lineTo(30, 60);
  g.moveTo(98, 36);
  g.lineTo(78, 48);
  g.lineTo(98, 60);
  g.stroke();
  // Gritted teeth: a white bar with dividers, outlined.
  g.beginPath();
  g.roundRect(34, 74, 60, 26, 8);
  g.fillStyle = '#fff8ee';
  g.fill();
  g.lineWidth = 5;
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(36, 87);
  g.lineTo(92, 87);
  for (const x of [49, 64, 79]) {
    g.moveTo(x, 75);
    g.lineTo(x, 99);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The knob edit display's bay: its screen on glass sunk into the face, in a rolled bezel. */
export class DisplayBay {
  readonly group = new THREE.Group();

  constructor(
    readonly screen: EditDisplay,
    mats: Mats,
  ) {
    const d = EDIT_DISPLAY;
    this.group.position.set(d.x, d.y, 0);
    screen.group.position.z = -DISPLAY_DEPTH;
    // The recess: walls from the face down to the screen, their top edge
    // rolled over into the face like the monitors' bezels.
    const h = FACE_HOLES.display;
    const lip = new THREE.Shape();
    roundedRect(lip, d.w + 2 * h.rim, d.h + 2 * h.rim, h.r + h.rim);
    lip.holes.push(roundedRect(new THREE.Path(), d.w, d.h, h.r));
    const rim = new THREE.Mesh(
      new THREE.ExtrudeGeometry(lip, { depth: DISPLAY_DEPTH - 0.02, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 5, curveSegments: 16 }),
      mats.chrome,
    );
    rim.position.z = -DISPLAY_DEPTH;
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(d.w, d.h),
      physicalMaterial({ color: '#000000', metalness: 0, roughness: LOW_GFX ? 0.2 : 0.05, ior: 1.7, envMapIntensity: 1.2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glass.position.z = -DISPLAY_DEPTH + 0.004;
    glass.raycast = () => {};
    rim.raycast = () => {};
    this.group.add(screen.group, rim, glass);
  }
}

/** Everything in the bays and the bubble row, built with one set of materials. */
export function buildBoard(slots: number, screen: EditDisplay) {
  const mats = materials();
  return {
    display: new DisplayBay(screen, mats),
    bubbles: Array.from({ length: slots }, (_, i) => new BakeBubble(i, mats)),
    bakeAll: new BakeAllButton(mats),
    key: new BakeKey(mats),
  };
}
