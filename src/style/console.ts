// The cockpit's console: one piece of molded chrome. Panel bezels, the portal
// and knob collars, and the knob tubing are all shapes in a single height
// field, baked on the GPU from signed distance functions. The field displaces
// a dense patch of the dome and gives it its normals, so every bezel rises out
// of the console in a smooth step and rolls over into its screen, and the
// tubes lie half buried with fillets where they meet the metal.

import * as THREE from 'three';
import { physicalMaterial } from './quality';
import type { LayoutConfig, Rect } from '../cockpit/layout';
import { spherePatchGeometry } from '../panels/patch';
import type { PanelShape } from '../panels/shape';

/** Plateau height of every bezel and collar above the console, in world units. */
export const BEZEL_HEIGHT = 0.11;
/**
 * How far the molded metal reaches under a screen's edge. None: the lip meets
 * the console's floor right at the screen's edge, so it never cuts through a
 * screen, where the mesh's facets would show along the crossing.
 */
const LIP_OVERLAP = 0;
/** Wall units around the fit rectangle the detailed console covers. */
const MARGIN = 0.7;
/** Half size of the plain backdrop beyond it, relative to the fit half width. */
const COVER = 1.75;
const MAX_PANELS = 8;
const MAX_RINGS = 16;
const MAX_PIPES = 16;
const MAX_SEGS = 512;
/** Wall units per texel of the plain backdrop's normal map. */
const BACKDROP_TEXEL = 0.06;
/**
 * How much of the dome's curvature the normals undo. The dome is a concave
 * mirror that would magnify and smear the cockpit behind the pilot; leaning
 * the normals back toward flat lets the console mirror it nearly one to one.
 * Only the shading changes; the surface itself keeps the dome's shape.
 */
const FLATTEN = 0.85;
/**
 * The shell behind the rig: darker and less mirror-like than the monitors'
 * chrome bezels, so the rig and the portal stand out against it.
 */
const CONSOLE_FINISH: THREE.MeshPhysicalMaterialParameters = {
  color: '#59646a',
  roughness: 0.22,
  envMapIntensity: 0.4,
  clearcoat: 0.25,
  clearcoatRoughness: 0.15,
  iridescence: 0.1,
};

/** A panel's bezel: its outer silhouette and screen opening, in panel pixels. */
export interface PanelMold {
  rect: Rect;
  pixelWidth: number;
  pixelHeight: number;
  outer: PanelShape;
  screen: PanelShape;
}

/** A round collar: rises at `outer`, rolls down into a display at `opening`. */
export interface RingMold {
  x: number;
  y: number;
  outer: number;
  opening: number;
}

/** A tube lying in the console: its centerline in wall units, height and radius. */
export interface PipeMold {
  points: [number, number][];
  center: number;
  radius: number;
}

export interface Mold {
  panels: PanelMold[];
  rings: RingMold[];
  pipes: PipeMold[];
}

/** A panel shape in wall units: rounded rect (center, half size, corner) less a circle. */
export interface WallShape {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  corner: number;
  cut: { x: number; y: number; r: number } | null;
}

/** Converts a panel-pixel shape to wall units, for a panel spanning `rect`. */
export function wallShape(rect: Rect, pixelWidth: number, pixelHeight: number, s: PanelShape): WallShape {
  const kx = rect.w / pixelWidth;
  const ky = rect.h / pixelHeight;
  return {
    cx: rect.x,
    cy: rect.y,
    hw: (s.width / 2 - s.inset) * kx,
    hh: (s.height / 2 - s.inset) * ky,
    corner: s.corner * kx,
    cut: s.cut ? { x: rect.x - rect.w / 2 + s.cut.x * kx, y: rect.y + rect.h / 2 - s.cut.y * ky, r: s.cut.r * kx } : null,
  };
}

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BAKE_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
#define MAX_PANELS ${MAX_PANELS}
#define MAX_RINGS ${MAX_RINGS}
#define MAX_PIPES ${MAX_PIPES}
uniform vec4 outerBox[MAX_PANELS];   // center, half size
uniform vec4 screenBox[MAX_PANELS];
uniform vec4 corners[MAX_PANELS];    // outer corner, screen corner
uniform vec4 cuts[MAX_PANELS];       // cut center, outer cut r, screen cut r (0: none)
uniform int panelCount;
uniform vec4 rings[MAX_RINGS];       // center, outer r, opening r
uniform int ringCount;
uniform sampler2D segs;              // one texel per segment: a.xy, b.xy
uniform vec4 pipeBox[MAX_PIPES];     // bounds, grown by the fillet
uniform vec4 pipeInfo[MAX_PIPES];    // first segment, end segment, center height, radius
uniform int pipeCount;
uniform vec4 region;                 // min corner, size
uniform vec2 texel;
uniform float height;
uniform float overlap;
uniform float flatten;             // FLATTEN / radius
uniform int mode;
varying vec2 vUv;

float smax(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return max(a, b) + h * h * k * 0.25;
}
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float smootherstep01(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}
float roundBox(vec2 p, vec4 box, float r) {
  vec2 q = abs(p - box.xy) - box.zw + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Cross section of a bezel, by signed distance to its outer silhouette:
// a smooth step up from the console onto the plateau.
float rise(float d, float outside, float inside) {
  return height * smootherstep01((outside - d) / (outside + inside));
}
// And by signed distance to its opening: the plateau rolls over and drops
// steeply to the screen's edge. A quarter sine rather than a quarter circle:
// as round on top, but its slope stays finite at the foot, where a vertical
// wall would alias in the baked normals. Off the lip, no limit.
float lip(float d, float width) {
  float t = (d + overlap) / width;
  if (t >= 1.0) return 1e3;
  if (t <= 0.0) return -0.01;
  return mix(-0.01, height, sin(t * 1.5707963));
}

// Panel seams on the shell: shallow grooves between hull plates laid out in
// rings around a hub set off the portal's center, so it reads as a surface at
// a distance without lining up with anything. Rings widen outward unevenly;
// each is cut into its own number of plates at its own angle.
const vec2 HUB = vec2(-1.3, 1.9);
float hash1(float n) { return fract(sin(n * 127.1 + 3.7) * 43758.5453); }
float ringRadius(float k) { return 2.4 * pow(1.42, k) * (1.0 + 0.16 * (hash1(k) - 0.5)); }
float seams(vec2 p) {
  vec2 d = p - HUB;
  float r = length(d);
  float k = floor(log(max(r, 0.01) / 2.4) / log(1.42));
  float r0 = ringRadius(k);
  float r1 = ringRadius(k + 1.0);
  if (r < r0) { k -= 1.0; r1 = r0; r0 = ringRadius(k); }
  else if (r > r1) { k += 1.0; r0 = r1; r1 = ringRadius(k + 1.0); }
  float e = min(r - r0, r1 - r);
  if (k >= 0.0) {
    float n = floor(5.0 + k * 2.2 + hash1(k + 11.0) * 3.0);
    float a = atan(d.y, d.x) / 6.2831853 + hash1(k + 3.0);
    float f = fract(a * n);
    e = min(e, min(f, 1.0 - f) / n * 6.2831853 * r);
  }
  return -0.03 * (1.0 - smoothstep(0.02, 0.09, e));
}

float segDist(vec2 p, vec4 s) {
  vec2 ab = s.zw - s.xy;
  float t = clamp(dot(p - s.xy, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  return length(p - s.xy - ab * t);
}

float field(vec2 p) {
  float h = 0.0;
  float cap = 1e3;
  for (int i = 0; i < MAX_PANELS; i++) {
    if (i >= panelCount) break;
    float so = roundBox(p, outerBox[i], corners[i].x);
    float si = roundBox(p, screenBox[i], corners[i].y);
    if (cuts[i].z > 0.0) {
      float dc = length(p - cuts[i].xy);
      so = max(so, cuts[i].z - dc);
      si = max(si, cuts[i].w - dc);
    }
    h = max(h, rise(so, 0.04, 0.06));
    cap = min(cap, lip(si, 0.075));
  }
  // Collars merge into one mass where they meet.
  float dr = 1e3;
  for (int i = 0; i < MAX_RINGS; i++) {
    if (i >= ringCount) break;
    float d = length(p - rings[i].xy);
    dr = smin(dr, d - rings[i].z, 0.18);
    cap = min(cap, lip(d - rings[i].w, 0.06));
  }
  h = max(h, rise(dr, 0.03, 0.05));
  h += seams(p) * (1.0 - smoothstep(0.0, 0.01, h));
  // Tubes: a round ridge whose foot is filleted into whatever it crosses.
  for (int i = 0; i < MAX_PIPES; i++) {
    if (i >= pipeCount) break;
    vec4 b = pipeBox[i];
    if (p.x < b.x || p.y < b.y || p.x > b.z || p.y > b.w) continue;
    vec4 info = pipeInfo[i];
    float d = 1e3;
    for (int s = int(info.x); s < int(info.y); s++) d = min(d, segDist(p, texelFetch(segs, ivec2(s, 0), 0)));
    float r = info.w;
    float ridge = d < r ? info.z + sqrt(r * r - d * d) : info.z - (d - r) * 2.5;
    h = smax(h, ridge, 0.035);
  }
  return min(h, cap);
}

void main() {
  vec2 p = region.xy + vUv * region.zw;
  if (mode == 0) {
    gl_FragColor = vec4(field(p), 0.0, 0.0, 1.0);
    return;
  }
  // Tangent-space normal: u runs with wall x, v with wall y.
  float dx = (field(p + vec2(texel.x, 0.0)) - field(p - vec2(texel.x, 0.0))) / (2.0 * texel.x);
  float dy = (field(p + vec2(0.0, texel.y)) - field(p - vec2(0.0, texel.y))) / (2.0 * texel.y);
  // Lean back toward flat: the slope of a dome bulging the other way.
  dx -= flatten * p.x;
  dy -= flatten * p.y;
  vec3 n = normalize(vec3(-dx, -dy, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}
`;

/**
 * The console finish, shared by everything molded from it or mounted on it
 * (knob caps, tube sleeves) so it all reads as one metal.
 */
export function chromeMaterial(params: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
  return physicalMaterial({
    color: '#a9b9be',
    metalness: 1,
    roughness: 0.07,
    clearcoat: 0.4,
    clearcoatRoughness: 0.04,
    iridescence: 0.3,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
    ...params,
  });
}

interface Baked {
  height: THREE.WebGLRenderTarget;
  normal: THREE.WebGLRenderTarget;
}

export class ChromeConsole {
  readonly group = new THREE.Group();
  private readonly detail: THREE.Mesh;
  private readonly backdrop: THREE.Mesh;
  private readonly material: THREE.MeshPhysicalMaterial;
  private readonly backdropMaterial: THREE.MeshPhysicalMaterial;
  private baked: Baked[] = [];
  private readonly bake: THREE.ShaderMaterial;
  private readonly segData = new Float32Array(MAX_SEGS * 4);
  private readonly segTex = new THREE.DataTexture(this.segData, MAX_SEGS, 1, THREE.RGBAFormat, THREE.FloatType);

  constructor(
    /** Wall units per texel of the height field, and per vertex of the mesh. */
    private readonly texel: number,
    private readonly vertexSpacing: number,
  ) {
    this.material = chromeMaterial({ ...CONSOLE_FINISH, displacementScale: 1 });
    this.detail = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    // Beyond the molded area the console runs on plain, just behind it.
    this.backdropMaterial = chromeMaterial(CONSOLE_FINISH);
    this.backdrop = new THREE.Mesh(new THREE.BufferGeometry(), this.backdropMaterial);
    this.group.add(this.detail, this.backdrop);
    this.bake = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      uniforms: {
        outerBox: { value: Array.from({ length: MAX_PANELS }, () => new THREE.Vector4()) },
        screenBox: { value: Array.from({ length: MAX_PANELS }, () => new THREE.Vector4()) },
        corners: { value: Array.from({ length: MAX_PANELS }, () => new THREE.Vector4()) },
        cuts: { value: Array.from({ length: MAX_PANELS }, () => new THREE.Vector4()) },
        panelCount: { value: 0 },
        rings: { value: Array.from({ length: MAX_RINGS }, () => new THREE.Vector4()) },
        ringCount: { value: 0 },
        segs: { value: this.segTex },
        pipeBox: { value: Array.from({ length: MAX_PIPES }, () => new THREE.Vector4()) },
        pipeInfo: { value: Array.from({ length: MAX_PIPES }, () => new THREE.Vector4()) },
        pipeCount: { value: 0 },
        region: { value: new THREE.Vector4() },
        texel: { value: new THREE.Vector2() },
        height: { value: BEZEL_HEIGHT },
        overlap: { value: LIP_OVERLAP },
        flatten: { value: 0 },
        mode: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }

  /** Rebuilds the console for a layout and the shapes molded into it. */
  mold(renderer: THREE.WebGLRenderer, cfg: LayoutConfig, mold: Mold): void {
    const w = 2 * (cfg.fitHalfWidth + MARGIN);
    const h = 2 * (cfg.fitHalfHeight + MARGIN);
    this.detail.geometry.dispose();
    this.detail.geometry = spherePatchGeometry(0, 0, w, h, cfg.radius, 0, Math.round(w / this.vertexSpacing), Math.round(h / this.vertexSpacing));
    // Out past the edges of the widest view.
    const s = 2 * Math.max(COVER * cfg.fitHalfWidth, cfg.radius * 0.95);
    this.backdrop.geometry.dispose();
    this.backdrop.geometry = spherePatchGeometry(0, 0, s, s, cfg.radius, -0.004, 96, 96);

    this.setUniforms(mold);
    this.bake.uniforms.flatten!.value = FLATTEN / cfg.radius;
    for (const b of this.baked) for (const rt of [b.height, b.normal]) rt.dispose();
    const detail = this.bakeRegion(renderer, w, h, this.texel);
    // The backdrop only needs its normals to match the console's at the seam.
    const back = this.bakeRegion(renderer, s, s, BACKDROP_TEXEL);
    this.baked = [detail, back];

    this.material.displacementMap = detail.height.texture;
    this.material.normalMap = detail.normal.texture;
    // The clearcoat must follow the relief too, or it reads as flat glass.
    this.material.clearcoatNormalMap = detail.normal.texture;
    this.material.needsUpdate = true;
    this.backdropMaterial.normalMap = back.normal.texture;
    this.backdropMaterial.clearcoatNormalMap = back.normal.texture;
    this.backdropMaterial.needsUpdate = true;
  }

  /** Bakes the height field and its normals over a w × h region centered ahead. */
  private bakeRegion(renderer: THREE.WebGLRenderer, w: number, h: number, texel: number): Baked {
    const tw = Math.round(w / texel);
    const th = Math.round(h / texel);
    const u = this.bake.uniforms;
    u.region!.value.set(-w / 2, -h / 2, w, h);
    u.texel!.value.set(w / tw, h / th);
    const target = () =>
      new THREE.WebGLRenderTarget(tw, th, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
        depthBuffer: false,
      });
    const out = { height: target(), normal: target() };
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bake);
    quad.frustumCulled = false;
    scene.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const prev = renderer.getRenderTarget();
    for (const [mode, rt] of [[0, out.height], [1, out.normal]] as const) {
      u.mode!.value = mode;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
    }
    renderer.setRenderTarget(prev);
    quad.geometry.dispose();
    return out;
  }

  private setUniforms(mold: Mold) {
    const u = this.bake.uniforms;
    const panels = mold.panels.slice(0, MAX_PANELS);
    panels.forEach((p, i) => {
      const o = wallShape(p.rect, p.pixelWidth, p.pixelHeight, p.outer);
      const s = wallShape(p.rect, p.pixelWidth, p.pixelHeight, p.screen);
      u.outerBox!.value[i].set(o.cx, o.cy, o.hw, o.hh);
      u.screenBox!.value[i].set(s.cx, s.cy, s.hw, s.hh);
      u.corners!.value[i].set(o.corner, s.corner, 0, 0);
      u.cuts!.value[i].set(o.cut?.x ?? 0, o.cut?.y ?? 0, o.cut?.r ?? 0, s.cut?.r ?? 0);
    });
    u.panelCount!.value = panels.length;

    const rings = mold.rings.slice(0, MAX_RINGS);
    rings.forEach((r, i) => u.rings!.value[i].set(r.x, r.y, r.outer, r.opening));
    u.ringCount!.value = rings.length;

    let seg = 0;
    let n = 0;
    for (const pipe of mold.pipes) {
      if (n >= MAX_PIPES || seg + pipe.points.length - 1 > MAX_SEGS) break;
      const first = seg;
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let k = 0; k + 1 < pipe.points.length; k++) {
        const [ax, ay] = pipe.points[k]!;
        const [bx, by] = pipe.points[k + 1]!;
        this.segData.set([ax, ay, bx, by], seg++ * 4);
        x0 = Math.min(x0, ax, bx);
        y0 = Math.min(y0, ay, by);
        x1 = Math.max(x1, ax, bx);
        y1 = Math.max(y1, ay, by);
      }
      // Far enough out for the ridge's foot and its fillet.
      const g = pipe.radius + 0.12;
      u.pipeBox!.value[n].set(x0 - g, y0 - g, x1 + g, y1 + g);
      u.pipeInfo!.value[n].set(first, seg, pipe.center, pipe.radius);
      n++;
    }
    u.pipeCount!.value = n;
    this.segTex.needsUpdate = true;
  }
}
