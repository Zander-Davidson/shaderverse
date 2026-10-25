// Projects a mesh's vertices to a screen rectangle, for placing flat overlays
// over the panel or knob they belong to. The camera is fixed, so this is stable.

import * as THREE from 'three';

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const v = new THREE.Vector3();

export function screenBounds(mesh: THREE.Mesh, camera: THREE.Camera, canvas: HTMLCanvasElement): ScreenRect {
  const pos = mesh.geometry.getAttribute('position');
  const r = canvas.getBoundingClientRect();
  const out: ScreenRect = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(camera);
    const x = r.left + ((v.x + 1) / 2) * r.width;
    const y = r.top + ((1 - v.y) / 2) * r.height;
    out.left = Math.min(out.left, x);
    out.right = Math.max(out.right, x);
    out.top = Math.min(out.top, y);
    out.bottom = Math.max(out.bottom, y);
  }
  return out;
}

export function screenPoint(p: THREE.Vector3, camera: THREE.Camera, canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  v.copy(p).project(camera);
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}
