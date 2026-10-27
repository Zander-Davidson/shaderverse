// The view out the cockpit window: the shader's render target across the
// whole windscreen (src/cockpit/window.ts), masked to its outline, with a
// faint haze and shading toward the frame so it reads as seen through glass.
// Pointer input becomes iMouse in the shader's pixel space.

import * as THREE from 'three';
import type { LayoutConfig } from '../cockpit/layout';
import { windowCorners, windowRect } from '../cockpit/window';
import type { ShaderRuntime } from '../shader/runtime';
import type { PanelPointerEvent, PointerTarget } from './panel';
import { spherePatchGeometry } from './patch';
import { HOLE_VERT, UNDER_LAYER } from '../cockpit/compositor';

/**
 * Signed distance into the window, in wall units, from texture coordinate p:
 * the corners are in texture coordinates and `scale` turns those into wall
 * units. Positive inside.
 */
const WINDOW_MASK = /* glsl */ `
uniform vec2 corners[4];
uniform vec2 scale;
float windowInside(vec2 p) {
  float d = 1e3;
  for (int i = 0; i < 4; i++) {
    vec2 a = corners[i] * scale;
    vec2 b = corners[(i + 1) % 4] * scale;
    vec2 e = b - a;
    d = min(d, (e.x * (p.y * scale.y - a.y) - e.y * (p.x * scale.x - a.x)) / length(e));
  }
  return d;
}
`;

const PORTAL_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
${WINDOW_MASK}
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
void main() {
  float d = windowInside(vUv);
  float aa = fwidth(d) * 1.5;
  float mask = smoothstep(-aa, 0.0, d);
  if (mask < 0.01) discard;
  vec3 col = texture2D(map, vUv).rgb;
  // Glass: a faint cool haze, a little darker toward the frame, and a soft
  // diagonal sheen; fine specks of dust catch the light.
  col = mix(col, vec3(0.05, 0.08, 0.1), 0.05);
  col *= 0.82 + 0.18 * smoothstep(0.0, 2.2, d);
  vec2 w = vUv * scale;
  col += vec3(0.6, 0.75, 0.85) * 0.025 * smoothstep(0.35, 0.0, abs(fract((w.x + w.y * 0.6) / 9.0) - 0.5));
  vec2 cell = floor(w * 9.0);
  col += vec3(0.5) * step(0.997, hash(cell)) * smoothstep(0.5, 0.0, length(fract(w * 9.0) - 0.5)) * 0.25;
  gl_FragColor = vec4(col, mask);
}
`;

const PORTAL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** The window's stand-in in the cached cockpit: transparent, where the shader shows through. */
const HOLE_FRAG = /* glsl */ `
varying vec2 vUv;
${WINDOW_MASK}
void main() {
  if (windowInside(vUv) < 0.0) discard;
  gl_FragColor = vec4(0.0);
}
`;

export class PortalPanel implements PointerTarget {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly hole: THREE.Mesh;
  pixelWidth: number;
  pixelHeight: number;
  private down = false;
  private downAt = { x: 0, y: 0, moved: 0 };
  private readonly mask = { corners: { value: [0, 1, 2, 3].map(() => new THREE.Vector2()) }, scale: { value: new THREE.Vector2(1, 1) } };
  /** Called for a click (no drag) on the window; a drag is mouse input to the shader. */
  onClick: (() => void) | null = null;

  constructor(
    private readonly runtime: ShaderRuntime,
    cfg: LayoutConfig,
  ) {
    this.pixelWidth = runtime.width;
    this.pixelHeight = runtime.height;
    this.material = new THREE.ShaderMaterial({
      vertexShader: PORTAL_VERT,
      fragmentShader: PORTAL_FRAG,
      uniforms: { map: { value: runtime.target.texture }, ...this.mask },
      transparent: true,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.renderOrder = 2;
    // The view changes every frame, so it renders live under the cached
    // cockpit; in the cache, a transparent stand-in leaves room for it.
    this.mesh.layers.set(UNDER_LAYER);
    this.hole = new THREE.Mesh(
      this.mesh.geometry,
      new THREE.ShaderMaterial({ vertexShader: HOLE_VERT, fragmentShader: HOLE_FRAG, uniforms: this.mask, blending: THREE.NoBlending }),
    );
    this.rebuild(cfg);
  }

  get meshes() {
    return [this.mesh];
  }

  rebuild(cfg: LayoutConfig) {
    const r = windowRect(cfg);
    this.mesh.geometry.dispose();
    this.mesh.geometry = spherePatchGeometry(r.x, r.y, r.w, r.h, cfg.radius, 0.03, 128, 64);
    this.hole.geometry = this.mesh.geometry;
    windowCorners(cfg).forEach(([x, y], i) => this.mask.corners.value[i]!.set((x - (r.x - r.w / 2)) / r.w, (y - (r.y - r.h / 2)) / r.h));
    this.mask.scale.value.set(r.w, r.h);
    // The shader renders in the window's shape.
    this.runtime.setAspect(r.w / r.h);
  }

  /** Whether texture coordinate (u, v) is inside the window's outline. */
  private inside(u: number, v: number): boolean {
    const s = this.mask.scale.value;
    const c = this.mask.corners.value;
    for (let i = 0; i < 4; i++) {
      const a = c[i]!;
      const b = c[(i + 1) % 4]!;
      if ((b.x - a.x) * s.x * (v - a.y) * s.y - (b.y - a.y) * s.y * (u - a.x) * s.x < 0) return false;
    }
    return true;
  }

  hitTest(x: number, y: number): boolean {
    return this.inside(x / this.pixelWidth, 1 - y / this.pixelHeight);
  }

  onPointer(e: PanelPointerEvent): boolean {
    this.pixelWidth = this.runtime.width;
    this.pixelHeight = this.runtime.height;
    const inside = this.inside(e.u, e.v);
    const sx = e.u * this.runtime.width;
    const sy = e.v * this.runtime.height; // Shadertoy: origin bottom-left
    if (e.kind === 'down' && e.button === 0 && inside) {
      this.down = true;
      this.downAt = { x: e.clientX, y: e.clientY, moved: 0 };
      this.runtime.pointer(sx, sy, true, true);
      return true;
    }
    if (e.kind === 'move' && this.down) {
      this.downAt.moved = Math.max(this.downAt.moved, Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y));
      if (Number.isFinite(sx)) this.runtime.pointer(sx, sy, true, false);
    }
    if (e.kind === 'up' && this.down) {
      this.down = false;
      this.runtime.pointer(sx, sy, false, false);
      if (this.downAt.moved < 5) this.onClick?.();
    }
    return false;
  }

  cursorAt(x: number, y: number): string {
    return this.hitTest(x, y) ? 'crosshair' : 'default';
  }
}
