import { describe, expect, it } from 'vitest';
import { layoutCircuit } from '../../src/cockpit/hull';
import { DEFAULT_LAYOUT, bezelRadius } from '../../src/cockpit/layout';

describe('hull circuit', () => {
  const cfg = structuredClone(DEFAULT_LAYOUT);
  const { traces, nodes } = layoutCircuit(cfg);

  it('is the same on every load', () => {
    expect(layoutCircuit(cfg)).toEqual({ traces, nodes });
  });

  it('starts at the portal collar and runs outward', () => {
    expect(traces.length).toBeGreaterThan(15);
    const r = (p: [number, number]) => Math.hypot(p[0] - cfg.portal.x, p[1] - cfg.portal.y);
    for (const t of traces) {
      expect(r(t.points[0]!)).toBeGreaterThan(bezelRadius(cfg));
      expect(r(t.points[t.points.length - 1]!)).toBeGreaterThan(r(t.points[0]!));
    }
  });

  it('is asymmetric: no two traces mirror each other', () => {
    const ends = traces.map((t) => t.points[t.points.length - 1]!);
    const mirrored = ends.filter(([x, y]) => ends.some(([u, v]) => Math.abs(u + x - 2 * cfg.portal.x) < 0.05 && Math.abs(v - y) < 0.05 && Math.abs(x - cfg.portal.x) > 0.1));
    expect(mirrored.length).toBe(0);
  });
});
