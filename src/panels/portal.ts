// The central portal: shows the shader's square render target through a
// circular mask. Pointer input becomes iMouse in the shader's pixel space.

import * as THREE from 'three';
import type { LayoutConfig } from '../cockpit/layout';
import type { ShaderRuntime } from '../shader/runtime';
import { CanvasPanel, type PanelPointerEvent, type PointerTarget } from './panel';
import { spherePatchGeometry } from './patch';

const PORTAL_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float time;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float aa = fwidth(r) * 1.5;
  float mask = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  vec3 col = texture2D(map, vUv).rgb;
  // A faint glass edge so the shader reads as seen through a window.
  col *= 1.0 - 0.35 * smoothstep(0.82, 1.0, r);
  col += vec3(0.3, 0.8, 1.0) * 0.08 * smoothstep(0.93, 1.0, r) * mask;
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

export class PortalPanel implements PointerTarget {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  pixelWidth: number;
  pixelHeight: number;
  private down = false;

  constructor(
    private readonly runtime: ShaderRuntime,
    cfg: LayoutConfig,
  ) {
    this.pixelWidth = this.pixelHeight = runtime.size;
    this.material = new THREE.ShaderMaterial({
      vertexShader: PORTAL_VERT,
      fragmentShader: PORTAL_FRAG,
      uniforms: { map: { value: runtime.target.texture }, time: { value: 0 } },
      transparent: true,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geometry(cfg), this.material);
    this.mesh.renderOrder = 2;
  }

  get meshes() {
    return [this.mesh];
  }

  private geometry(cfg: LayoutConfig) {
    const { x, y, size } = cfg.portal;
    return spherePatchGeometry(x, y, size, size, cfg.radius, 0.03, 64, 64);
  }

  rebuild(cfg: LayoutConfig) {
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.geometry(cfg);
  }

  onPointer(e: PanelPointerEvent): boolean {
    this.pixelWidth = this.pixelHeight = this.runtime.size;
    const inside = Math.hypot(e.u * 2 - 1, e.v * 2 - 1) <= 1;
    const sx = e.u * this.runtime.size;
    const sy = e.v * this.runtime.size; // Shadertoy: origin bottom-left
    if (e.kind === 'down' && e.button === 0 && inside) {
      this.down = true;
      this.runtime.pointer(sx, sy, true, true);
      return true;
    }
    if (e.kind === 'move' && this.down && Number.isFinite(sx)) {
      this.runtime.pointer(sx, sy, true, false);
    }
    if (e.kind === 'up' && this.down) {
      this.down = false;
      this.runtime.pointer(sx, sy, false, false);
    }
    return false;
  }

  cursorAt(x: number, y: number): string {
    const s = this.runtime.size;
    return Math.hypot((x / s) * 2 - 1, (y / s) * 2 - 1) <= 1 ? 'crosshair' : 'default';
  }
}

/** Mechanical rim drawn around the portal; decorative, takes no input. */
export class PortalRim extends CanvasPanel {
  constructor(cfg: LayoutConfig) {
    const s = cfg.portal.size * 1.16;
    super({ x: cfg.portal.x, y: cfg.portal.y, w: s, h: s }, 1024, 1024, cfg.radius, 0.02);
    this.mesh.renderOrder = 1;
  }

  relayout(cfg: LayoutConfig) {
    const s = cfg.portal.size * 1.16;
    this.rebuild(cfg.radius, { x: cfg.portal.x, y: cfg.portal.y, w: s, h: s });
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const S = this.pixelWidth;
    const c = S / 2;
    const inner = (S / 2) / 1.16;
    ctx.clearRect(0, 0, S, S);

    const ring = (r0: number, r1: number, fill: string | CanvasGradient) => {
      ctx.beginPath();
      ctx.arc(c, c, r1, 0, Math.PI * 2);
      ctx.arc(c, c, r0, 0, Math.PI * 2, true);
      ctx.fillStyle = fill;
      ctx.fill();
    };
    const g = ctx.createRadialGradient(c, c, inner, c, c, S / 2);
    g.addColorStop(0, '#1a232c');
    g.addColorStop(0.45, '#0e141a');
    g.addColorStop(1, '#06090c');
    ring(inner - 2, S / 2 - 4, g);
    ring(inner - 2, inner + 5, '#24323e');
    ring(S / 2 - 10, S / 2 - 6, '#18222b');

    // Tick marks
    ctx.save();
    ctx.translate(c, c);
    for (let i = 0; i < 120; i++) {
      const major = i % 10 === 0;
      ctx.rotate((Math.PI * 2) / 120);
      ctx.fillStyle = major ? '#4fd1ff' : '#2d3d4a';
      ctx.globalAlpha = major ? 0.8 : 1;
      ctx.fillRect(inner + 14, -1.5, major ? 22 : 10, 3);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Emissive channel
    ctx.beginPath();
    ctx.arc(c, c, inner + 46, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = 'rgba(79, 209, 255, 0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, inner + 46, Math.PI * 1.15, Math.PI * 1.85);
    ctx.strokeStyle = 'rgba(255, 122, 69, 0.3)';
    ctx.stroke();
  }
}
