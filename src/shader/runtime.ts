// Runs the active shader into a square render target. Swaps programs only
// after a successful compile, so a broken edit never interrupts the image.

import * as THREE from 'three';
import { compileShader, type CompileResult } from './compile';
import { VERTEX_SHADER, VIEW_ZOOM_UNIFORM, knobUniformName, type WrapperParam } from './wrapper';

export const QUALITY_SIZES = { low: 384, medium: 640, high: 1024 } as const;
export type Quality = keyof typeof QUALITY_SIZES;

export class ShaderRuntime {
  readonly target: THREE.WebGLRenderTarget;
  /** Number of programs actually swapped in; knob turns must not change it. */
  compileCount = 0;
  time = 0;
  frame = 0;
  playing = true;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private material: THREE.RawShaderMaterial | null = null;
  private params: WrapperParam[] = [];
  private knobValues = new Map<string, number>();
  private mouse = new THREE.Vector4(0, 0, 0, 0);
  private lastDelta = 0;
  /** See VIEW_ZOOM_UNIFORM. */
  private viewZoom = 1;
  /** Set when an input changes, so a paused shader re-renders once. */
  private dirty = true;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    quality: Quality = 'medium',
  ) {
    const size = QUALITY_SIZES[quality];
    this.target = new THREE.WebGLRenderTarget(size, size, {
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get size(): number {
    return this.target.width;
  }

  setQuality(quality: Quality): void {
    const s = QUALITY_SIZES[quality];
    if (s !== this.target.width) this.target.setSize(s, s);
    this.dirty = true;
  }

  /** Compiles `source`; on success swaps it in, otherwise keeps the last good program. */
  setSource(source: string): CompileResult {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const result = compileShader(gl, source);
    if (!result.ok) return result;

    const uniforms: Record<string, THREE.IUniform> = {
      iResolution: { value: new THREE.Vector3() },
      iTime: { value: 0 },
      iTimeDelta: { value: 0 },
      iFrame: { value: 0 },
      iMouse: { value: this.mouse },
      iDate: { value: new THREE.Vector4() },
      [VIEW_ZOOM_UNIFORM]: { value: this.viewZoom },
    };
    for (const p of result.params) {
      uniforms[knobUniformName(p.name)] = { value: this.knobValues.get(p.name) ?? zeroOf(p.type) };
    }
    // Three.js puts its own #defines ahead of raw shader source, so it must
    // emit the #version line itself. The validator compiled the exact source.
    const material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: stripVersion(VERTEX_SHADER),
      fragmentShader: stripVersion(result.fragmentShader),
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.material?.dispose();
    this.material = material;
    this.quad.material = material;
    this.params = result.params;
    this.compileCount++;
    this.dirty = true;
    return result;
  }

  setKnob(param: string, value: number): void {
    this.knobValues.set(param, value);
    this.dirty = true;
    const u = this.material?.uniforms[knobUniformName(param)];
    if (u) u.value = value;
  }

  /** Shows more of the shader's plane, scaled about the center; see VIEW_ZOOM_UNIFORM. */
  setViewZoom(zoom: number): void {
    if (zoom === this.viewZoom) return;
    this.viewZoom = zoom;
    this.dirty = true;
  }

  /** True while the mouse is held in the portal. */
  get mouseHeld(): boolean {
    return this.mouse.z > 0;
  }

  /** Shadertoy mouse: xy while held, zw the click point, negated when released. */
  pointer(x: number, y: number, down: boolean, pressed: boolean): void {
    this.dirty = true;
    // Into the zoomed view's coordinates, the same as fragCoord.
    const c = this.target.width / 2;
    x = (x - c) * this.viewZoom + c;
    y = (y - c) * this.viewZoom + c;
    if (pressed) this.mouse.set(x, y, x, y);
    else if (down) this.mouse.set(x, y, Math.abs(this.mouse.z), -Math.abs(this.mouse.w));
    else this.mouse.set(this.mouse.x, this.mouse.y, -Math.abs(this.mouse.z), -Math.abs(this.mouse.w));
  }

  restart(): void {
    this.time = 0;
    this.frame = 0;
    this.dirty = true;
  }

  render(dt: number): void {
    if (!this.material) return;
    // A paused shader with unchanged inputs would draw the same image.
    if (!this.playing && !this.dirty) return;
    this.dirty = false;
    const step = this.playing ? Math.min(dt, 0.1) : 0;
    this.time += step;
    this.lastDelta = step;
    const u = this.material.uniforms;
    const s = this.target.width;
    (u.iResolution!.value as THREE.Vector3).set(s, s, 1);
    u.iTime!.value = this.time;
    u.iTimeDelta!.value = this.lastDelta;
    u.iFrame!.value = this.frame;
    u[VIEW_ZOOM_UNIFORM]!.value = this.viewZoom;
    const d = new Date();
    (u.iDate!.value as THREE.Vector4).set(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000,
    );
    for (const p of this.params) {
      const ku = u[knobUniformName(p.name)];
      if (ku) ku.value = this.knobValues.get(p.name) ?? zeroOf(p.type);
    }
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);
    if (this.playing) this.frame++;
  }

  /** Re-creates GPU state after a lost context is restored. */
  recompile(source: string): void {
    this.material?.dispose();
    this.material = null;
    this.setSource(source);
  }
}

const stripVersion = (src: string) => src.replace(/^#version 300 es\n/, '');

function zeroOf(type: string): unknown {
  switch (type) {
    case 'vec2':
      return new THREE.Vector2();
    case 'vec3':
      return new THREE.Vector3();
    case 'vec4':
      return new THREE.Vector4();
    default:
      return 0;
  }
}
