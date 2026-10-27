// The portal's glow on the rig (docs/hanging-rig.md): a light at the portal,
// behind the hanging monitors, that rim-lights the arms and the backs of the
// cases in the shader's colors. A few times a second the shader's image is
// averaged down on the GPU and read back; the light only changes (and the
// cached cockpit only re-renders) when its color moves noticeably.

import * as THREE from 'three';
import type { ShaderRuntime } from '../shader/runtime';

const AVG_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  // Each of the 4 × 4 output texels averages an 8 × 8 grid of its cell.
  vec3 sum = vec3(0.0);
  for (int y = 0; y < 8; y++)
    for (int x = 0; x < 8; x++)
      sum += texture2D(map, vUv + (vec2(x, y) - 3.5) / 32.0).rgb;
  gl_FragColor = vec4(sum / 64.0, 1.0);
}
`;

const AVG_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Seconds between samples. */
const EVERY = 0.4;
/** How far the color must move (RGB distance) before the light changes. */
const THRESHOLD = 0.06;

export class PortalGlow {
  readonly light: THREE.PointLight;
  private readonly target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, depthBuffer: false });
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly pixels = new Uint8Array(4 * 4 * 4);
  private readonly color = new THREE.Color();
  private readonly next = new THREE.Color();
  private wait = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    runtime: ShaderRuntime,
    /** False for low graphics: a fixed teal glow, never sampled. */
    private readonly live: boolean,
    private readonly intensity = 55,
  ) {
    this.color.set('#3fb8d8');
    this.light = new THREE.PointLight(this.color, intensity, 0, 1.6);
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: AVG_VERT, fragmentShader: AVG_FRAG, uniforms: { map: { value: runtime.target.texture } }, depthTest: false }),
    );
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  /** Samples the shader now and then; returns true when the light changed. */
  update(dt: number): boolean {
    if (!this.live) return false;
    this.wait -= dt;
    if (this.wait > 0) return false;
    this.wait = EVERY;
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.cam);
    this.renderer.setRenderTarget(prev);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, 4, 4, this.pixels);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < 16; i++) {
      r += this.pixels[i * 4]!;
      g += this.pixels[i * 4 + 1]!;
      b += this.pixels[i * 4 + 2]!;
    }
    // Keep the hue, normalized so a dark frame still glows faintly and a
    // bright one doesn't blow out the rig.
    const m = Math.max(r, g, b, 1);
    const level = Math.min(1, (m / 16 / 255) * 2.5);
    this.next.setRGB(r / m, g / m, b / m, THREE.SRGBColorSpace);
    const intensity = this.intensity * (0.35 + 0.65 * level);
    const moved =
      Math.hypot(this.next.r - this.color.r, this.next.g - this.color.g, this.next.b - this.color.b) > THRESHOLD ||
      Math.abs(intensity - this.light.intensity) > this.intensity * 0.15;
    if (!moved) return false;
    this.color.copy(this.next);
    this.light.color.copy(this.color);
    this.light.intensity = intensity;
    return true;
  }
}
