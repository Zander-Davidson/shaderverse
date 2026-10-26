import { describe, expect, it } from 'vitest';
import { PanelShape, screenShapeFor } from '../../src/panels/shape';
import { wallShape } from '../../src/style/console';

describe('console molding shapes', () => {
  // A status-like panel: 3.3 × 3.88 wall units at 256 px per unit, with a
  // circle cut from its left edge.
  const rect = { x: 5.6, y: 2.06, w: 3.3, h: 3.88 };
  const W = 845;
  const H = 993;
  const outer = new PanelShape(W, H, 97, { x: -300, y: H / 2, r: 420 });

  it('maps the outline to wall units around the panel center', () => {
    const s = wallShape(rect, W, H, outer);
    expect(s.cx).toBe(rect.x);
    expect(s.cy).toBe(rect.y);
    expect(s.hw).toBeCloseTo((W / 2 - 3) * (rect.w / W));
    expect(s.hh).toBeCloseTo((H / 2 - 3) * (rect.h / H));
    expect(s.corner).toBeCloseTo(97 * (rect.w / W));
  });

  it('places the cut circle in wall coordinates, y up', () => {
    const s = wallShape(rect, W, H, outer);
    expect(s.cut!.x).toBeCloseTo(rect.x - rect.w / 2 - 300 * (rect.w / W));
    expect(s.cut!.y).toBeCloseTo(rect.y);
    expect(s.cut!.r).toBeCloseTo(420 * (rect.w / W));
  });

  it('shrinks the screen opening by the bezel on every side', () => {
    const bezel = 51;
    const o = wallShape(rect, W, H, outer);
    const s = wallShape(rect, W, H, screenShapeFor(outer, bezel));
    const k = rect.w / W;
    expect(o.hw - s.hw).toBeCloseTo(bezel * k);
    expect(s.cut!.r - o.cut!.r).toBeCloseTo(bezel * k);
  });

  it('has no cut for plain panels', () => {
    expect(wallShape(rect, W, H, new PanelShape(W, H, 40, null)).cut).toBeNull();
  });
});
