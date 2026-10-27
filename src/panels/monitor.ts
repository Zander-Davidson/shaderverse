// A panel shown on a hanging monitor (docs/hanging-rig.md): a convex screen
// in a filleted chrome bezel on a thin, flat-backed case, hung in rig space.
// Geometry is built in panel units, centered, facing local +z; the rig group
// carries the monitor's frame and scale. Panels still draw in their own pixel
// coordinates and never know the screen bulges.

import * as THREE from 'three';
import type { HungLayout, LayoutConfig } from '../cockpit/layout';
import { monitorFrame } from '../cockpit/rig';
import { LOW_GFX, physicalMaterial } from '../style/quality';
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
/** How far the glass sits in front of the image, so reflections read as a layer over it. */
const GLASS_GAP = 0.012;

/**
 * CRT touches on the image, all subtle: the corners darken toward the bezel,
 * and fine scanlines fade out wherever they would be finer than a screen
 * pixel, so they never shimmer.
 */
const CRT_FRAG = /* glsl */ `
#include <map_fragment>
{
  vec2 q = (vMapUv - 0.5) / crtOpening;
  float r = length(q * q * q * q);
  diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(0.15, 1.0, r) - 0.08 * dot(q, q) * 0.5;
  float lines = vMapUv.y * crtLines;
  float aa = clamp(1.6 - fwidth(lines) * 2.0, 0.0, 1.0);
  diffuseColor.rgb *= 1.0 - 0.07 * aa * (0.5 + 0.5 * cos(6.2831853 * lines));
}
`;

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
let glassMaterial: THREE.MeshPhysicalMaterial | null = null;

/** Sets what every monitor's glass reflects (the cockpit's environment until then). */
export function setGlassEnvironment(tex: THREE.Texture | null): void {
  if (!glassMaterial) return;
  glassMaterial.envMap = tex;
  glassMaterial.needsUpdate = true;
}

export abstract class MonitorPanel extends CanvasPanel {
  /** The whole monitor: screen, bezel and case, posed in the cockpit. */
  readonly rig = new THREE.Group();
  private readonly bezelMesh: THREE.Mesh;
  private readonly caseMesh: THREE.Mesh;
  /** Reflective glass over the image: black, so only its reflections add light. */
  private readonly glassMesh: THREE.Mesh;
  private readonly crt = { crtOpening: { value: new THREE.Vector2(0.5, 0.5) }, crtLines: { value: 1 } };
  private scale = 1;
  /** A screen bulges under glass; a plate (the console's face) is flat and printed. */
  private readonly flat: boolean;

  constructor(m: HungLayout, pixelWidth: number, pixelHeight: number, kind: 'screen' | 'plate' = 'screen') {
    super({ x: 0, y: 0, w: m.w, h: m.h }, pixelWidth, pixelHeight, 0, 0);
    this.flat = kind === 'plate';
    bezelMaterial ??= chromeMaterial();
    caseMaterial ??= physicalMaterial({ color: '#2a2c2e', metalness: 0.85, roughness: 0.42 });
    this.bezelMesh = new THREE.Mesh(new THREE.BufferGeometry(), bezelMaterial);
    this.caseMesh = new THREE.Mesh(new THREE.BufferGeometry(), caseMaterial);
    // Black and additive: the image shows through untouched and the glass
    // adds the cockpit's reflection, strongest toward the edges (fresnel).
    glassMaterial ??= physicalMaterial({
      color: '#000000',
      metalness: 0,
      roughness: LOW_GFX ? 0.2 : 0.06,
      ior: 1.7,
      envMapIntensity: 1.3,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glassMesh = new THREE.Mesh(new THREE.BufferGeometry(), glassMaterial);
    this.glassMesh.raycast = () => {};
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.crt);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec2 crtOpening;\nuniform float crtLines;\nvoid main() {')
        .replace('#include <map_fragment>', CRT_FRAG);
    };
    this.material.customProgramCacheKey = () => 'crt-monitor';
    this.rig.add(this.mesh, this.bezelMesh, this.caseMesh);
    if (this.flat) {
      this.material.onBeforeCompile = () => {};
      this.material.customProgramCacheKey = () => '';
    } else {
      this.rig.add(this.glassMesh);
    }
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
      pos.setZ(i, !inside ? -0.01 : this.flat ? 0 : bulgeAt(x, y, o.hw, o.hh));
    }
    g.computeVertexNormals();
    return g;
  }

  /** Hangs the monitor for a layout: rebuilds its screen, bezel and case and poses it. */
  hang(cfg: LayoutConfig, m: HungLayout): void {
    this.rect = { x: 0, y: 0, w: m.w, h: m.h };
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.geometryFor();
    this.buildBody();
    this.buildGlass();
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

  private buildGlass(): void {
    const o = this.opening;
    if (!o) return;
    const g = new THREE.PlaneGeometry(2 * o.hw, 2 * o.hh, 48, Math.max(12, Math.round((48 * o.hh) / o.hw)));
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setZ(i, bulgeAt(pos.getX(i), pos.getY(i), o.hw, o.hh) + GLASS_GAP);
    g.computeVertexNormals();
    this.glassMesh.geometry.dispose();
    this.glassMesh.geometry = g;
    // The opening in texture coordinates, and one scanline per three texels.
    this.crt.crtOpening.value.set(o.hw / this.rect.w, o.hh / this.rect.h);
    this.crt.crtLines.value = this.pixelHeight / 3;
  }

  /** World position of panel pixel (x, y) on the screen, `lift` world units off its surface. */
  pointAt(px: number, py: number, lift = 0, out = new THREE.Vector3()): THREE.Vector3 {
    const { w, h } = this.rect;
    const x = (px / this.pixelWidth - 0.5) * w;
    const y = (0.5 - py / this.pixelHeight) * h;
    const o = this.opening;
    const z = o && !this.flat ? bulgeAt(x, y, o.hw, o.hh) : 0;
    this.rig.updateMatrixWorld(true);
    return out.set(x, y, z + lift / this.scale).applyMatrix4(this.mesh.matrixWorld);
  }

  /** World units per panel unit. */
  get worldScale(): number {
    return this.scale;
  }
}
