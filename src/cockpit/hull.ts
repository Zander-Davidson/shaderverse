// Circuitry inlaid in the hull: thick tubing laid half sunk in the shell,
// routed like traces on a board. Traces start at nodes around the portal's
// collar and run outward from it, jogging at 45°, branching at nodes and
// ending in capped nodes. Spacing, thickness and reach are uneven, so the
// pattern is asymmetric while still radiating from the portal. Real
// geometry, so it stays as crisp as the rig in front of it. Generated from a
// fixed seed: the same hull on every load.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bezelRadius, knobSlotPosition, type LayoutConfig } from './layout';
import { wallToWorld } from '../panels/patch';
import { chromeMaterial } from '../style/console';
import { LOW_GFX, physicalMaterial } from '../style/quality';
import { KNOB_SLOTS } from '../project/schema';

/** A small deterministic PRNG. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P = [number, number];

/** A trace: its corners in wall units, and its tube radius. */
export interface Trace {
  points: P[];
  radius: number;
}

/** A node: a round boss where traces start, branch or end. */
export interface Node {
  at: P;
  radius: number;
  lit: boolean;
}

/** Wall units from a trace's centerline that another must keep clear, beyond both radii. */
const GAP = 0.14;
/** How far out the traces may run, in wall units from the portal's center. */
const REACH = 24;

function segDist(p: P, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

function segSegDist(a: P, b: P, c: P, d: P): number {
  // Close enough for short segments: endpoints against the other segment, plus midpoints.
  const m1: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m2: P = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2];
  return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b), segDist(m1, c, d), segDist(m2, a, b));
}

/** Lays out the circuit, in wall units, for a layout. Pure, so it can be tested. */
export function layoutCircuit(cfg: LayoutConfig, seed = 7): { traces: Trace[]; nodes: Node[] } {
  const rand = mulberry32(seed);
  const cx = cfg.portal.x;
  const cy = cfg.portal.y;
  const at = (r: number, a: number): P => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const traces: Trace[] = [];
  const nodes: Node[] = [];
  const placed: { a: P; b: P; r: number }[] = [];

  // Keep clear of the knob row (until the console takes the knobs).
  const k0 = knobSlotPosition(cfg, 0, KNOB_SLOTS);
  const k1 = knobSlotPosition(cfg, KNOB_SLOTS - 1, KNOB_SLOTS);
  const kh = cfg.knobRow.size * 0.75;
  const blocked = (p: P) => p[0] > k0.x - kh && p[0] < k1.x + kh && p[1] > k0.y - kh && p[1] < k0.y + kh;
  const free = (a: P, b: P, r: number, skip: number) => {
    for (let i = 0; i < 6; i++) if (blocked([a[0] + ((b[0] - a[0]) * i) / 5, a[1] + ((b[1] - a[1]) * i) / 5])) return false;
    for (let i = 0; i < placed.length - skip; i++) {
      const s = placed[i]!;
      if (segSegDist(a, b, s.a, s.b) < r + s.r + GAP) return false;
    }
    return true;
  };

  const r0 = bezelRadius(cfg) + 0.32;
  const grow = (startR: number, startA: number, radius: number, depth: number) => {
    let r = startR;
    let a = startA;
    const pts: P[] = [at(r, a)];
    let mine = 0;
    const add = (nr: number, na: number) => {
      const p = at(nr, na);
      const prev = pts[pts.length - 1]!;
      // Its own last segment touches this one; skip it in the clearance check.
      if (!free(prev, p, radius, mine ? 1 : 0)) return false;
      placed.push({ a: prev, b: p, r: radius });
      mine++;
      pts.push(p);
      r = nr;
      a = na;
      return true;
    };
    const jog = (sign: number) => {
      const side = sign * (0.5 + rand() * 1.6);
      return add(r + Math.abs(side), a + side / r);
    };
    while (r < REACH) {
      // A radial run, then sometimes a 45° jog sideways. Blocked, it jogs
      // around whatever is in the way before giving up.
      const sign = rand() < 0.5 ? -1 : 1;
      if (!add(r + 0.9 + rand() * 2.6, a) && !jog(sign) && !jog(-sign)) break;
      if (rand() < 0.5) jog(rand() < 0.5 ? -1 : 1);
      // Branch: a thinner trace splitting off at a node.
      if (depth < 3 && rand() < 0.32 && r > r0 + 1) {
        nodes.push({ at: at(r, a), radius: radius * 1.9, lit: rand() < 0.35 });
        const dir = rand() < 0.5 ? -1 : 1;
        const jog = (0.7 + rand()) * dir;
        branches.push([r + Math.abs(jog), a + jog / r, Math.max(0.08, radius * 0.65), depth + 1, at(r, a)]);
      }
      // Ends grow likelier farther out.
      if (rand() < 0.02 + (r / REACH) * 0.12) break;
    }
    if (pts.length < 2) return;
    traces.push({ points: pts, radius });
    nodes.push({ at: pts[pts.length - 1]!, radius: radius * 1.7, lit: rand() < 0.25 });
  };
  const branches: [number, number, number, number, P][] = [];

  // Roots around the collar at uneven angles: some clustered, some gaps.
  let a = rand() * Math.PI * 2;
  const end = a + Math.PI * 2 - 0.15;
  while (a < end) {
    const t = rand();
    const radius = t < 0.3 ? 0.28 : t < 0.7 ? 0.19 : 0.12;
    nodes.push({ at: at(r0, a), radius: radius * 1.6, lit: false });
    grow(r0, a, radius, 0);
    a += 0.17 + rand() ** 2 * 0.45;
  }
  // Branches, from where they split off: a short diagonal stub, then their own run.
  for (let i = 0; i < branches.length; i++) {
    const [r, br, radius, depth, from] = branches[i]!;
    const p = at(r, br);
    if (!free(from, p, radius, 0)) continue;
    placed.push({ a: from, b: p, r: radius });
    const before = traces.length;
    grow(r, br, radius, depth);
    if (traces.length > before) traces[traces.length - 1]!.points.unshift(from);
  }
  return { traces, nodes };
}

export class HullCircuit {
  readonly group = new THREE.Group();
  private readonly metal = physicalMaterial({ color: '#4c5257', metalness: 0.9, roughness: 0.28, clearcoat: 0.3, clearcoatRoughness: 0.2 });
  private readonly chrome = chromeMaterial({ roughness: 0.12 });
  private readonly lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3ff2c4').multiplyScalar(0.75), toneMapped: false });

  constructor(cfg: LayoutConfig) {
    this.build(cfg);
  }

  relayout(cfg: LayoutConfig): void {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      (o as THREE.Mesh).geometry?.dispose();
    }
    this.build(cfg);
  }

  private build(cfg: LayoutConfig): void {
    const { traces, nodes } = layoutCircuit(cfg);
    const R = cfg.radius;
    const radial = LOW_GFX ? 6 : 12;
    const tubes: THREE.BufferGeometry[] = [];
    for (const t of traces) {
      // Follow the sphere: sample each straight run densely, keeping the corners.
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i + 1 < t.points.length; i++) {
        const [ax, ay] = t.points[i]!;
        const [bx, by] = t.points[i + 1]!;
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.3));
        for (let j = i ? 1 : 0; j <= n; j++) pts.push(wallToWorld(ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n, R, 0));
      }
      // Mostly sunk: the centerline a little above the shell's surface.
      for (const p of pts) p.multiplyScalar(1 - (t.radius * 0.3) / R);
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      tubes.push(new THREE.TubeGeometry(curve, pts.length * 2, t.radius, radial, false));
    }
    const bosses: THREE.BufferGeometry[] = [];
    const caps: THREE.BufferGeometry[] = [];
    const lamps: THREE.BufferGeometry[] = [];
    const q = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    const Y = new THREE.Vector3(0, 1, 0);
    for (const n of nodes) {
      const p = wallToWorld(n.at[0], n.at[1], R, 0);
      // Facing the sphere's center.
      q.setFromUnitVectors(Y, p.clone().negate().normalize());
      const place = (g: THREE.BufferGeometry, lift: number) => {
        const pos = p.clone().addScaledVector(p.clone().normalize(), -lift);
        return g.applyMatrix4(m.compose(pos, q, new THREE.Vector3(1, 1, 1)));
      };
      const h = n.radius * 0.6;
      bosses.push(place(new THREE.CylinderGeometry(n.radius * 0.82, n.radius, h, radial * 2), h / 2 - 0.02));
      caps.push(place(new THREE.CylinderGeometry(n.radius * 0.5, n.radius * 0.6, 0.03, radial * 2), h));
      if (n.lit) lamps.push(place(new THREE.CircleGeometry(n.radius * 0.32, 20).rotateX(-Math.PI / 2), h + 0.016));
    }
    const add = (gs: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!gs.length) return;
      const merged = mergeGeometries(gs);
      for (const g of gs) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.raycast = () => {};
      this.group.add(mesh);
    };
    add([...tubes, ...bosses], this.metal);
    add(caps, this.chrome);
    add(lamps, this.lamp);
  }
}
