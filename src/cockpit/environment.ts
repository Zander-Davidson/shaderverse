// What the chrome reflects: the rest of the pod, all around and behind the
// pilot. The pod is a ball like the dome ahead, so its hull is laid out on a
// sphere whose pole sits behind the pilot: curved bands of greebled plates
// (blocks, vents, conduits), structural rings and ribs, and a round hatch at
// the pole, lit low and warm with a few round lamps and dim readouts. Built
// once and baked into the environment map; the console faces the pilot, so it
// mostly mirrors the hemisphere behind them, which gets the finest detail.

import * as THREE from 'three';

/** A small deterministic PRNG, so the pod is the same on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hull radius. */
const R = 7;
/** Angle from the pole where the hatch ends and the plating starts. */
const HATCH = 0.16;
/** Width of a band of plates, in radians: finer in the hemisphere behind the pilot. */
const bandWidth = (theta: number) => (theta < Math.PI / 2 ? 0.075 + 0.05 * (theta / (Math.PI / 2)) : 0.16);

const glow = (color: string, intensity: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });

export function cockpitEnvironment(): THREE.Scene {
  const scene = new THREE.Scene();
  const hull = new THREE.Group();
  // Pole a little off the line of sight, so the rings don't sit dead center.
  hull.rotation.set(0.14, -0.2, 0.3);
  scene.add(hull);
  const rand = mulberry32(23);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  // Dark, slightly warm gunmetal over a wide range of values, so the plates
  // read as separate parts in the chrome without lighting the pod up.
  const metals = ['#121211', '#201f1d', '#34312d', '#514b44', '#7d756b'].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.4, roughness: 0.5 }),
  );
  // Mostly warm: amber and ember, with teal for the instruments.
  const lamps = [glow('#ffb35c', 2.4), glow('#ff7a3a', 2), glow('#3ff2c4', 1.8), glow('#ff4d3d', 1.8), glow('#ffd59a', 2)];
  const screens = [glow('#0d2e30', 1.6), glow('#2c1c08', 1.8), glow('#0a2a22', 1.6)];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
  // Cylinder axis is +y; turn it to stand out of the hull (local +z).
  disc.rotateX(Math.PI / 2);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.01, 64, 32),
    new THREE.MeshStandardMaterial({ color: '#0b0b0b', metalness: 0.4, roughness: 0.6, side: THREE.BackSide }),
  );
  scene.add(shell);

  // Hull coordinates: theta from the pole behind the pilot, phi around it,
  // and height h in from the hull.
  const at = (theta: number, phi: number, h: number, out: THREE.Vector3) => {
    const r = R - h;
    return out.set(r * Math.sin(theta) * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi), -r * Math.cos(theta));
  };
  /** A part on the hull: sa across the band (phi), sb along it (theta), depth inward. */
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, theta: number, phi: number, sa: number, sb: number, depth: number, lift: number) => {
    const m = new THREE.Mesh(geo, mat);
    at(theta, phi, lift + depth / 2, m.position);
    // Local +y along the meridian, +z facing the pod's center.
    m.up.set(Math.cos(theta) * Math.cos(phi), Math.cos(theta) * Math.sin(phi), Math.sin(theta));
    m.lookAt(0, 0, 0);
    m.scale.set(sa, sb, depth);
    hull.add(m);
  };

  const plate = (theta: number, phi: number, sa: number, sb: number) => {
    const r = rand();
    const lit = theta < Math.PI / 2 ? 0.07 : 0.035;
    if (r < lit * 0.5) {
      // A round lamp or gauge in a raised bezel.
      const rr = Math.min(sa, sb) * (0.18 + rand() * 0.1);
      part(box, pick(metals), theta, phi, sa, sb, 0.08, 0);
      part(disc, metals[3]!, theta, phi, rr * 2.5, rr * 2.5, 0.08, 0.08);
      if (rand() < 0.5) {
        part(disc, pick(lamps), theta, phi, rr * 2, rr * 2, 0.02, 0.16);
      } else {
        // Gauge: a dim face with a glowing needle.
        part(disc, pick(screens), theta, phi, rr * 2, rr * 2, 0.02, 0.16);
        part(box, pick(lamps), theta, phi, rr * 0.08, rr * 0.8, 0.01, 0.18);
      }
      return;
    }
    if (r < lit) {
      // A small dim readout.
      part(box, pick(metals), theta, phi, sa, sb, 0.1, 0);
      part(box, pick(screens), theta, phi, sa * 0.6, sb * 0.4, 0.02, 0.1);
      return;
    }
    // Machinery: a plate, often with a smaller block, vents or a round boss on it.
    const d = 0.04 + rand() ** 2 * 0.45;
    part(box, pick(metals), theta, phi, sa, sb, d, 0);
    const extra = rand();
    if (extra < 0.3) {
      part(box, pick(metals), theta, phi, sa * (0.3 + rand() * 0.4), sb * (0.3 + rand() * 0.4), 0.05 + rand() * 0.25, d);
    } else if (extra < 0.5) {
      // Vent slats, across the band.
      const n = 3 + Math.floor(rand() * 4);
      const span = (sb / R) * 0.8;
      for (let i = 0; i < n; i++) part(box, metals[1]!, theta - span / 2 + (span * (i + 0.5)) / n, phi, sa * 0.8, (sb * 0.4) / n, 0.04, d);
    } else if (extra < 0.6) {
      part(disc, metals[2]!, theta, phi, Math.min(sa, sb) * 0.5, Math.min(sa, sb) * 0.5, 0.06, d);
    }
  };

  // Bands of plates from the pole outward, each cut into plates about as
  // long as it is wide, some split again along the band.
  let theta = HATCH;
  while (theta < Math.PI - 0.12) {
    const dt = bandWidth(theta) * (0.8 + rand() * 0.5);
    const tc = theta + dt / 2;
    const ring = 2 * Math.PI * R * Math.sin(tc);
    const n = Math.max(6, Math.round(ring / (dt * R * (1 + rand() * 1.5))));
    const offset = rand() * 2 * Math.PI;
    const dp = (2 * Math.PI) / n;
    const sa = dp * R * Math.sin(tc) - 0.04;
    const sb = dt * R;
    for (let i = 0; i < n; i++) {
      const pc = offset + (i + 0.5) * dp;
      if (rand() < 0.3) {
        plate(tc - dt / 4, pc, sa, sb / 2 - 0.04);
        plate(tc + dt / 4, pc, sa, sb / 2 - 0.04);
      } else {
        plate(tc, pc, sa, sb - 0.04);
      }
    }
    theta += dt;
  }

  // Structural rings around the pole and ribs running out from it: the
  // curves that make the pod read as a ball in the chrome.
  const frame = metals[2]!;
  for (const t of [HATCH, 0.42, 0.8, 1.25, 1.75, 2.3]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry((R - 0.35) * Math.sin(t), 0.07, 8, 96), frame);
    ring.position.z = -(R - 0.35) * Math.cos(t);
    hull.add(ring);
  }
  const ribGeo = new THREE.TorusGeometry(R - 0.3, 0.06, 8, 96, Math.PI - 2 * HATCH);
  for (let i = 0; i < 8; i++) {
    // The torus arc starts on +x in its own plane: start it at the hatch,
    // stand that plane up through the pole axis, then turn it around the pole.
    const rib = new THREE.Mesh(ribGeo, frame);
    rib.rotation.z = -Math.PI / 2 + HATCH;
    const upright = new THREE.Group();
    upright.rotation.x = Math.PI / 2;
    upright.add(rib);
    const around = new THREE.Group();
    around.rotation.z = (i / 8) * Math.PI * 2;
    around.add(upright);
    hull.add(around);
  }

  // The hatch at the pole behind the pilot: stepped round plates and a ring
  // of small lamps.
  for (const [r, h, mat] of [
    [1.1, 0.12, metals[1]!],
    [0.85, 0.22, metals[3]!],
    [0.55, 0.3, metals[0]!],
    [0.2, 0.34, metals[2]!],
  ] as const) {
    part(disc, mat, 0, 0, r * 2, r * 2, h, 0);
  }
  for (let i = 0; i < 6; i++) part(disc, lamps[0]!, HATCH * 0.8, (i / 6) * Math.PI * 2, 0.07, 0.07, 0.02, 0.12);

  // Low, warm lights, so the sides of every plate and block catch a little
  // light or fall dark: a dim pod, lit by its instruments.
  for (const [x, y, z, c, i] of [
    [0, 4, -4.5, '#ffc38a', 40],
    [-4.5, -2, -4.5, '#ff9a5c', 26],
    [4.5, 1, -4.5, '#3ff2c4', 14],
    [0, 3.5, 2.5, '#ffd0a0', 30],
    [0, -4, 0, '#ff8a4a', 14],
  ] as const) {
    const l = new THREE.PointLight(c, i, 16, 2);
    l.position.set(x, y, z);
    scene.add(l);
  }
  return scene;
}

/**
 * What the monitors' glass reflects: the pod without its detail, a dim warm
 * room with a few broad, soft light strips, so the glass reads as glossy
 * without busy greebles and lamps sliding over the screens.
 */
export function glassEnvironment(): THREE.Scene {
  const scene = new THREE.Scene();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(R, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      // Darkest below, a faint warm wash above and behind the pilot.
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float up = vDir.y * 0.5 + 0.5;
          vec3 c = mix(vec3(0.012, 0.011, 0.01), vec3(0.07, 0.055, 0.04), smoothstep(0.3, 1.0, up));
          c += vec3(0.03, 0.025, 0.02) * smoothstep(0.0, -1.0, vDir.z);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(shell);
  // Soft strips: one long one overhead behind the pilot, two short, dimmer
  // ones off to the sides, none square to anything.
  for (const [x, y, z, w, h, rz, i] of [
    [0.6, 4.6, -3.2, 7, 1.1, 0.12, 0.55],
    [-5.2, 1.2, -2.6, 1.0, 3.4, -0.2, 0.25],
    [4.8, 2.4, -1.4, 0.8, 2.4, 0.3, 0.18],
  ] as const) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2c2').multiplyScalar(i), side: THREE.DoubleSide }),
    );
    strip.position.set(x, y, z);
    strip.lookAt(0, 0, 0);
    strip.rotateZ(rz);
    scene.add(strip);
  }
  return scene;
}
