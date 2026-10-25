import { describe, expect, it } from 'vitest';
import { spherePatchGeometry, uvToPixel, wallToWorld } from '../../src/panels/patch';
import { quantize } from '../../src/knobs/knobs';

describe('sphere patch math', () => {
  it('puts the wall origin straight ahead at the radius', () => {
    const p = wallToWorld(0, 0, 20);
    expect([p.x, p.y, p.z]).toEqual([-0, 0, 20]);
  });

  it('preserves arc length along the wall and mirrors x for the camera', () => {
    const r = 20;
    const p = wallToWorld(2, 0, r);
    expect(Math.atan2(-p.x, p.z) * r).toBeCloseTo(2, 6);
    expect(p.x).toBeLessThan(0);
    expect(p.length()).toBeCloseTo(r, 6);
    expect(wallToWorld(0, 1, r, 0.5).length()).toBeCloseTo(r - 0.5, 6);
  });

  it('is nearly flat for a very large radius', () => {
    const g = spherePatchGeometry(0, 0, 4, 2, 1e6);
    const pos = g.getAttribute('position');
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minZ = Math.min(minZ, pos.getZ(i));
      maxZ = Math.max(maxZ, pos.getZ(i));
    }
    expect(maxZ - minZ).toBeLessThan(1e-4);
  });

  it('bows toward the center when curved', () => {
    const g = spherePatchGeometry(0, 0, 4, 2, 10, 0, 2, 2);
    const pos = g.getAttribute('position');
    // Corner (index 0) is nearer the camera (smaller z) than the center (index 4).
    expect(pos.getZ(0)).toBeLessThan(pos.getZ(4));
  });

  it('faces the sphere center', () => {
    const g = spherePatchGeometry(0, 0, 4, 2, 10);
    const n = g.getAttribute('normal');
    expect(n.getZ(0)).toBeLessThan(0);
  });

  it('maps texture coordinates to panel pixels with y down', () => {
    expect(uvToPixel(0, 1, 200, 100)).toEqual({ x: 0, y: 0 });
    expect(uvToPixel(0.5, 0.5, 200, 100)).toEqual({ x: 100, y: 50 });
    expect(uvToPixel(1, 0, 200, 100)).toEqual({ x: 200, y: 100 });
  });
});

describe('knob values', () => {
  it('clamps and snaps to the step', () => {
    expect(quantize({ min: 0, max: 1, step: 0, type: 'float' }, 1.5)).toBe(1);
    expect(quantize({ min: 0, max: 1, step: 0.25, type: 'float' }, 0.3)).toBe(0.25);
    expect(quantize({ min: 0, max: 10, step: 1, type: 'int' }, 3.6)).toBe(4);
  });
});
