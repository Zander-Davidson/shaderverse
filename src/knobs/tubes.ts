// Chrome tubing from each knob slot to the source window. Each tube is a
// slotted chrome sleeve over a fluid core. When the slot holds a knob, the
// core is live glowing goo flowing toward the source (rendered under the
// cached cockpit, which leaves a transparent hole where the core shows); when
// empty, the core is dark and still.

import * as THREE from 'three';
import { gunmetalMaterial } from '../style/chassis';
import { physicalMaterial } from '../style/quality';
import { HOLE_VERT, UNDER_LAYER } from '../cockpit/compositor';
import { knobSlotPosition, type LayoutConfig } from '../cockpit/layout';
import { wallToWorld } from '../panels/patch';
import { KNOB_SLOTS } from '../project/schema';

const SLEEVE_R = 0.05;
const CORE_R = 0.032;
/** Tube centerline height above the wall; under the knob caps, over the faces. */
const INSET = 0.05;
const FILLET = 0.12;
/** Spacing of the lanes where tubes enter the source. */
const LANE_GAP = 0.45;
/** Steepness of the angled runs (60°), and their spacing along x. */
const RUN_SLOPE = Math.sqrt(3);
const RUN_GAP = 0.3;
/** Clearance between a knob and the start of its tube's angled run. */
const KNOB_CLEAR = 0.25;

const CORE_FRAG = /* glsl */ `
uniform float time;
uniform float len;
uniform vec3 tint;
varying vec2 vUv;
void main() {
  // vUv.x runs along the tube from the knob to the source.
  float s = vUv.x * len;
  // Goopy blobs: two travelling waves, thresholded into lumps.
  float w = sin(s * 9.0 - time * 1.8) * 0.6 + sin(s * 3.7 - time * 0.8 + 1.7) * 0.4;
  float blob = smoothstep(0.15, 0.85, w * 0.5 + 0.5);
  // Brighter toward the tube's center line, like light inside a fluid.
  float around = abs(vUv.y - 0.5) * 2.0;
  float core = 1.0 - around * around;
  vec3 col = tint * (0.3 + 0.6 * blob) * (0.6 + 0.5 * core) + vec3(1.0) * pow(blob * core, 5.0) * 0.15;
  gl_FragColor = vec4(col, 1.0);
}
`;

const CORE_HOLE_FRAG = /* glsl */ `
void main() { gl_FragColor = vec4(0.0); }
`;

/** Alpha pattern for the sleeve: chrome bands with windows onto the core. */
function slotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 64, 4);
  ctx.fillStyle = '#000';
  // Narrow windows between long chrome bands.
  ctx.fillRect(22, 0, 20, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  return t;
}

interface Tube {
  sleeve: THREE.Mesh;
  liveCore: THREE.Mesh;
  hole: THREE.Mesh;
  deadCore: THREE.Mesh;
  coreMat: THREE.ShaderMaterial;
  group: THREE.Group;
}

export class KnobTubes {
  readonly group = new THREE.Group();
  private tubes: Tube[] = [];
  private readonly chrome: THREE.MeshPhysicalMaterial;
  private readonly sleeveMats: THREE.MeshPhysicalMaterial[] = [];
  private readonly holeMat = new THREE.ShaderMaterial({ vertexShader: HOLE_VERT, fragmentShader: CORE_HOLE_FRAG, blending: THREE.NoBlending });
  private readonly deadMat = physicalMaterial({ color: '#0d1a1a', metalness: 0.2, roughness: 0.25, clearcoat: 1 });
  private readonly slots = slotTexture();

  constructor(cfg: LayoutConfig) {
    this.chrome = gunmetalMaterial();
    this.relayout(cfg);
  }

  private point(cfg: LayoutConfig, x: number, y: number, inset = INSET) {
    return wallToWorld(x, y, cfg.radius, inset);
  }

  /** A polyline in wall coordinates with rounded corners, as a world-space curve. */
  private route(cfg: LayoutConfig, pts: [number, number][]): THREE.CurvePath<THREE.Vector3> {
    const path = new THREE.CurvePath<THREE.Vector3>();
    let from = new THREE.Vector2(...pts[0]!);
    for (let i = 1; i < pts.length; i++) {
      const corner = new THREE.Vector2(...pts[i]!);
      const next = pts[i + 1] ? new THREE.Vector2(...pts[i + 1]!) : null;
      if (!next) {
        path.add(new THREE.LineCurve3(this.point(cfg, from.x, from.y), this.point(cfg, corner.x, corner.y)));
        break;
      }
      const r = Math.min(FILLET, corner.distanceTo(from) / 2, corner.distanceTo(next) / 2);
      const a = corner.clone().add(from.clone().sub(corner).normalize().multiplyScalar(r));
      const b = corner.clone().add(next.clone().sub(corner).normalize().multiplyScalar(r));
      path.add(new THREE.LineCurve3(this.point(cfg, from.x, from.y), this.point(cfg, a.x, a.y)));
      path.add(new THREE.QuadraticBezierCurve3(this.point(cfg, a.x, a.y), this.point(cfg, corner.x, corner.y), this.point(cfg, b.x, b.y)));
      from = b;
    }
    return path;
  }

  relayout(cfg: LayoutConfig) {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.tubes = [];
    const size = cfg.knobRing.size;
    // Tubes plug straight into the source window's right edge on lanes packed
    // down from its top. Slot 0 is the top knob, so lanes run top to bottom too.
    const xEdge = cfg.code.x + cfg.code.w / 2;
    const top = cfg.code.y + cfg.code.h / 2 - cfg.cornerRadius - 0.3;
    const lane = (i: number) => top - i * LANE_GAP;
    const bends = this.diagonals(cfg, lane);

    for (let i = 0; i < KNOB_SLOTS; i++) {
      const k = knobSlotPosition(cfg, i, KNOB_SLOTS);
      const ly = lane(i);
      const dy = ly - k.y;
      // Like a circuit trace: out of the knob, an angled run onto its lane, then in.
      const startX = k.x - size * 0.3;
      const c = bends[i]!;
      const pts: [number, number][] =
        Math.abs(dy) < 0.03
          ? [[startX, k.y], [xEdge, k.y]]
          : [[startX, k.y], [c.at(k.y), k.y], [c.at(ly), ly], [xEdge, ly]];
      const path = this.route(cfg, pts);
      const len = path.getLength();
      const segs = Math.max(48, Math.round(len * 40));

      const sleeveMat = this.chrome.clone();
      sleeveMat.alphaTest = 0.5;
      sleeveMat.side = THREE.DoubleSide;
      const sm = this.slots.clone();
      sm.repeat.set(len / 0.24, 1);
      sm.needsUpdate = true;
      sleeveMat.alphaMap = sm;
      this.sleeveMats.push(sleeveMat);
      const sleeve = new THREE.Mesh(new THREE.TubeGeometry(path, segs, SLEEVE_R, 18), sleeveMat);

      const coreGeo = new THREE.TubeGeometry(path, segs, CORE_R, 12);
      const coreMat = new THREE.ShaderMaterial({
        vertexShader: HOLE_VERT,
        fragmentShader: CORE_FRAG,
        uniforms: { time: { value: 0 }, len: { value: len }, tint: { value: new THREE.Color('#3ff2c4') } },
        toneMapped: false,
      });
      const liveCore = new THREE.Mesh(coreGeo, coreMat);
      liveCore.layers.set(UNDER_LAYER);
      const hole = new THREE.Mesh(coreGeo, this.holeMat);
      const deadCore = new THREE.Mesh(coreGeo, this.deadMat);

      // Collars at the knob and where the tube enters the source.
      const g = new THREE.Group();
      g.add(sleeve, liveCore, hole, deadCore);
      for (const t of [0, 1]) {
        const p = path.getPointAt(t);
        const tan = path.getTangentAt(t);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(SLEEVE_R * 1.45, SLEEVE_R * 1.45, 0.07, 20), this.chrome);
        collar.position.copy(p);
        collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
        g.add(collar);
      }
      this.group.add(g);
      this.tubes.push({ sleeve, liveCore, hole, deadCore, coreMat, group: g });
      this.setActive(i, false);
    }
  }

  /**
   * Where each tube's angled run sits, as x along it for a given y. Falling
   * runs lie on lines y − s·x = c and rising ones on −y − s·x = c (s the
   * slope); within each group the runs are parallel and nested, pushed as
   * near their knobs as they can go and RUN_GAP apart, so no two tubes cross.
   */
  private diagonals(cfg: LayoutConfig, lane: (i: number) => number): { at: (y: number) => number }[] {
    const out: { at: (y: number) => number }[] = [];
    const knobs = Array.from({ length: KNOB_SLOTS }, (_, i) => ({ i, k: knobSlotPosition(cfg, i, KNOB_SLOTS), ly: lane(i) }));
    const startX = (x: number) => x - cfg.knobRing.size * 0.3;
    // Falling runs: the lowest goes nearest its knob, each higher one further out.
    let next = -Infinity;
    for (const { i, k } of knobs.filter((t) => t.ly < t.k.y).reverse()) {
      const c = Math.max(k.y - RUN_SLOPE * (startX(k.x) - KNOB_CLEAR), next + RUN_GAP * RUN_SLOPE);
      out[i] = { at: (y) => (y - c) / RUN_SLOPE };
      next = c;
    }
    // Rising runs mirror that: the highest goes nearest its knob.
    next = -Infinity;
    for (const { i, k } of knobs.filter((t) => t.ly >= t.k.y)) {
      const c = Math.max(-k.y - RUN_SLOPE * (startX(k.x) - KNOB_CLEAR), next + RUN_GAP * RUN_SLOPE);
      out[i] = { at: (y) => (-y - c) / RUN_SLOPE };
      next = c;
    }
    return out;
  }

  /** Active slots run live glowing fluid in the knob's tint; empty ones are dark. */
  setActive(slot: number, active: boolean, tint?: string): void {
    const t = this.tubes[slot];
    if (!t) return;
    t.liveCore.visible = active;
    t.hole.visible = active;
    t.deadCore.visible = !active;
    if (tint) t.coreMat.uniforms.tint!.value.set(tint);
  }

  /** Advances the fluid; only the live cores change, so the cache stays valid. */
  update(time: number): void {
    for (const t of this.tubes) if (t.liveCore.visible) t.coreMat.uniforms.time!.value = time;
  }

  tubeGroup(slot: number): THREE.Object3D | null {
    return this.tubes[slot]?.group ?? null;
  }
}
