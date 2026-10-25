// The sphere interior, the fixed camera, and minimal lighting.

import * as THREE from 'three';
import { wallToWorld } from '../panels/patch';
import type { LayoutConfig } from './layout';

const SHELL_FRAG = /* glsl */ `
varying vec3 vDir;
uniform float radius;
void main() {
  vec3 d = normalize(vDir);
  // Faint latitude / longitude grid on the dome, fading toward the edges.
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = atan(d.x, d.z);
  float step = 0.7 / radius;
  vec2 g = abs(fract(vec2(lon, lat) / step + 0.5) - 0.5) / fwidth(vec2(lon, lat) / step);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  float fade = smoothstep(0.75, 0.0, length(vec2(lon, lat)) * radius / 14.0);
  vec3 base = mix(vec3(0.012, 0.016, 0.022), vec3(0.03, 0.04, 0.05), fade);
  gl_FragColor = vec4(base + vec3(0.06, 0.12, 0.16) * line * fade * 0.5, 1.0);
}
`;

const SHELL_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export class Cockpit {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 500);
  private shell: THREE.Mesh;
  private readonly shellMat: THREE.ShaderMaterial;
  private readonly key: THREE.PointLight;

  constructor(private cfg: LayoutConfig) {
    this.scene.background = new THREE.Color('#020304');
    this.shellMat = new THREE.ShaderMaterial({
      vertexShader: SHELL_VERT,
      fragmentShader: SHELL_FRAG,
      uniforms: { radius: { value: cfg.radius } },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(cfg.radius + 0.05, 96, 64), this.shellMat);
    this.shell.renderOrder = -1;
    this.scene.add(this.shell);

    this.scene.add(new THREE.HemisphereLight('#9fc3d9', '#0b0f12', 0.9));
    this.key = new THREE.PointLight('#d8ecff', 30, 0, 1.6);
    this.scene.add(this.key);
    this.relayout(cfg);
  }

  relayout(cfg: LayoutConfig) {
    this.cfg = cfg;
    this.shell.geometry.dispose();
    this.shell.geometry = new THREE.SphereGeometry(cfg.radius + 0.05, 96, 64);
    this.shellMat.uniforms.radius!.value = cfg.radius;
    this.camera.position.set(0, 0, cfg.radius - cfg.eyeDistance);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, cfg.radius);
    this.key.position.set(-1.5, 2.5, cfg.radius - cfg.eyeDistance + 1);
    this.fit(this.camera.aspect);
  }

  /** Chooses the field of view so the layout's fit rectangle stays in view. */
  fit(aspect: number) {
    const cfg = this.cfg;
    this.camera.aspect = aspect;
    this.camera.updateMatrixWorld();
    const inv = this.camera.matrixWorldInverse;
    let tanV = 0;
    const p = new THREE.Vector3();
    for (const sx of [-1, -0.5, 0, 0.5, 1]) {
      for (const sy of [-1, -0.5, 0, 0.5, 1]) {
        wallToWorld(sx * cfg.fitHalfWidth, sy * cfg.fitHalfHeight, cfg.radius, 0, p).applyMatrix4(inv);
        const depth = -p.z;
        tanV = Math.max(tanV, Math.abs(p.y) / depth, Math.abs(p.x) / depth / aspect);
      }
    }
    this.camera.fov = (2 * Math.atan(tanV * 1.03) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
  }
}
