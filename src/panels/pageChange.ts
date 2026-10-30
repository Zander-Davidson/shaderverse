// The page change transition (docs/no-modals.md), shared by every screen
// that changes pages: the monitors, through their CRT shader, and the
// console's knob edit display. A panel installs the shader fragment into its
// material, snapshots its canvas when a page change begins, and advances the
// progress each frame.

import * as THREE from 'three';
import { LOW_GFX } from '../style/quality';

/** Length of a page change. */
const PAGE_MS = 360;
/** Side of a transition block, in texels. */
const BLOCK_PX = 12;

/** Uniform declarations the fragment needs, for the top of a fragment shader. */
export const PAGE_UNIFORMS =
  'uniform vec2 crtOpening;\nuniform float crtLines;\nuniform float crtAspect;\nuniform sampler2D crtPrev;\nuniform float crtProgress;\nuniform float crtPageMode;\n';

/**
 * A page change: the screen breaks into blocks that quantize toward a
 * coarse mosaic, rows of them slide sideways out as the new page's slide in,
 * staggered by row with a little noise per block, and the blocks settle back
 * to full resolution with a brief scanline flicker. Mode 2 is the
 * reduced-motion dissolve: blocks swap in place, no movement. Goes after
 * `#include <map_fragment>`.
 */
export const PAGE_FRAG = /* glsl */ `
if (crtProgress < 1.0) {
  vec2 grid = crtLines * 3.0 / ${BLOCK_PX}.0 * vec2(crtAspect, 1.0);
  vec2 cell = floor(vMapUv * grid);
  float rowNoise = fract(sin(cell.y * 91.7 + 3.1) * 43758.5453);
  float blockNoise = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  // Each block runs its own 0..1 over the middle of the transition.
  float delay = 0.4 * (0.7 * rowNoise + 0.3 * blockNoise);
  float t = clamp((crtProgress - delay) / 0.6, 0.0, 1.0);
  vec2 uv = vMapUv;
  bool fresh = t >= 0.5;
  if (crtPageMode > 1.5) {
    fresh = blockNoise < crtProgress;
  } else {
    // Out then in: the old page's blocks slide away, the new page's arrive from the other side.
    float dir = rowNoise < 0.5 ? -1.0 : 1.0;
    float k = fresh ? 1.0 - (t - 0.5) * 2.0 : t * 2.0;
    float shift = dir * (fresh ? -1.0 : 1.0) * k * k * (0.12 + 0.18 * blockNoise) * crtOpening.x * 2.0;
    // Coarser toward the middle of the move, sharp at either end.
    float coarse = floor(1.0 + 3.0 * k);
    if (coarse > 1.0) {
      vec2 cg = grid / coarse;
      uv = (floor(uv * cg) + 0.5) / cg;
    }
    // Wrap inside the screen opening, like a picture losing horizontal sync.
    float lo = 0.5 - crtOpening.x;
    uv.x = lo + mod(uv.x + shift - lo, 2.0 * crtOpening.x);
  }
  vec2 dx = dFdx(vMapUv);
  vec2 dy = dFdy(vMapUv);
  vec4 page = fresh ? textureGrad(map, uv, dx, dy) : textureGrad(crtPrev, uv, dx, dy);
  diffuseColor.rgb = page.rgb;
  // Settle: a brief flicker in the scanlines.
  float settle = smoothstep(0.6, 0.85, crtProgress) * (1.0 - smoothstep(0.85, 1.0, crtProgress));
  diffuseColor.rgb *= 1.0 + 0.25 * settle * sin(vMapUv.y * crtLines * 3.14159 + crtProgress * 90.0);
}
`;

/** One screen's page changes: the uniforms its shader reads, and the snapshot of the page being left. */
export class PageChange {
  readonly uniforms = {
    /** Half the screen opening, in texture coordinates. */
    crtOpening: { value: new THREE.Vector2(0.5, 0.5) },
    /** Scanlines down the screen: one per three texels. */
    crtLines: { value: 1 },
    crtAspect: { value: 1 },
    /** The page being left, during a page change. */
    crtPrev: { value: null as THREE.Texture | null },
    /** 0..1 through a page change; 1 when none is running. */
    crtProgress: { value: 1 },
    /** 1 block shift, 2 the reduced-motion dissolve. */
    crtPageMode: { value: 1 },
  };
  private prevCanvas: HTMLCanvasElement | null = null;
  private prevTexture: THREE.CanvasTexture | null = null;
  private start = 0;

  /** Sizes the block grid and scanlines for a canvas of this size. */
  resize(width: number, height: number): void {
    this.uniforms.crtLines.value = height / 3;
    this.uniforms.crtAspect.value = width / height;
  }

  /**
   * Starts a page change from what `canvas` shows now; then change what is
   * drawn and redraw. A cut with ?gfx=low.
   */
  begin(canvas: HTMLCanvasElement): void {
    if (LOW_GFX) return;
    if (!this.prevCanvas) {
      this.prevCanvas = document.createElement('canvas');
      this.prevTexture = new THREE.CanvasTexture(this.prevCanvas);
      this.prevTexture.colorSpace = THREE.SRGBColorSpace;
      this.prevTexture.minFilter = THREE.LinearMipmapLinearFilter;
      this.uniforms.crtPrev.value = this.prevTexture;
    }
    // Resizing the copy also clears it.
    this.prevCanvas.width = canvas.width;
    this.prevCanvas.height = canvas.height;
    this.prevCanvas.getContext('2d')!.drawImage(canvas, 0, 0);
    this.prevTexture!.needsUpdate = true;
    this.uniforms.crtPageMode.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 2 : 1;
    this.uniforms.crtProgress.value = 0;
    this.start = performance.now();
  }

  /** True while a page change is playing. */
  get running(): boolean {
    return this.uniforms.crtProgress.value < 1;
  }

  /** Advances a running page change; true while it plays, so the screen must redraw. */
  tick(): boolean {
    if (!this.running) return false;
    this.uniforms.crtProgress.value = Math.min(1, (performance.now() - this.start) / PAGE_MS);
    return true;
  }

  /** Installs the transition into a panel's plain map material. */
  install(material: THREE.MeshBasicMaterial, cacheKey: string): void {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${PAGE_UNIFORMS}void main() {`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${PAGE_FRAG}`);
    };
    material.customProgramCacheKey = () => cacheKey;
  }
}
