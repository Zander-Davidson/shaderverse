// The control board's bake hardware and knob edit display
// (docs/control-board.md), in the console's panel units, facing +z. The
// console's printed face has holes cut where these sink below it: the edit
// display's glass, each bubble's well, and the bake all button's well.

import * as THREE from 'three';
import { CanvasPanel } from '../panels/panel';
import { chromeMaterial } from '../style/console';
import { LOW_GFX, physicalMaterial } from '../style/quality';
import { BAKE_ALL, BAKE_KEY, BUBBLE_R, BUBBLE_Y, EDIT_DISPLAY, knobLocal } from './plan';

/** How far the edit display's glass sits below the console's face. */
export const DISPLAY_DEPTH = 0.07;
/** Depth of a bubble's well, and of the bake all button's. */
const WELL_DEPTH = 0.07;
const DISPLAY_PX_PER_UNIT = 300;

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

/** A clear resin dome, with the thin dark seam where it meets the face. */
function bubble(r: number, height: number, mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), mats.resin);
  dome.scale.z = height / r;
  dome.renderOrder = 2;
  const seam = new THREE.Mesh(new THREE.RingGeometry(r * 0.98, r * 1.08, 40), mats.seam);
  seam.position.z = 0.002;
  g.add(dome, seam);
  return g;
}

/** A red pushbutton: a short glossy cylinder with a rounded top. */
function redButton(r: number, h: number, mats: Mats): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 4, 24).rotateX(Math.PI / 2), mats.red);
  m.scale.z = 0.5;
  return m;
}

/** One knob's bake bubble: its well, the red button in it, and the dome over it. */
export class BakeBubble {
  readonly group = new THREE.Group();
  readonly button: THREE.Mesh;
  readonly dome: THREE.Group;

  constructor(
    readonly slot: number,
    mats: Mats,
  ) {
    const [x] = knobLocal(slot);
    this.group.position.set(x, BUBBLE_Y, 0);
    this.group.add(well(FACE_HOLES.bubble, WELL_DEPTH, mats));
    this.button = redButton(BUBBLE_R * 0.72, 0.04, mats);
    this.button.position.z = -WELL_DEPTH + 0.025;
    this.dome = bubble(FACE_HOLES.bubble * 1.02, BUBBLE_R * 0.85, mats);
    this.group.add(this.button, this.dome);
    this.group.traverse((o) => (o.raycast = () => {}));
  }
}

/** The bake all button in its well, under a larger bubble hinged at its back edge. */
export class BakeAllButton {
  readonly group = new THREE.Group();
  readonly button: THREE.Mesh;
  /** Pivots on the bubble's back (far) edge. */
  readonly guard = new THREE.Group();

  constructor(mats: Mats) {
    this.group.position.set(BAKE_ALL.x, BAKE_ALL.y, 0);
    this.group.add(well(FACE_HOLES.bakeAll, WELL_DEPTH, mats));
    this.button = redButton(BAKE_ALL.r * 0.85, 0.08, mats);
    this.button.position.z = -WELL_DEPTH + 0.04;
    const r = FACE_HOLES.bakeAll * 1.04;
    const dome = bubble(r, BAKE_ALL.r * 0.95, mats);
    dome.position.y = -r;
    this.guard.position.y = r;
    this.guard.add(dome);
    // A small chrome hinge barrel along the back edge.
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, r * 0.9, 16).rotateZ(Math.PI / 2), mats.chrome);
    hinge.position.set(0, r + 0.01, 0.02);
    this.group.add(this.button, this.guard, hinge);
    this.group.traverse((o) => (o.raycast = () => {}));
  }
}

/** The BAKE key: a chrome lock body set in the face with a flat key standing in it. */
export class BakeKey {
  readonly group = new THREE.Group();
  /** Turns about the face normal: 0 at OFF, a quarter turn clockwise at ARM. */
  readonly key = new THREE.Group();
  /** Where the charm's chain hangs from, in the key's frame. */
  readonly ring = new THREE.Vector3(0, 0.36, 0.09);

  constructor(mats: Mats) {
    const k = BAKE_KEY;
    this.group.position.set(k.x, k.y, 0);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(k.r * 1.05, 0.035, 14, 40), mats.chrome);
    collar.position.z = 0.02;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(k.r, k.r * 1.04, 0.07, 40).rotateX(Math.PI / 2), mats.chrome);
    body.position.z = 0.035;
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.05, k.r * 1.1), mats.seam);
    slot.position.z = 0.071;
    // The key: a short shank into the slot and a flat, chunky bow with a ring hole.
    const keyMat = physicalMaterial({ color: '#c9a64b', metalness: 1, roughness: 0.25, clearcoat: 0.5 });
    const shank = new THREE.Mesh(new THREE.BoxGeometry(0.035, k.r * 0.9, 0.08), keyMat);
    shank.position.z = 0.1;
    const bowShape = roundedRect(new THREE.Shape(), 0.3, 0.34, 0.1) as THREE.Shape;
    bowShape.holes.push(new THREE.Path().absarc(0, 0.09, 0.045, 0, Math.PI * 2, true));
    const bow = new THREE.Mesh(
      new THREE.ExtrudeGeometry(bowShape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 12 }),
      keyMat,
    );
    // Stands up out of the face, its flat side toward the pilot.
    bow.rotation.x = Math.PI / 2;
    bow.position.set(0, 0.015, 0.14 + 0.17);
    this.key.add(shank, bow);
    this.ring.set(0, 0, 0.14 + 0.17 + 0.09);
    this.group.add(collar, body, slot, this.key);
  }
}

/** The knob edit display: its own canvas on glass sunk into the face, in a rolled bezel. */
export class EditDisplay extends CanvasPanel {
  readonly group = new THREE.Group();
  constructor(mats: Mats) {
    const d = EDIT_DISPLAY;
    super({ x: 0, y: 0, w: d.w, h: d.h }, Math.round(d.w * DISPLAY_PX_PER_UNIT), Math.round(d.h * DISPLAY_PX_PER_UNIT), 0, 0);
    this.group.position.set(d.x, d.y, 0);
    this.mesh.position.z = -DISPLAY_DEPTH;
    this.material.alphaTest = 0;
    this.material.transparent = false;
    // The recess: walls from the face down to the glass, their top edge
    // rolled over into the face like the monitors' bezels.
    const h = FACE_HOLES.display;
    const lip = new THREE.Shape();
    roundedRect(lip, d.w + 2 * h.rim, d.h + 2 * h.rim, h.r + h.rim);
    lip.holes.push(roundedRect(new THREE.Path(), d.w, d.h, h.r));
    const rim = new THREE.Mesh(
      new THREE.ExtrudeGeometry(lip, { depth: DISPLAY_DEPTH - 0.02, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 5, curveSegments: 16 }),
      mats.chrome,
    );
    // The bevel's top rounds over level with the face; the wall drops to the glass.
    rim.position.z = -DISPLAY_DEPTH;
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(d.w, d.h),
      physicalMaterial({ color: '#000000', metalness: 0, roughness: LOW_GFX ? 0.2 : 0.05, ior: 1.7, envMapIntensity: 1.2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glass.position.z = -DISPLAY_DEPTH + 0.004;
    glass.raycast = () => {};
    rim.raycast = () => {};
    this.group.add(this.mesh, rim, glass);
  }

  protected override geometryFor(): THREE.BufferGeometry {
    return new THREE.PlaneGeometry(this.rect.w, this.rect.h);
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    // Powered down: dark glass, a faint scanline texture, a dim sheen.
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, W * 0.75);
    g.addColorStop(0, '#0b1313');
    g.addColorStop(1, '#030606');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(120, 160, 160, 0.035)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  }
}

/** Everything in the bays and the bubble row, built with one set of materials. */
export function buildBoard(slots: number) {
  const mats = materials();
  return {
    display: new EditDisplay(mats),
    bubbles: Array.from({ length: slots }, (_, i) => new BakeBubble(i, mats)),
    bakeAll: new BakeAllButton(mats),
    key: new BakeKey(mats),
  };
}
