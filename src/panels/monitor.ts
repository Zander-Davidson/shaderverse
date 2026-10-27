// A panel shown on a hanging monitor (docs/hanging-rig.md): a convex screen
// in a filleted chrome bezel on a thin, flat-backed case, hung in rig space.
// Geometry is built in panel units, centered, facing local +z; the rig group
// carries the monitor's frame and scale. Panels still draw in their own pixel
// coordinates and never know the screen bulges.

import * as THREE from 'three';
import type { LayoutConfig, MonitorLayout } from '../cockpit/layout';
import { monitorFrame } from '../cockpit/rig';
import { physicalMaterial } from '../style/quality';
import { chromeMaterial, wallShape, type WallShape } from '../style/console';
import { CanvasPanel } from './panel';

/** How far the middle of the screen bulges toward the viewer, as a fraction of its shorter side. */
export const BULGE = 0.025;
/** How far the bezel's front face stands proud of the screen's edge, in panel units. */
const LIP = 0.05;
/** Bezel depth front to back, and the fillet rolling over its edges. */
const BEZEL_DEPTH = 0.12;
const FILLET = 0.045;
/** Depth of the case behind the bezel. */
const CASE_DEPTH = 0.3;

/** Height of the convex screen above its edge at (x, y), for a screen opening of half size hw × hh. */
export function bulgeAt(x: number, y: number, hw: number, hh: number): number {
  const sx = Math.min(1, Math.abs(x) / hw);
  const sy = Math.min(1, Math.abs(y) / hh);
  return BULGE * 2 * Math.min(hw, hh) * (1 - sx * sx) * (1 - sy * sy);
}

function roundedRect(path: THREE.Path, s: WallShape, grow = 0): void {
  const hw = s.hw + grow;
  const hh = s.hh + grow;
  const r = Math.max(0.001, Math.min(s.corner + grow, hw, hh));
  const x0 = s.cx - hw;
  const y0 = s.cy - hh;
  path.moveTo(x0 + r, y0);
  path.lineTo(x0 + 2 * hw - r, y0);
  path.absarc(x0 + 2 * hw - r, y0 + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x0 + 2 * hw, y0 + 2 * hh - r);
  path.absarc(x0 + 2 * hw - r, y0 + 2 * hh - r, r, 0, Math.PI / 2, false);
  path.lineTo(x0 + r, y0 + 2 * hh);
  path.absarc(x0 + r, y0 + 2 * hh - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(x0, y0 + r);
  path.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
}

let caseMaterial: THREE.MeshPhysicalMaterial | null = null;
let bezelMaterial: THREE.MeshPhysicalMaterial | null = null;

export abstract class MonitorPanel extends CanvasPanel {
  /** The whole monitor: screen, bezel and case, posed in the cockpit. */
  readonly rig = new THREE.Group();
  private readonly bezelMesh: THREE.Mesh;
  private readonly caseMesh: THREE.Mesh;
  private scale = 1;

  constructor(m: MonitorLayout, pixelWidth: number, pixelHeight: number) {
    super({ x: 0, y: 0, w: m.w, h: m.h }, pixelWidth, pixelHeight, 0, 0);
    bezelMaterial ??= chromeMaterial();
    caseMaterial ??= physicalMaterial({ color: '#2a2c2e', metalness: 0.85, roughness: 0.42 });
    this.bezelMesh = new THREE.Mesh(new THREE.BufferGeometry(), bezelMaterial);
    this.caseMesh = new THREE.Mesh(new THREE.BufferGeometry(), caseMaterial);
    this.rig.add(this.mesh, this.bezelMesh, this.caseMesh);
  }

  /** The screen opening in panel units, once a bezel is set. */
  private get opening(): WallShape | null {
    return this.shape ? wallShape(this.rect, this.pixelWidth, this.pixelHeight, this.shape) : null;
  }

  protected override geometryFor(): THREE.BufferGeometry {
    const { w, h } = this.rect;
    const g = new THREE.PlaneGeometry(w, h, 64, Math.max(16, Math.round((64 * h) / w)));
    const o = this.opening;
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Tucked a hair under the bezel's lip outside the opening.
      const inside = o && Math.abs(x) <= o.hw && Math.abs(y) <= o.hh;
      pos.setZ(i, inside ? bulgeAt(x, y, o.hw, o.hh) : -0.01);
    }
    g.computeVertexNormals();
    return g;
  }

  /** Hangs the monitor for a layout: rebuilds its screen, bezel and case and poses it. */
  hang(cfg: LayoutConfig, m: MonitorLayout): void {
    this.rect = { x: 0, y: 0, w: m.w, h: m.h };
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.geometryFor();
    this.buildBody();
    const f = monitorFrame(cfg, m);
    this.scale = f.scale;
    this.rig.position.copy(f.position);
    this.rig.quaternion.copy(f.quaternion);
    this.rig.scale.setScalar(f.scale);
    this.rig.updateMatrixWorld(true);
  }

  private buildBody(): void {
    const outer = this.outerShape && wallShape(this.rect, this.pixelWidth, this.pixelHeight, this.outerShape);
    const opening = this.opening;
    if (!outer || !opening) return;
    // The bezel: a frame whose bevel rolls over its outer edge and its lip,
    // which overhangs the screen's edge.
    const frame = new THREE.Shape();
    roundedRect(frame, outer, -FILLET);
    const hole = new THREE.Path();
    roundedRect(hole, opening, FILLET * 0.6);
    frame.holes.push(hole);
    this.bezelMesh.geometry.dispose();
    this.bezelMesh.geometry = new THREE.ExtrudeGeometry(frame, {
      depth: BEZEL_DEPTH,
      bevelEnabled: true,
      bevelThickness: FILLET,
      bevelSize: FILLET,
      bevelSegments: 5,
      curveSegments: 16,
    });
    this.bezelMesh.position.z = LIP - BEZEL_DEPTH - FILLET;
    // The case: a thin slab behind the bezel, a little inside its outline.
    const back = new THREE.Shape();
    roundedRect(back, outer, -0.08);
    this.caseMesh.geometry.dispose();
    this.caseMesh.geometry = new THREE.ExtrudeGeometry(back, {
      depth: CASE_DEPTH,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
      curveSegments: 12,
    });
    this.caseMesh.position.z = this.bezelMesh.position.z - CASE_DEPTH;
  }

  /** World position of panel pixel (x, y) on the screen, `lift` world units off its surface. */
  pointAt(px: number, py: number, lift = 0, out = new THREE.Vector3()): THREE.Vector3 {
    const { w, h } = this.rect;
    const x = (px / this.pixelWidth - 0.5) * w;
    const y = (0.5 - py / this.pixelHeight) * h;
    const o = this.opening;
    const z = o ? bulgeAt(x, y, o.hw, o.hh) : 0;
    this.rig.updateMatrixWorld(true);
    return out.set(x, y, z + lift / this.scale).applyMatrix4(this.mesh.matrixWorld);
  }

  /** World units per panel unit. */
  get worldScale(): number {
    return this.scale;
  }
}
