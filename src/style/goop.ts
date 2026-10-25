// The cockpit's backdrop: liquid chrome. Merged bulbous blobs and sinuous
// tubes are baked into a height field, turned into a normal map, and shaded as
// polished metal, so the strip lights' reflections trace the dome's curvature.

import * as THREE from 'three';
import { physicalMaterial } from './quality';
import type { LayoutConfig } from '../cockpit/layout';
import { spherePatchGeometry } from '../panels/patch';

/**
 * Half size of the (square) area the backdrop covers, relative to the fit
 * rectangle's half width: enough for wide and tall windows alike.
 */
const COVER = 1.75;
const FIELD_W = 320;
const FIELD_H = 320;
const MAP_W = 1792;
const MAP_H = 1792;

/** A small deterministic PRNG, so the goop is the same on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Height field in 0..1 at FIELD_W × FIELD_H, aspect-correct for `aspect`. */
export function goopField(aspect: number, seed = 7): Float32Array {
  const rand = mulberry32(seed);
  const blobs = Array.from({ length: 90 }, () => ({
    x: rand() * aspect,
    y: rand(),
    r: 0.02 + rand() ** 2 * 0.085,
    k: 0.6 + rand() * 0.8,
  }));
  // Sinuous tubes running across the dome.
  const tubes = Array.from({ length: 7 }, () => ({
    y0: rand(),
    amp: 0.04 + rand() * 0.12,
    freq: 1.5 + rand() * 4,
    phase: rand() * 6.28,
    w: 0.008 + rand() * 0.014,
  }));
  const f = new Float32Array(FIELD_W * FIELD_H);
  for (let j = 0; j < FIELD_H; j++) {
    const v = j / (FIELD_H - 1);
    for (let i = 0; i < FIELD_W; i++) {
      const u = (i / (FIELD_W - 1)) * aspect;
      // Metaball sum: blobs merge into goopy masses.
      let m = 0;
      for (const b of blobs) {
        const dx = u - b.x;
        const dy = v - b.y;
        const q = (dx * dx + dy * dy) / (b.r * b.r);
        if (q < 16) m += b.k / ((q + 1) * (q + 1));
      }
      let h = 1 - Math.exp(-m * 1.4);
      for (const t of tubes) {
        const cy = t.y0 + t.amp * Math.sin(u * t.freq + t.phase);
        const d = Math.abs(v - cy) / t.w;
        // Round tube profile, sitting on top of the goop.
        if (d < 1) h = Math.max(h, 0.55 + 0.45 * Math.sqrt(1 - d * d));
      }
      f[j * FIELD_W + i] = h;
    }
  }
  return f;
}

export class GoopShell {
  readonly mesh: THREE.Mesh;
  private readonly normal = document.createElement('canvas');
  private readonly normalTex: THREE.CanvasTexture;
  private readonly material: THREE.MeshPhysicalMaterial;

  constructor(cfg: LayoutConfig) {
    this.normal.width = MAP_W;
    this.normal.height = MAP_H;
    this.normalTex = new THREE.CanvasTexture(this.normal);
    this.normalTex.anisotropy = 8;
    this.material = physicalMaterial({
      // Dark gunmetal like the chassis, so it recedes: satin rather than mirror,
      // with soft relief. The strip lights still trace the dome's curvature.
      color: '#1f2b2e',
      metalness: 0.9,
      roughness: 0.42,
      envMapIntensity: 0.35,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
      iridescence: 0.12,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [200, 500],
      normalMap: this.normalTex,
      normalScale: new THREE.Vector2(0.9, 0.9),
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.relayout(cfg);
    this.bake(1);
  }

  relayout(cfg: LayoutConfig) {
    this.mesh.geometry.dispose();
    // Just behind everything mounted on the wall.
    const s = 2 * COVER * cfg.fitHalfWidth;
    this.mesh.geometry = spherePatchGeometry(0, 0, s, s, cfg.radius, -0.02, 128, 128);
  }

  private bake(aspect: number) {
    const field = goopField(aspect);
    // Normals straight from the float field (bilinear), so the mirror finish
    // shows no 8-bit terracing.
    const at = (x: number, y: number) => {
      const fx = Math.min(FIELD_W - 1.001, Math.max(0, x));
      const fy = Math.min(FIELD_H - 1.001, Math.max(0, y));
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const tx = fx - i;
      const ty = fy - j;
      const a = field[j * FIELD_W + i]!;
      const b = field[j * FIELD_W + i + 1]!;
      const c = field[(j + 1) * FIELD_W + i]!;
      const d = field[(j + 1) * FIELD_W + i + 1]!;
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
    const ctx = this.normal.getContext('2d')!;
    const img = ctx.createImageData(MAP_W, MAP_H);
    const sx = (FIELD_W - 1) / (MAP_W - 1);
    const sy = (FIELD_H - 1) / (MAP_H - 1);
    // Gradient per field cell, scaled to a pleasing bulge.
    const strength = 2.4;
    for (let y = 0; y < MAP_H; y++) {
      const fy = y * sy;
      for (let x = 0; x < MAP_W; x++) {
        const fx = x * sx;
        const nx = -(at(fx + 0.5, fy) - at(fx - 0.5, fy)) * strength;
        // Canvas y runs down; texture v runs up.
        const ny = (at(fx, fy + 0.5) - at(fx, fy - 0.5)) * strength;
        const len = Math.hypot(nx, ny, 1);
        const k = (y * MAP_W + x) * 4;
        img.data[k] = ((nx / len) * 0.5 + 0.5) * 255;
        img.data[k + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        img.data[k + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.normalTex.needsUpdate = true;
  }
}
