// The companion's body on screen: a camera-facing quad on the live overlay
// layer, filled by a raymarched metaball gel with one eye inside it. Low
// graphics draws the same body as a flat field with shading, no raymarch.

import * as THREE from 'three';
import { OVER_LAYER } from '../cockpit/compositor';
import { LOW_GFX } from '../style/quality';
import type { Lobe } from './behavior';

/** Metaballs the shader takes: the core, the orbiting lobes and the droplet. */
const MAX_LOBES = 6;
/** The quad's half size, relative to the bounding radius, so the sphere's silhouette fits. */
const QUAD_PAD = 1.3;

const VERT = /* glsl */ `
varying vec3 vView;
void main() {
  vec4 v = modelViewMatrix * vec4(position, 1.0);
  vView = v.xyz;
  gl_Position = projectionMatrix * v;
}
`;

// All in view space: the camera at the origin looking down -z.
const FRAG = /* glsl */ `
uniform vec4 uLobes[${MAX_LOBES}];
uniform vec4 uEye;
uniform vec3 uGaze;
uniform vec3 uCenter;
uniform vec4 uBound;
uniform float uScale;
uniform float uPupil;
uniform float uLid;
uniform float uGlimmer;
uniform float uAlpha;
uniform float uTime;
varying vec3 vView;

// Bioluminescent: deep violet gel, cyan light inside and at the rim, glowing
// veins; linear color.
const vec3 GEL = vec3(0.32, 0.08, 0.72);
const vec3 GLOW = vec3(0.1, 0.85, 1.0);
const vec3 VEIN = vec3(0.35, 1.0, 0.95);
const vec3 SCLERA = vec3(0.96, 0.91, 0.85);
const vec3 KEY = vec3(-0.48, 0.74, 0.47);
const vec3 RIM = vec3(0.6, -0.78, 0.18);

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float gel(vec3 p) {
  float d = length(p - uLobes[0].xyz) - uLobes[0].w;
  for (int i = 1; i < ${MAX_LOBES}; i++) {
    if (uLobes[i].w <= 0.0) continue;
    d = smin(d, length(p - uLobes[i].xyz) - uLobes[i].w, 0.38 * uScale);
  }
  // The gel bulges over the eye.
  return smin(d, length(p - uEye.xyz) - uEye.w * 1.1, 0.12 * uScale);
}

vec3 gelNormal(vec3 p) {
  vec2 e = vec2(1.0, -1.0) * 0.002 * uScale;
  return normalize(e.xyy * gel(p + e.xyy) + e.yyx * gel(p + e.yyx) + e.yxy * gel(p + e.yxy) + e.xxx * gel(p + e.xxx));
}

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1) * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

/** Nearest hit of a ray from the origin with sphere s, or -1. */
float sphere(vec3 rd, vec4 s) {
  float b = dot(-s.xyz, rd);
  float h = b * b - (dot(s.xyz, s.xyz) - s.w * s.w);
  return h < 0.0 ? -1.0 : -b - sqrt(h);
}

/**
 * The eye at surface normal ne: wet sclera, dark fibrous iris and pupil
 * around the gaze, a cornea highlight, and the membrane lid sliding across.
 */
vec3 eye(vec3 ne, vec3 hv) {
  float ang = acos(clamp(dot(ne, uGaze), -1.0, 1.0));
  float pupilA = mix(0.16, 0.34, uPupil);
  const float irisA = 0.5;
  vec3 col = mix(SCLERA, vec3(0.55, 0.4, 0.95), smoothstep(1.0, 2.1, ang) * 0.55);
  vec3 t = normalize(cross(uGaze, abs(uGaze.y) > 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0)));
  float phi = atan(dot(ne, cross(uGaze, t)), dot(ne, t));
  float fiber = 0.5 + 0.5 * sin(phi * 23.0 + sin(phi * 7.0) * 2.0);
  vec3 iris = mix(vec3(0.1, 0.025, 0.02), vec3(0.6, 0.22, 0.08), fiber * smoothstep(pupilA, irisA, ang));
  // A thin bright ring where the iris meets the white.
  col += vec3(0.9, 0.55, 0.4) * (1.0 - smoothstep(0.0, 0.05, abs(ang - irisA - 0.03))) * 0.25;
  col = mix(col, iris, 1.0 - smoothstep(irisA - 0.02, irisA + 0.02, ang));
  col = mix(col, vec3(0.0), 1.0 - smoothstep(pupilA - 0.015, pupilA + 0.015, ang));
  col *= 0.5 + 0.5 * max(dot(ne, KEY), 0.0);
  col += vec3(1.0) * pow(max(dot(ne, hv), 0.0), 200.0) * 2.2;
  if (uGlimmer >= 0.0) {
    float sweep = dot(ne, normalize(vec3(1.0, 0.55, 0.3))) - mix(-0.8, 0.9, uGlimmer);
    col += vec3(1.0, 0.95, 0.9) * (1.0 - smoothstep(0.0, 0.07, abs(sweep))) * 0.5 * sin(3.14159 * uGlimmer);
  }
  // Nictitating membrane: slides across from the side, milky and translucent.
  vec3 side = normalize(vec3(1, 0, 0) - uGaze * uGaze.x);
  float cover = smoothstep(-0.05, 0.05, dot(ne, side) - (1.15 - 2.3 * uLid));
  col = mix(col, vec3(0.6, 0.5, 0.95) * (0.55 + 0.45 * max(dot(ne, KEY), 0.0)), cover * 0.9);
  return col;
}

#ifndef LOW
void main() {
  vec3 rd = normalize(vView);
  float tb = sphere(rd, uBound);
  if (tb < 0.0) discard;
  float t = max(tb, 0.0);
  float tEnd = tb + 2.0 * uBound.w;
  bool hit = false;
  for (int i = 0; i < 56; i++) {
    float d = gel(rd * t);
    if (d < 0.0015 * uScale) { hit = true; break; }
    t += d;
    if (t > tEnd) break;
  }
  if (!hit) discard;
  vec3 p = rd * t;
  vec3 n = gelNormal(p);
  vec3 v = -rd;
  vec3 key = normalize(KEY);
  vec3 hv = normalize(key + v);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float spec = pow(max(dot(n, hv), 0.0), 90.0);
  float rim = pow(max(dot(n, normalize(normalize(RIM) + v)), 0.0), 40.0);

  // Light trapped in the gel: more where the ray passes through more of it.
  float thick = 0.0;
  for (int i = 1; i <= 4; i++) thick += max(-gel(p + rd * float(i) * 0.18 * uScale), 0.0);
  thick /= 0.6 * uScale;
  vec3 col = GEL * (0.25 + 0.5 * max(dot(n, key), 0.0)) + GLOW * smoothstep(0.0, 1.2, thick) * 0.3;

  // Faint veins inside, seen through the surface.
  vec3 rr = refract(rd, n, 0.75);
  float vein = 0.0;
  for (int i = 1; i <= 3; i++) {
    vec3 q = p + rr * float(i) * 0.16 * uScale;
    if (gel(q) > 0.0) break;
    float w = abs(noise((q - uCenter) / uScale * 3.2 + vec3(0.0, 0.0, uTime * 0.05)) - 0.5);
    vein += (1.0 - smoothstep(0.0, 0.045, w)) * 0.6 / float(i);
  }
  col += VEIN * clamp(vein, 0.0, 1.0) * 0.5;
  col += GLOW * fres * 0.7 + vec3(0.9, 0.4, 1.0) * rim * 0.3;
  float alpha = mix(0.84, 1.0, fres);

  // The eye inside: the thin gel over it adds its highlight.
  float te = sphere(rd, uEye);
  if (te > 0.0) {
    col = mix(eye(normalize(rd * te - uEye.xyz), hv), col, 0.08);
    alpha = 1.0;
  }
  col += vec3(1.0) * spec * 1.1;
  gl_FragColor = vec4(col, alpha * uAlpha);
  #include <colorspace_fragment>
}
#else
// Low graphics: the metaballs as a flat field on the quad, shaded from its gradient.
void main() {
  vec2 p = vView.xy * (uCenter.z / vView.z);
  float f = 0.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < ${MAX_LOBES}; i++) {
    vec4 l = uLobes[i];
    if (l.w <= 0.0) continue;
    // Each lobe as seen on the body's plane.
    vec2 d = p - l.xy * (uCenter.z / l.z);
    float q = max(dot(d, d), 1e-6);
    f += l.w * l.w / q;
    g += -2.0 * l.w * l.w * d / (q * q);
  }
  float edge = smoothstep(0.92, 1.08, f);
  if (edge <= 0.0) discard;
  vec3 n = normalize(vec3(-g * uScale * 0.3, 1.0));
  vec3 key = normalize(KEY);
  vec3 hv = normalize(key + vec3(0, 0, 1));
  float fres = pow(1.0 - n.z, 2.0);
  vec3 col = GEL * (0.3 + 0.5 * max(dot(n, key), 0.0)) + GLOW * 0.3 * smoothstep(1.0, 3.0, f);
  col += GLOW * fres * 0.5 + vec3(1.0) * pow(max(dot(n, hv), 0.0), 60.0) * 0.7;
  // The eye as a disc; its iris slides toward the gaze.
  vec2 e = (p - uEye.xy * (uCenter.z / uEye.z)) / uEye.w;
  float r = length(e);
  if (r < 1.0) {
    vec3 ne = vec3(e, sqrt(1.0 - r * r));
    col = mix(eye(ne, hv), col, 0.08);
  }
  gl_FragColor = vec4(col, edge * mix(0.88, 1.0, fres) * uAlpha);
  #include <colorspace_fragment>
}
#endif
`;

export interface BodyPose {
  /** World center and radius. */
  center: THREE.Vector3;
  radius: number;
  lobes: Lobe[];
  /** Gaze: sideways components, (0, 0) at the camera. */
  gazeX: number;
  gazeY: number;
  pupil: number;
  lid: number;
  glimmer: number;
  alpha: number;
  time: number;
}

export class CompanionBody {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly lobes = Array.from({ length: MAX_LOBES }, () => new THREE.Vector4());
  private readonly view = new THREE.Vector3();
  private readonly toCam = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  /** Bounding radius in world units, for hit testing. */
  private bound = 1;
  private radius = 1;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: LOW_GFX ? { LOW: '' } : {},
      uniforms: {
        uLobes: { value: this.lobes },
        uEye: { value: new THREE.Vector4() },
        uGaze: { value: new THREE.Vector3(0, 0, 1) },
        uCenter: { value: new THREE.Vector3() },
        uBound: { value: new THREE.Vector4() },
        uScale: { value: 1 },
        uPupil: { value: 0.3 },
        uLid: { value: 0 },
        uGlimmer: { value: -1 },
        uAlpha: { value: 1 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.layers.set(OVER_LAYER);
    this.mesh.renderOrder = 10;
    this.mesh.frustumCulled = false;
  }

  /** Places the quad facing the camera and sets this frame's shader inputs. */
  update(camera: THREE.Camera, pose: BodyPose): void {
    const u = this.material.uniforms;
    const R = pose.radius;
    this.radius = R;
    const c = this.view.copy(pose.center).applyMatrix4(camera.matrixWorldInverse);
    u.uCenter!.value.copy(c);
    u.uScale!.value = R;
    // Lobes are laid out on the view axes, around the center.
    let bound = 0;
    for (let i = 0; i < MAX_LOBES; i++) {
      const l = pose.lobes[i];
      if (!l) {
        this.lobes[i]!.set(0, 0, 0, 0);
        continue;
      }
      this.lobes[i]!.set(c.x + l.x * R, c.y + l.y * R, c.z + l.z * R, l.r * R);
      bound = Math.max(bound, (Math.hypot(l.x, l.y, l.z) + l.r) * R);
    }
    // The eye faces the camera, set forward in the core and rolled a little
    // toward where it looks.
    this.toCam.copy(c).negate().normalize();
    this.right.set(0, 1, 0).cross(this.toCam).normalize();
    this.up.copy(this.toCam).cross(this.right);
    const gz = Math.sqrt(Math.max(0, 1 - pose.gazeX ** 2 - pose.gazeY ** 2));
    const gaze = (u.uGaze!.value as THREE.Vector3)
      .copy(this.toCam)
      .multiplyScalar(gz)
      .addScaledVector(this.right, pose.gazeX)
      .addScaledVector(this.up, pose.gazeY)
      .normalize();
    const eyeR = 0.32 * R;
    const e = new THREE.Vector3()
      .copy(c)
      .addScaledVector(this.toCam, 0.42 * R)
      .addScaledVector(gaze, 0.06 * R);
    e.addScaledVector(this.right, pose.gazeX * 0.14 * R).addScaledVector(
      this.up,
      pose.gazeY * 0.14 * R,
    );
    u.uEye!.value.set(e.x, e.y, e.z, eyeR);
    bound = Math.max(bound, e.distanceTo(c) + eyeR * 1.1) + 0.12 * R;
    this.bound = bound;
    u.uBound!.value.set(c.x, c.y, c.z, bound);
    u.uPupil!.value = pose.pupil;
    u.uLid!.value = pose.lid;
    u.uGlimmer!.value = pose.glimmer;
    u.uAlpha!.value = pose.alpha;
    u.uTime!.value = pose.time;
    this.mesh.visible = pose.alpha > 0.002;
    this.mesh.position.copy(pose.center);
    this.mesh.quaternion.copy((camera as THREE.Object3D).quaternion);
    this.mesh.scale.setScalar(bound * QUAD_PAD);
    this.mesh.updateMatrixWorld();
  }

  /** True if texture coordinate (u, v) on the quad is on the body itself. */
  covers(u: number, v: number): boolean {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2 * this.bound * QUAD_PAD;
    return this.mesh.visible && d < this.radius * 0.95;
  }
}
