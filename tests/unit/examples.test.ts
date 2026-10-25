import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../../examples';
import { createProjectStore } from '../../src/project/store';
import { analyze } from '../../src/source/mainImage';

describe('starter examples', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.name}: every signature parameter has tuned knob metadata`, () => {
      const project = ex.create();
      const a = analyze(project.source);
      if (!a.ok) throw new Error(a.reason);
      expect(a.info.knobParams.length).toBeGreaterThan(0);
      expect(a.info.knobParams.map((p) => [p.name, p.type])).toEqual(
        project.knobs.map((k) => [k.param, k.type]),
      );
      // Loading through the store keeps the metadata rather than defaulting it.
      const loaded = createProjectStore(project).getState().project.knobs;
      expect(loaded).toEqual(project.knobs);
      for (const k of loaded) {
        expect(k.min).toBeLessThan(k.max);
        expect(k.value).toBeGreaterThanOrEqual(k.min);
        expect(k.value).toBeLessThanOrEqual(k.max);
        expect(k.label.length).toBeLessThanOrEqual(14);
        expect(k.slot).toBeGreaterThanOrEqual(0);
      }
      expect(new Set(loaded.map((k) => k.slot)).size).toBe(loaded.length);
    });
  }
});
