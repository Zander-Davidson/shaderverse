// Frame compositor. The cockpit is mostly still: only the shader portal
// changes every frame. So the cockpit renders into a cached image, and only
// the screen regions that changed are re-rendered (scissored). Each frame
// draws the live portal, the cached cockpit over it (with a transparent hole
// where the portal shows through), then small live overlays such as the caret.

import * as THREE from 'three';

/** Layers: 0 is the cached cockpit. */
export const UNDER_LAYER = 1;
export const OVER_LAYER = 2;

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

const COMPOSITE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(map, vUv);
  #include <colorspace_fragment>
}
`;

/** Fragment shader for the portal's stand-in in the cache: a transparent disc. */
export const HOLE_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  if (length(vUv * 2.0 - 1.0) > 1.0) discard;
  gl_FragColor = vec4(0.0);
}
`;

export const HOLE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export class Compositor {
  private cache: THREE.WebGLRenderTarget;
  private full = true;
  private regions: Region[] = [];
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quadMat: THREE.ShaderMaterial;
  private readonly box = new THREE.Box3();
  private readonly v = new THREE.Vector3();
  /** Counters for profiling and tests. */
  readonly stats = { full: 0, partial: 0, pixels: 0 };

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    this.cache = this.makeTarget();
    this.quadMat = new THREE.ShaderMaterial({
      vertexShader: COMPOSITE_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: { map: { value: this.cache.texture } },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      // The cache is opaque except the portal hole: draw it over the portal.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  private makeTarget(): THREE.WebGLRenderTarget {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const t = new THREE.WebGLRenderTarget(size.x, size.y, {
      // At high pixel ratios the pixels are small enough without MSAA.
      samples: this.renderer.getPixelRatio() >= 2 ? 0 : 4,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });
    // sRGB storage keeps 8-bit precision in the darks.
    t.texture.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** Call after the canvas size or pixel ratio changes. */
  resize(): void {
    this.cache.dispose();
    this.cache = this.makeTarget();
    this.quadMat.uniforms.map!.value = this.cache.texture;
    this.markAll();
  }

  markAll(): void {
    this.full = true;
  }

  /** Marks the screen area covered by `obj` for re-rendering. */
  markObject(obj: THREE.Object3D): void {
    if (this.full) return;
    obj.updateWorldMatrix(true, true);
    this.box.setFromObject(obj);
    if (this.box.isEmpty()) return;
    const W = this.cache.width;
    const H = this.cache.height;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      this.v.set(i & 1 ? this.box.max.x : this.box.min.x, i & 2 ? this.box.max.y : this.box.min.y, i & 4 ? this.box.max.z : this.box.min.z);
      this.v.project(this.camera);
      x0 = Math.min(x0, ((this.v.x + 1) / 2) * W);
      x1 = Math.max(x1, ((this.v.x + 1) / 2) * W);
      y0 = Math.min(y0, ((this.v.y + 1) / 2) * H);
      y1 = Math.max(y1, ((this.v.y + 1) / 2) * H);
    }
    const pad = 4;
    const x = Math.max(0, Math.floor(x0) - pad);
    const y = Math.max(0, Math.floor(y0) - pad);
    const w = Math.min(W, Math.ceil(x1) + pad) - x;
    const h = Math.min(H, Math.ceil(y1) + pad) - y;
    if (w > 0 && h > 0) this.regions.push({ x, y, w, h });
  }

  /** Renders the frame: refresh the cache where needed, then composite. */
  render(): void {
    const r = this.renderer;
    const cam = this.camera;
    if (this.full || this.regions.length) {
      r.setRenderTarget(this.cache);
      cam.layers.set(0);
      if (this.full) {
        this.cache.scissorTest = false;
        r.render(this.scene, cam);
        this.stats.full++;
        this.stats.pixels += this.cache.width * this.cache.height;
      } else {
        for (const g of this.merged()) {
          this.cache.scissor.set(g.x, g.y, g.w, g.h);
          this.cache.scissorTest = true;
          r.render(this.scene, cam);
          this.stats.partial++;
          this.stats.pixels += g.w * g.h;
        }
        this.cache.scissorTest = false;
      }
      this.full = false;
      this.regions = [];
    }

    r.setRenderTarget(null);
    // The live portal, under the cockpit.
    cam.layers.set(UNDER_LAYER);
    r.render(this.scene, cam);
    // The cached cockpit over it.
    const autoClear = r.autoClear;
    r.autoClear = false;
    r.render(this.quadScene, this.quadCam);
    // Live overlays (the caret) over everything.
    cam.layers.set(OVER_LAYER);
    r.render(this.scene, cam);
    r.autoClear = autoClear;
    cam.layers.set(0);
  }

  /** Few regions render separately; many collapse into their bounds. */
  private merged(): Region[] {
    if (this.regions.length <= 3) return this.regions;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const g of this.regions) {
      x0 = Math.min(x0, g.x);
      y0 = Math.min(y0, g.y);
      x1 = Math.max(x1, g.x + g.w);
      y1 = Math.max(y1, g.y + g.h);
    }
    return [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
  }
}
