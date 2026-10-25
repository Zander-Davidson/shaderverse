import { describe, expect, it } from 'vitest';
import { spherePatchGeometry, uvToPixel } from '../../src/panels/patch';
import { PanelShape } from '../../src/panels/shape';
import { ringOnly, screenShapeFor } from '../../src/style/chassis';

describe('chassis ring trimming', () => {
  // A status-like panel: rounded, with a circle cut from its left edge.
  const W = 845;
  const H = 993;
  const bezel = 51;
  const outer = new PanelShape(W, H, 66, { x: -300, y: H / 2, r: 420 });
  const screen = screenShapeFor(outer, bezel);
  const full = spherePatchGeometry(0, 0, 3.3, 3.88, 22, 0.08, 34, 39);
  const fullTris = full.getIndex()!.count / 3;
  const trimmed = ringOnly(full.clone(), outer, screen);

  const triangles = (g: typeof full) => {
    const uv = g.getAttribute('uv');
    const idx = g.getIndex()!;
    const out: { x: number; y: number }[][] = [];
    for (let t = 0; t < idx.count; t += 3) {
      out.push([0, 1, 2].map((k) => uvToPixel(uv.getX(idx.getX(t + k)), uv.getY(idx.getX(t + k)), W, H)));
    }
    return out;
  };
  const key = (tri: { x: number; y: number }[]) => tri.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(';');

  it('drops most of the panel', () => {
    expect(trimmed.getIndex()!.count / 3).toBeLessThan(fullTris * 0.5);
  });

  it('keeps every triangle that touches the bezel', () => {
    const kept = new Set(triangles(trimmed).map(key));
    for (const tri of triangles(full)) {
      // Sample the triangle; any point on the bezel means it must be kept.
      const pts = [...tri, { x: (tri[0]!.x + tri[1]!.x + tri[2]!.x) / 3, y: (tri[0]!.y + tri[1]!.y + tri[2]!.y) / 3 }];
      const onBezel = pts.some((p) => outer.contains(p.x, p.y) && !screen.contains(p.x, p.y));
      if (onBezel) expect(kept.has(key(tri))).toBe(true);
    }
  });
});
