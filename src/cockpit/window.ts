// The cockpit window (docs/hanging-rig.md): one wide windscreen across the
// front of the cockpit, with the shader as the view outside. Simple strut and
// window construction: a heavy frame and sill, four struts that lean toward
// an apex above the view so the panes taper as they rise, a cross strut over
// the outer panes only, and one diagonal brace in the right-hand pane. The
// center pane is the widest and stays clear, so nothing crosses the middle of
// the shader. Beams follow the sphere wall, with bolted chrome bosses where
// they meet.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LayoutConfig } from './layout';
import { wallToWorld } from '../panels/patch';
import { chromeMaterial } from '../style/console';
import { LOW_GFX, physicalMaterial } from '../style/quality';

type P = [number, number];

/** A beam along the wall: its path in wall units, width across the wall and depth out of it. */
export interface Beam {
  points: P[];
  width: number;
  depth: number;
  closed?: boolean;
}

/** The window's outline, counterclockwise from the bottom left, in wall units. */
export function windowCorners(cfg: LayoutConfig): [P, P, P, P] {
  const w = cfg.window;
  return [
    [w.sillX[0], w.sill],
    [w.sillX[1], w.sill],
    [w.headX[1], w.head],
    [w.headX[0], w.head],
  ];
}

/** The rectangle the window spans, in wall units: center and size. */
export function windowRect(cfg: LayoutConfig) {
  const w = cfg.window;
  const x0 = Math.min(w.sillX[0], w.headX[0]);
  const x1 = Math.max(w.sillX[1], w.headX[1]);
  return { x: (x0 + x1) / 2, y: (w.sill + w.head) / 2, w: x1 - x0, h: w.head - w.sill };
}

/** Where the line from `a` toward `b` reaches height y. */
const atY = (a: P, b: P, y: number): P => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];

/** The frame, struts and brace, in wall units. Pure, so it can be tested. */
export function windowBeams(cfg: LayoutConfig): { beams: Beam[]; joints: { at: P; size: number }[] } {
  const w = cfg.window;
  const c = windowCorners(cfg);
  const apex = w.apex;
  const beams: Beam[] = [];
  const joints: { at: P; size: number }[] = [];
  // The frame all around, and a deeper sill along the bottom.
  beams.push({ points: c, width: 1.5, depth: 0.7, closed: true });
  beams.push({ points: [[c[0][0] + 0.6, w.sill - 0.55], [c[1][0] - 0.6, w.sill - 0.55]], width: 1.1, depth: 1.15 });
  // Struts from the sill toward the apex, up to the head.
  const struts = w.struts.map((x) => {
    const foot: P = [x, w.sill];
    const head = atY(foot, apex, w.head);
    return [foot, head] as [P, P];
  });
  struts.forEach(([foot, head], i) => {
    const inner = i === 1 || i === 2;
    beams.push({ points: [foot, head], width: inner ? 1.0 : 0.85, depth: inner ? 0.65 : 0.55 });
    joints.push({ at: foot, size: inner ? 1.0 : 0.85 }, { at: head, size: inner ? 1.0 : 0.85 });
  });
  // The cross strut: over the outer panes only, running a pane further on
  // the left than on the right.
  const left = atY(c[0], c[3], w.transom);
  const leftEnd = atY(struts[1]![0], struts[1]![1], w.transom);
  const rightStart = atY(struts[3]![0], struts[3]![1], w.transom);
  const right = atY(c[1], c[2], w.transom);
  beams.push({ points: [left, leftEnd], width: 0.6, depth: 0.45 });
  beams.push({ points: [rightStart, right], width: 0.6, depth: 0.45 });
  joints.push({ at: atY(struts[0]![0], struts[0]![1], w.transom), size: 0.7 }, { at: leftEnd, size: 0.7 }, { at: rightStart, size: 0.7 });
  // One diagonal brace, in the right-hand pane under the cross strut.
  beams.push({ points: [struts[3]![0], right], width: 0.5, depth: 0.4 });
  joints.push({ at: right, size: 0.7 });
  for (const corner of c) joints.push({ at: corner, size: 1.4 });
  return { beams, joints };
}

/**
 * A beam's mesh: a rounded, slightly tapered cross-section swept along its
 * path on the sphere, standing out of the wall toward the camera.
 */
function beamGeometry(beam: Beam, radius: number): THREE.BufferGeometry {
  const pts: P[] = [];
  const path = beam.closed ? [...beam.points, beam.points[0]!] : beam.points;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i]!;
    const [bx, by] = path[i + 1]!;
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.4));
    for (let j = i ? 1 : 0; j <= n; j++) pts.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n]);
  }
  if (beam.closed) pts.pop();
  // Cross-section: (across, out), out toward the camera; a broad face, chamfered sides.
  const hw = beam.width / 2;
  const d = beam.depth;
  const ch = Math.min(hw, d) * 0.35;
  const profile: P[] = [
    [-hw, -0.15], [-hw, d - ch], [-hw + ch, d], [hw - ch, d], [hw, d - ch], [hw, -0.15],
  ];
  const ring = profile.length;
  const positions: number[] = [];
  const index: number[] = [];
  const c = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const next = new THREE.Vector3();
  const t = new THREE.Vector3();
  const out = new THREE.Vector3();
  const side = new THREE.Vector3();
  const count = pts.length;
  for (let i = 0; i < count; i++) {
    const at = (k: number) => pts[beam.closed ? (k + count) % count : Math.min(count - 1, Math.max(0, k))]!;
    wallToWorld(at(i)[0], at(i)[1], radius, 0, c);
    wallToWorld(at(i - 1)[0], at(i - 1)[1], radius, 0, prev);
    wallToWorld(at(i + 1)[0], at(i + 1)[1], radius, 0, next);
    t.subVectors(next, prev).normalize();
    out.copy(c).normalize().negate();
    side.crossVectors(t, out).normalize();
    // At a corner of a closed frame, widen so the sides stay parallel.
    let k = 1;
    if (beam.closed) {
      const a = new THREE.Vector3().subVectors(c, prev).normalize();
      const b = new THREE.Vector3().subVectors(next, c).normalize();
      const cos = Math.max(0.3, Math.cos(a.angleTo(b) / 2));
      k = 1 / cos;
    }
    for (const [s, o] of profile) {
      positions.push(c.x + side.x * s * k + out.x * o, c.y + side.y * s * k + out.y * o, c.z + side.z * s * k + out.z * o);
    }
  }
  const segs = beam.closed ? count : count - 1;
  for (let i = 0; i < segs; i++) {
    const a = i * ring;
    const b = ((i + 1) % count) * ring;
    for (let j = 0; j + 1 < ring; j++) index.push(a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j);
  }
  if (!beam.closed) {
    // End caps.
    for (let j = 1; j + 1 < ring; j++) index.push(0, j + 1, j);
    const last = (count - 1) * ring;
    for (let j = 1; j + 1 < ring; j++) index.push(last, last + j, last + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  // Flat-ish facets read as machined metal; split by face for crisp chamfers.
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  flat.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((flat.getAttribute('position').count) * 2), 2));
  g.dispose();
  return flat;
}

export class CockpitWindow {
  readonly group = new THREE.Group();
  private readonly metal = physicalMaterial({ color: '#5d656c', metalness: 0.45, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  private readonly chrome = chromeMaterial({ roughness: 0.12 });

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
    const R = cfg.radius;
    const { beams, joints } = windowBeams(cfg);
    const metal = mergeGeometries(beams.map((b) => beamGeometry(b, R)));
    // A narrow chrome strip down the face of every beam catches the light.
    const strips = mergeGeometries(beams.map((b) => beamGeometry({ ...b, width: b.width * 0.16, depth: b.depth + 0.035 }, R)));
    const bosses: THREE.BufferGeometry[] = [];
    const bolts: THREE.BufferGeometry[] = [];
    const seg = LOW_GFX ? 12 : 28;
    const q = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    const Y = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    for (const j of joints) {
      const p = wallToWorld(j.at[0], j.at[1], R, 0);
      const outward = p.clone().normalize().negate();
      q.setFromUnitVectors(Y, outward);
      const lift = (h: number) => p.clone().addScaledVector(outward, h);
      const r = j.size * 0.62;
      bosses.push(new THREE.CylinderGeometry(r * 0.85, r, 0.16, seg).applyMatrix4(m.compose(lift(0.74), q, one)));
      // Four bolt heads around each boss.
      const across = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const along = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const at = lift(0.83).addScaledVector(across, Math.cos(a) * r * 0.62).addScaledVector(along, Math.sin(a) * r * 0.62);
        bolts.push(new THREE.CylinderGeometry(r * 0.12, r * 0.14, 0.06, 10).applyMatrix4(m.compose(at, q, one)));
      }
    }
    const add = (g: THREE.BufferGeometry, mat: THREE.Material) => {
      const mesh = new THREE.Mesh(g, mat);
      mesh.raycast = () => {};
      this.group.add(mesh);
    };
    add(metal, this.metal);
    add(strips, this.chrome);
    add(mergeGeometries(bosses.map((g) => g.toNonIndexed())), this.metal);
    add(mergeGeometries(bolts.map((g) => g.toNonIndexed())), this.chrome);
  }
}
