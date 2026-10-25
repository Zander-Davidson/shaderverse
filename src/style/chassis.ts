// The raised chrome chassis around a panel's screen. It is a separate lit mesh
// in front of the screen with a hole where the screen shows through, so the
// screen sits recessed and shows parallax as the camera moves. Bevels, lips
// and rivets come from a painted height map turned into a normal map.

import * as THREE from 'three';
import { physicalMaterial } from './quality';
import { PanelShape, type Circle } from '../panels/shape';
import { spherePatchGeometry } from '../panels/patch';
import type { Rect } from '../cockpit/layout';

/** How far the chassis stands in front of its screen, in world units. */
export const CHASSIS_DEPTH = 0.07;

/** Wall units the metal's light-to-dark sweep spans, the same on every panel. */
const SWEEP_UNITS = 8;

export interface ChassisStyle {
  /** Base metal, dark to light. */
  metal: [string, string, string];
  /** Small emissive details (LEDs, channel lights). */
  glow: string;
  /** Thin-film iridescence strength, 0–1. */
  iridescence: number;
}

export const GUNMETAL: ChassisStyle = {
  metal: ['#0d1418', '#33464d', '#8fa7ad'],
  glow: '#3ff2c4',
  iridescence: 0.55,
};

/**
 * The chassis metal as a plain material, for the cockpit's other hardware
 * (knobs, tubing, the portal bezel), so everything reads as one finish.
 */
export function gunmetalMaterial(style: ChassisStyle = GUNMETAL): THREE.MeshPhysicalMaterial {
  return physicalMaterial({
    color: '#4a6168',
    metalness: 0.92,
    roughness: 0.3,
    clearcoat: 0.6,
    clearcoatRoughness: 0.18,
    iridescence: style.iridescence,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
  });
}

/** The screen opening inside an outer silhouette, `bezel` pixels in. */
export function screenShapeFor(outer: PanelShape, bezel: number): PanelShape {
  const cut: Circle | null = outer.cut ? { ...outer.cut, r: outer.cut.r + bezel } : null;
  return new PanelShape(outer.width, outer.height, Math.max(10, outer.corner - bezel * 0.6), cut, outer.inset + bezel);
}

/** A shape's region grown by `d` pixels (negative shrinks). */
function grown(s: PanelShape, d: number): PanelShape {
  return new PanelShape(
    s.width,
    s.height,
    Math.max(0, s.corner + d),
    s.cut ? { ...s.cut, r: Math.max(0, s.cut.r - d) } : null,
    s.inset - d,
  );
}

/** Adds the region's path (rounded rect minus cut) and clips to it. */
function clipRegion(ctx: CanvasRenderingContext2D, s: PanelShape, scale: number) {
  ctx.beginPath();
  ctx.roundRect(s.inset * scale, s.inset * scale, (s.width - 2 * s.inset) * scale, (s.height - 2 * s.inset) * scale, s.corner * scale);
  ctx.clip();
  if (s.cut) {
    ctx.beginPath();
    ctx.rect(0, 0, s.width * scale, s.height * scale);
    ctx.arc(s.cut.x * scale, s.cut.y * scale, s.cut.r * scale, 0, Math.PI * 2, true);
    ctx.clip();
  }
}

function fillRegion(ctx: CanvasRenderingContext2D, s: PanelShape, scale: number, style: string) {
  ctx.save();
  clipRegion(ctx, s, scale);
  ctx.fillStyle = style;
  ctx.fillRect(0, 0, s.width * scale, s.height * scale);
  ctx.restore();
}

const gray = (v: number) => {
  const c = Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${c},${c},${c})`;
};

/** Rivet positions: inside the bezel band, spread along the outline. */
function rivets(outer: PanelShape, bezel: number): { x: number; y: number }[] {
  const i = outer.inset + bezel / 2;
  const { width: W, height: H } = outer;
  const c = outer.corner * 0.42 + bezel * 0.3;
  const pts = [
    { x: i + c, y: i + c },
    { x: W - i - c, y: i + c },
    { x: i + c, y: H - i - c },
    { x: W - i - c, y: H - i - c },
    { x: W / 2, y: i },
    { x: W / 2, y: H - i },
    { x: i, y: H / 2 },
    { x: W - i, y: H / 2 },
  ];
  // Only where there is chassis (not in the cut or the screen).
  const screen = screenShapeFor(outer, bezel);
  return pts.filter((p) => outer.contains(p.x, p.y) && !screen.contains(p.x, p.y));
}

/**
 * Drops the triangles of a panel-sized grid that lie wholly in the screen
 * opening or wholly outside the silhouette. Those pixels would be discarded by
 * the alpha test anyway, but only after the full metal shading had run on
 * them, which made the chassis the costliest thing in the cockpit to draw.
 */
export function ringOnly(g: THREE.BufferGeometry, outer: PanelShape, screen: PanelShape): THREE.BufferGeometry {
  const uv = g.getAttribute('uv');
  const index = g.getIndex()!;
  const W = outer.width;
  const H = outer.height;
  // A triangle sits in one grid cell, so every point of it is within a cell
  // diagonal of each corner: shapes moved by that much make the tests safe.
  let cell = 0;
  for (let t = 0; t < 3; t++) {
    const a = index.getX(t);
    const b = index.getX((t + 1) % 3);
    cell = Math.max(cell, Math.hypot((uv.getX(a) - uv.getX(b)) * W, (uv.getY(a) - uv.getY(b)) * H));
  }
  const deepInScreen = grown(screen, -cell);
  const nearOuter = grown(outer, cell);
  const px = (i: number) => [uv.getX(i) * W, (1 - uv.getY(i)) * H] as const;
  const kept: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    const pts = tri.map(px);
    if (pts.every(([x, y]) => deepInScreen.contains(x, y))) continue;
    if (pts.every(([x, y]) => !nearOuter.contains(x, y))) continue;
    kept.push(...tri);
  }
  g.setIndex(kept);
  return g;
}

export class Chassis {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshPhysicalMaterial;
  private readonly color = document.createElement('canvas');
  private readonly height = document.createElement('canvas');
  private readonly normal = document.createElement('canvas');
  private readonly colorTex: THREE.CanvasTexture;
  private readonly normalTex: THREE.CanvasTexture;

  constructor(
    private readonly style: ChassisStyle = GUNMETAL,
    /** Normal-map resolution relative to the panel's pixels. */
    private readonly scale = 0.5,
  ) {
    this.colorTex = new THREE.CanvasTexture(this.color);
    this.colorTex.colorSpace = THREE.SRGBColorSpace;
    this.normalTex = new THREE.CanvasTexture(this.normal);
    this.material = physicalMaterial({
      map: this.colorTex,
      normalMap: this.normalTex,
      normalScale: new THREE.Vector2(1.6, 1.6),
      metalness: 0.92,
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.18,
      iridescence: style.iridescence,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [180, 520],
      alphaTest: 0.5,
      transparent: false,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
  }

  setAnisotropy(n: number) {
    this.colorTex.anisotropy = n;
    this.normalTex.anisotropy = n;
  }

  /** Rebuilds geometry (in front of the screen) and repaints the chassis. */
  build(rect: Rect, radius: number, screenInset: number, outer: PanelShape, bezel: number): void {
    this.mesh.geometry.dispose();
    // Grid cells about half a bezel wide, so trimming leaves a close ring.
    const segX = Math.max(48, Math.round(outer.width / (bezel / 2)));
    const segY = Math.max(48, Math.round(outer.height / (bezel / 2)));
    const g = spherePatchGeometry(rect.x, rect.y, rect.w, rect.h, radius, screenInset + CHASSIS_DEPTH, segX, segY);
    this.mesh.geometry = ringOnly(g, outer, screenShapeFor(outer, bezel));
    this.paint(outer, bezel, (outer.width / rect.w) * SWEEP_UNITS);
  }

  /** `sweep`: panel pixels the metal gradient spans. */
  private paint(outer: PanelShape, bezel: number, sweep: number) {
    const s = this.scale;
    const W = Math.round(outer.width * s);
    const H = Math.round(outer.height * s);
    for (const c of [this.color, this.height, this.normal]) {
      c.width = W;
      c.height = H;
    }
    const screen = screenShapeFor(outer, bezel);
    const pins = rivets(outer, bezel);
    this.paintHeight(outer, screen, bezel, pins);
    this.paintColor(outer, screen, bezel, pins, sweep);
    this.bakeNormals();
    this.colorTex.needsUpdate = true;
    this.normalTex.needsUpdate = true;
  }

  private paintHeight(outer: PanelShape, screen: PanelShape, bezel: number, pins: { x: number; y: number }[]) {
    const ctx = this.height.getContext('2d')!;
    const s = this.scale;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.height.width, this.height.height);
    // Outer bevel: a rounded shoulder rising from the edge.
    const bevel = Math.max(6, bezel * 0.45);
    const steps = 14;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      fillRegion(ctx, grown(outer, -t * bevel), s, gray(0.25 + 0.6 * Math.sin((t * Math.PI) / 2)));
    }
    // A groove running around the middle of the bezel band.
    ctx.save();
    ctx.globalCompositeOperation = 'darken';
    const mid = grown(outer, -bezel * 0.62);
    for (let k = 0; k < 4; k++) fillRegion(ctx, grown(mid, -k * 1.2), s, gray(k % 2 ? 0.85 : 0.62));
    ctx.restore();
    fillRegion(ctx, grown(outer, -bezel * 0.62 - 5), s, gray(0.85));
    // Inner lip: slopes down into the screen opening.
    const lip = bezel * 0.32;
    for (let k = steps; k >= 0; k--) {
      const t = k / steps;
      fillRegion(ctx, grown(screen, t * lip), s, gray(0.85 * t));
    }
    // Rivets: domes.
    for (const p of pins) {
      const r = Math.max(4, bezel * 0.16) * s;
      const g = ctx.createRadialGradient(p.x * s - r * 0.2, p.y * s - r * 0.2, 0, p.x * s, p.y * s, r);
      g.addColorStop(0, gray(1));
      g.addColorStop(0.7, gray(0.95));
      g.addColorStop(1, gray(0.6));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x * s, p.y * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private paintColor(outer: PanelShape, screen: PanelShape, bezel: number, pins: { x: number; y: number }[], sweep: number) {
    const ctx = this.color.getContext('2d')!;
    const s = this.scale;
    const W = this.color.width;
    const H = this.color.height;
    ctx.clearRect(0, 0, W, H);
    const [dark, mid, light] = this.style.metal;
    ctx.save();
    clipRegion(ctx, outer, s);
    // Metal with a soft top-left key and brushed streaks. The sweep has a
    // fixed size in the wall, so small panels aren't all highlight.
    const L = sweep * s;
    const g = ctx.createLinearGradient(0, 0, L * 0.35 * (W / H), L);
    g.addColorStop(0, light);
    g.addColorStop(0.18, mid);
    g.addColorStop(0.6, dark);
    g.addColorStop(1, mid);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.08;
    for (let y = 0; y < H; y += 2) {
      ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
      ctx.fillRect(0, y, W, 1);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Emissive channel in the groove, and LEDs beside the screen.
    ctx.save();
    clipRegion(ctx, grown(outer, -bezel * 0.62 - 1), s);
    ctx.strokeStyle = `${this.style.glow}55`;
    ctx.lineWidth = 2;
    const m = grown(outer, -bezel * 0.62 - 1);
    ctx.beginPath();
    ctx.roundRect(m.inset * s, m.inset * s, (m.width - 2 * m.inset) * s, (m.height - 2 * m.inset) * s, m.corner * s);
    ctx.stroke();
    ctx.restore();

    for (const p of pins) {
      const r = Math.max(4, bezel * 0.16) * s;
      const rg = ctx.createRadialGradient(p.x * s - r * 0.3, p.y * s - r * 0.3, 0, p.x * s, p.y * s, r);
      rg.addColorStop(0, '#e9f3f4');
      rg.addColorStop(0.5, '#6f858b');
      rg.addColorStop(1, '#141c1f');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(p.x * s, p.y * s, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Punch the screen opening.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    clipRegion(ctx, screen, s);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  private bakeNormals() {
    bakeNormalMap(this.height, this.normal, 6);
  }
}

/**
 * Height map (red channel) to a tangent-space normal map, OpenGL convention
 * (+y up). `dst` must already have the same size as `src`.
 */
export function bakeNormalMap(src: HTMLCanvasElement, dst: HTMLCanvasElement, strength: number): void {
  const W = src.width;
  const H = src.height;
  const hs = src.getContext('2d')!.getImageData(0, 0, W, H).data;
  const out = dst.getContext('2d')!.createImageData(W, H);
  const d = out.data;
  const h = (x: number, y: number) => hs[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4]! / 255;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = -(h(x + 1, y) - h(x - 1, y)) * strength;
      // Canvas y runs down; texture v runs up.
      const ny = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * W + x) * 4;
      d[i] = ((nx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  dst.getContext('2d')!.putImageData(out, 0, 0);
}
