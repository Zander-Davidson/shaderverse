// Chrome tubing from each knob slot to the source window. Each tube is a
// slotted chrome sleeve over a fluid core. When the slot holds a knob, the
// core is live glowing goo flowing toward the source (rendered under the
// cached cockpit, which leaves a transparent hole where the core shows); when
// empty, the core is dark and still.

import * as THREE from 'three';
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

const CORE_FRAG = /* glsl */ `
uniform float time;
uniform float len;
uniform vec3 tint;
varying vec2 vUv;
void main() {
  // vUv.x runs along the tube from the knob to the source.
  float s = vUv.x * len;
  // Goopy blobs: two travelling waves, thresholded into lumps.
  float w = sin(s * 9.0 - time * 5.0) * 0.6 + sin(s * 3.7 - time * 2.3 + 1.7) * 0.4;
  float blob = smoothstep(0.15, 0.85, w * 0.5 + 0.5);
  // Brighter toward the tube's center line, like light inside a fluid.
  float around = abs(vUv.y - 0.5) * 2.0;
  float core = 1.0 - around * around;
  vec3 col = tint * (0.5 + 1.6 * blob) * (0.6 + 0.7 * core) + vec3(1.0) * pow(blob * core, 5.0) * 0.8;
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
    this.chrome = physicalMaterial({
      color: '#c3d0d4',
      metalness: 1,
      roughness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 0.4,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [200, 520],
    });
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
    // Tubes end at a vertical manifold just right of the source window.
    const xEdge = cfg.code.x + cfg.code.w / 2;
    const xManifold = xEdge + 0.16;
    const xJog = xManifold + 0.5;
    // Slot 0 is the top knob, so lanes run top to bottom too.
    const lane = (i: number) => cfg.portal.y + ((KNOB_SLOTS - 1) / 2 - i) * 0.8;

    for (let i = 0; i < KNOB_SLOTS; i++) {
      const k = knobSlotPosition(cfg, i, KNOB_SLOTS);
      const ly = lane(i);
      const dy = ly - k.y;
      // Out of the knob horizontally, a 45° jog onto its lane, then straight in.
      const startX = k.x - size * 0.3;
      const jog = Math.abs(dy);
      const pts: [number, number][] =
        jog < 0.03
          ? [[startX, k.y], [xManifold, k.y]]
          : [[startX, k.y], [xJog + jog, k.y], [xJog, ly], [xManifold, ly]];
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

      // Collars at both ends and where the tube meets the manifold.
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

    // The manifold: a thicker vertical pipe the tubes plug into at right angles.
    const top = lane(0) + 0.35;
    const bottom = lane(KNOB_SLOTS - 1) - 0.35;
    const mpath = new THREE.CurvePath<THREE.Vector3>();
    mpath.add(new THREE.LineCurve3(this.point(cfg, xManifold, top), this.point(cfg, xManifold, bottom)));
    const manifold = new THREE.Mesh(new THREE.TubeGeometry(mpath, 64, 0.085, 24), this.chrome);
    this.group.add(manifold);
    for (const y of [top, bottom]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), this.chrome);
      cap.position.copy(this.point(cfg, xManifold, y));
      this.group.add(cap);
    }
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
