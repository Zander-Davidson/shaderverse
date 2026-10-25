// Sphere-patch math. Pure functions so they can be unit tested; panels never
// see curvature, only the mesh does.

import * as THREE from 'three';

/**
 * World position of wall point (x, y) on a sphere of `radius` centered at the
 * origin, `inset` toward the center. The camera looks down +z at (0, 0, radius),
 * so its right is world -x; wall x is mirrored to keep +x on the right.
 */
export function wallToWorld(x: number, y: number, radius: number, inset = 0, out = new THREE.Vector3()) {
  const az = x / radius;
  const el = y / radius;
  const r = radius - inset;
  return out.set(-r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az));
}

/** A patch of the sphere's inner surface centered at wall point (cx, cy). */
export function spherePatchGeometry(
  cx: number,
  cy: number,
  w: number,
  h: number,
  radius: number,
  inset = 0,
  segX = 48,
  segY = 48,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const v = new THREE.Vector3();
  for (let j = 0; j <= segY; j++) {
    const tv = j / segY;
    for (let i = 0; i <= segX; i++) {
      const tu = i / segX;
      wallToWorld(cx + (tu - 0.5) * w, cy + (tv - 0.5) * h, radius, inset, v);
      positions.push(v.x, v.y, v.z);
      uvs.push(tu, tv);
    }
  }
  const row = segX + 1;
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * row + i;
      // Wound to face the sphere's center (the camera).
      indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Texture coordinate (v up) to panel pixel (y down). */
export function uvToPixel(u: number, v: number, width: number, height: number): { x: number; y: number } {
  return { x: u * width, y: (1 - v) * height };
}
