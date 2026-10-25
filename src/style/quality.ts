// Graphics quality. `?gfx=low` drops the expensive extras (chrome backdrop,
// area lights, clearcoat and thin-film iridescence) for weak or software GPUs,
// including the browser tests.

import * as THREE from 'three';

export const LOW_GFX = typeof location !== 'undefined' && new URLSearchParams(location.search).get('gfx') === 'low';

/** A physical material that sheds its costliest layers in low quality. */
export function physicalMaterial(params: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
  if (!LOW_GFX) return new THREE.MeshPhysicalMaterial(params);
  return new THREE.MeshPhysicalMaterial({ ...params, clearcoat: 0, iridescence: 0 });
}
